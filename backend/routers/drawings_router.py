"""
routers/drawings_router.py — Drawing upload, listing, detail, status, and history.

POST /drawings/upload        → upload DXF, run pipeline, return image (issues are manager-added only)
GET  /drawings/              → list current drawings (employee: own; manager: assigned)
GET  /drawings/{id}          → drawing detail with issues and image
PUT  /drawings/{id}/status   → manager approves or sends back
GET  /drawings/{id}/rerender → re-render image with current issues
GET  /drawings/history       → list all drawing versions (role-scoped)
"""

import os
import shutil
import uuid
import base64
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, BackgroundTasks
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import get_db, Drawing, Issue, User
from auth import get_current_user, require_manager
from cad.converter import prepare_dxf, generate_demo_dxf
from cad.extractor import extract_drawing_data
from cad.visualizer import render_drawing
from cad.media_processor import process_pdf_to_images
from email_service import send_status_email

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
BASE_URL   = os.getenv("BASE_URL", "http://localhost:8000")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         int
    drawing_id: int
    type:       str
    severity:   str
    message:    str
    position_x: float
    position_y: float
    created_by: str
    resolved:   bool


class DrawingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              int
    filename:        str
    status:          str
    manager_comment: Optional[str]
    uploaded_by:     int
    assigned_manager_id: Optional[int] = None
    thread_id:       Optional[int] = None
    thread_name:     Optional[str] = None
    version:         int = 1
    is_latest:       bool = True
    created_at:      datetime
    updated_at:      Optional[datetime] = None


class DrawingListItem(BaseModel):
    """List view item with helpful display fields."""
    model_config = ConfigDict(from_attributes=True)

    id:              int
    filename:        str
    status:          str
    uploaded_by:     int
    employee_name:   str
    assigned_manager_id: Optional[int] = None
    manager_name:    Optional[str] = None
    thread_id:       Optional[int] = None
    thread_name:     Optional[str] = None
    version:         int = 1
    is_latest:       bool = True
    created_at:      datetime
    updated_at:      Optional[datetime] = None


class DrawingDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    drawing:     DrawingOut
    issues:      List[IssueOut]
    image_url:   Optional[str]
    image_b64:   Optional[str]
    image_b64s:  List[str] = []
    bounds:      dict


class StatusUpdate(BaseModel):
    status:          str   # "approved" | "sent_back"
    manager_comment: Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def upload_drawing(
    file: UploadFile = File(None),
    use_demo: bool = Form(False),
    assigned_manager_id: Optional[int] = Form(None),
    thread_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a DXF/DWG file, run the processing pipeline, and return:
      - Drawing record
      - Rendered image (Base64 PNG)
      - Drawing bounds (for coordinate mapping in the frontend)

    Issues are not auto-generated; managers add them via /issues after review.

    DWG files are automatically converted via ODA File Converter.
    Pipeline failures (extract / render) are non-fatal — the drawing is
    still saved and a partial result is returned.
    """
    drawing_uid = str(uuid.uuid4())[:8]

    dxf_dir = os.path.join(UPLOAD_DIR, "dxf")
    img_dir = os.path.join(UPLOAD_DIR, "images")
    os.makedirs(dxf_dir, exist_ok=True)
    os.makedirs(img_dir, exist_ok=True)

    # ── 0. Validate assignment / thread for non-demo uploads ─────────────────
    assigned_manager = None
    if not use_demo and file is not None:
        if assigned_manager_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="assigned_manager_id is required",
            )
        assigned_manager = (
            db.query(User)
            .filter(User.id == assigned_manager_id, User.role == "manager")
            .first()
        )
        if not assigned_manager:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected manager not found",
            )

    # ── 1. File handling & format conversion ─────────────────────────────────
    image_b64s = []
    img_path_str = None
    
    if use_demo or file is None:
        filename  = f"demo_{drawing_uid}.dxf"
        dxf_path  = os.path.join(dxf_dir, filename)
        orig_path = dxf_path
        generate_demo_dxf(dxf_path)
        
        try:
            drawing_data = extract_drawing_data(dxf_path)
        except Exception:
            drawing_data = {"entities": [], "bounds": {}, "stats": {"total_entities": 0}}
            
        img_path  = os.path.join(img_dir, f"{drawing_uid}.png")
        try:
            img_b64 = render_drawing(dxf_path, [], drawing_data, output_path=img_path)
            if img_b64:
                image_b64s.append(img_b64)
                img_path_str = img_path
        except Exception:
            pass

    else:
        orig_filename = file.filename or "upload.dxf"
        ext = orig_filename.lower().split('.')[-1]
        filename      = f"{drawing_uid}_{orig_filename}"
        orig_path     = os.path.join(dxf_dir, filename)

        with open(orig_path, "wb") as fh:
            shutil.copyfileobj(file.file, fh)

        drawing_data = {"entities": [], "bounds": {"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 800}, "stats": {"total_entities": 0}}

        if ext in ['dxf', 'dwg']:
            dxf_path = os.path.join(dxf_dir, f"{drawing_uid}.dxf")
            try:
                prepare_dxf(orig_path, dxf_path)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc))
                
            try:
                drawing_data = extract_drawing_data(dxf_path)
            except Exception:
                pass
                
            img_path = os.path.join(img_dir, f"{drawing_uid}.png")
            try:
                img_b64 = render_drawing(dxf_path, [], drawing_data, output_path=img_path)
                if img_b64:
                    image_b64s.append(img_b64)
                    img_path_str = img_path
            except Exception:
                pass
                
        elif ext == 'pdf':
            dxf_path = None
            try:
                paths = process_pdf_to_images(orig_path, img_dir, drawing_uid)
                img_path_str = ",".join(paths)
                for p in paths:
                    with open(p, "rb") as f:
                        image_b64s.append(base64.b64encode(f.read()).decode("utf-8"))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(exc)}")
                
        elif ext in ['png', 'jpg', 'jpeg']:
            dxf_path = None
            img_path = os.path.join(img_dir, f"{drawing_uid}.{ext}")
            shutil.copyfile(orig_path, img_path)
            img_path_str = img_path
            with open(img_path, "rb") as f:
                image_b64s.append(base64.b64encode(f.read()).decode("utf-8"))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format.")

    # ── 4. Persist to database (supports version threads) ─────────────────────
    display_name = file.filename if (file and file.filename) else filename

    # Determine thread + version rules
    version = 1
    resolved_thread_id: Optional[int] = None
    prev_latest: Optional[Drawing] = None

    def generate_thread_name(fname: str) -> str:
        name_no_ext = fname.rsplit('.', 1)[0] if '.' in fname else fname
        name_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', name_no_ext)
        name_clean = re.sub(r'\s+', ' ', name_clean).strip()
        if name_clean:
            return name_clean[0].upper() + name_clean[1:]
        return "Untitled Folder"

    if thread_id is not None:
        # Re-upload flow: find the latest sent_back drawing in this thread.
        prev_latest = (
            db.query(Drawing)
            .filter(
                Drawing.thread_id == thread_id,
                Drawing.uploaded_by == current_user.id,
                Drawing.status == "sent_back",
            )
            .order_by(Drawing.version.desc())
            .first()
        )
        if not prev_latest:
            # Fallback: look for the is_latest drawing in the thread
            prev_latest = (
                db.query(Drawing)
                .filter(
                    Drawing.thread_id == thread_id,
                    Drawing.is_latest == True,  # noqa: E712
                    Drawing.uploaded_by == current_user.id,
                )
                .first()
            )
        if not prev_latest:
            raise HTTPException(status_code=404, detail="Thread not found")
        if prev_latest.status != "sent_back":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only sent_back drawings can be re-uploaded",
            )
        # Assignment must remain the same (or be provided and match)
        if assigned_manager_id is None:
            assigned_manager_id = prev_latest.assigned_manager_id
        if assigned_manager_id != prev_latest.assigned_manager_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Manager must match the original assignment",
            )
        resolved_thread_id = prev_latest.thread_id
        version = int(prev_latest.version or 1) + 1
        resolved_thread_name = prev_latest.thread_name or generate_thread_name(prev_latest.filename)
    else:
        resolved_thread_name = generate_thread_name(display_name)

    drawing = Drawing(
        filename=display_name,
        original_path=orig_path,
        dxf_path=dxf_path,
        image_path=img_path_str,
        status="draft",
        manager_comment=None,
        uploaded_by=current_user.id,
        assigned_manager_id=assigned_manager_id,
        thread_id=resolved_thread_id,  # set after insert if new thread
        thread_name=resolved_thread_name,
        version=version,
        is_latest=True,
        updated_at=datetime.utcnow(),
    )
    db.add(drawing)
    db.commit()
    db.refresh(drawing)

    # If it was a fresh upload, make it its own thread root
    if drawing.thread_id is None:
        drawing.thread_id = drawing.id
        db.commit()
        db.refresh(drawing)

    # If versioned re-upload, retire previous latest — keep files for history viewing.
    if prev_latest is not None:
        prev_latest.is_latest = False
        prev_latest.status = "older_version"
        prev_latest.updated_at = datetime.utcnow()
        db.commit()

    return {
        "drawing": DrawingOut.model_validate(drawing),
        "issues":  [],
        "image_b64": image_b64s[0] if image_b64s else None,
        "image_b64s": image_b64s,
        "image_url": f"{BASE_URL}/uploads/images/{drawing_uid}.png",
        "bounds":    drawing_data.get("bounds", {}),
        "stats":     drawing_data.get("stats", {}),
    }


@router.get("/", response_model=List[DrawingListItem])
async def list_drawings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List current drawings — employees see their own; managers see assigned."""
    q = db.query(Drawing)
    if current_user.role == "employee":
        q = q.filter(Drawing.uploaded_by == current_user.id)
    else:
        q = q.filter(Drawing.assigned_manager_id == current_user.id)
        q = q.filter(Drawing.status != "draft")
        q = q.filter(Drawing.deleted_by_manager == False)

    rows = q.order_by(Drawing.updated_at.desc()).all()
    out: list[DrawingListItem] = []
    for d in rows:
        employee = db.query(User).filter(User.id == d.uploaded_by).first()
        manager = db.query(User).filter(User.id == d.assigned_manager_id).first() if d.assigned_manager_id else None
        out.append(
            DrawingListItem(
                id=d.id,
                filename=d.filename,
                status=d.status,
                uploaded_by=d.uploaded_by,
                employee_name=employee.name if employee else "Unknown",
                assigned_manager_id=d.assigned_manager_id,
                manager_name=manager.name if manager else None,
                thread_id=d.thread_id,
                thread_name=d.thread_name,
                version=d.version or 1,
                is_latest=bool(d.is_latest),
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
        )
    return out


class HistoryRow(BaseModel):
    id: int
    thread_id: Optional[int] = None
    thread_name: Optional[str] = None
    version: int
    filename: str
    status: str
    manager_comment: Optional[str] = None
    employee_name: str
    manager_name: Optional[str] = None
    updated_at: Optional[datetime] = None
    created_at: datetime


@router.get("/history", response_model=list[HistoryRow])
async def history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """History of all drawing versions for the current user (role-scoped)."""
    q = db.query(Drawing)
    if current_user.role == "employee":
        q = q.filter(Drawing.uploaded_by == current_user.id)
    else:
        q = q.filter(Drawing.assigned_manager_id == current_user.id)
        q = q.filter(Drawing.status != "draft")
        q = q.filter(Drawing.deleted_by_manager == False)

    rows = q.order_by(Drawing.updated_at.desc(), Drawing.created_at.desc()).all()
    out: list[HistoryRow] = []
    for d in rows:
        employee = db.query(User).filter(User.id == d.uploaded_by).first()
        manager = db.query(User).filter(User.id == d.assigned_manager_id).first() if d.assigned_manager_id else None
        out.append(
            HistoryRow(
                id=d.id,
                thread_id=d.thread_id,
                thread_name=d.thread_name,
                version=d.version or 1,
                filename=d.filename,
                status=d.status,
                manager_comment=d.manager_comment,
                employee_name=employee.name if employee else "Unknown",
                manager_name=manager.name if manager else None,
                updated_at=d.updated_at,
                created_at=d.created_at,
            )
        )
    return out


@router.get("/{drawing_id}")
async def get_drawing(
    drawing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full drawing detail including rendered image and current issues."""
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    # Access control
    if current_user.role == "employee":
        if drawing.uploaded_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if drawing.assigned_manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Build image base64s from stored paths
    image_b64s = []
    if drawing.image_path:
        for p in drawing.image_path.split(','):
            if os.path.exists(p):
                with open(p, "rb") as f:
                    image_b64s.append(base64.b64encode(f.read()).decode("utf-8"))
    
    image_b64 = image_b64s[0] if image_b64s else None

    issues = db.query(Issue).filter(Issue.drawing_id == drawing_id).all()

    # Extract bounds from drawing (or use defaults)
    bounds = {"min_x": 0, "min_y": 0, "max_x": 1000, "max_y": 800}
    if drawing.dxf_path and os.path.exists(drawing.dxf_path):
        try:
            dd = extract_drawing_data(drawing.dxf_path)
            bounds = dd.get("bounds", bounds)
        except Exception:
            pass

    return {
        "drawing":   DrawingOut.model_validate(drawing),
        "issues":    [IssueOut.model_validate(i) for i in issues],
        "image_b64": image_b64,
        "image_b64s": image_b64s,
        "image_url": f"{BASE_URL}/uploads/images/{os.path.basename(drawing.image_path.split(',')[0])}" if drawing.image_path else None,
        "bounds":    bounds,
    }


@router.put("/{drawing_id}/status")
async def update_status(
    drawing_id: int,
    payload: StatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    manager: User = Depends(require_manager),
):
    """Manager approves a drawing or sends it back with comments."""
    if payload.status not in ("approved", "sent_back", "reviewed"):
        raise HTTPException(status_code=400, detail="Invalid status value")

    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    if drawing.assigned_manager_id != manager.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if drawing.status == "older_version":
        raise HTTPException(status_code=400, detail="Cannot change status of an older version drawing")

    drawing.status          = payload.status
    drawing.manager_comment = payload.manager_comment
    drawing.updated_at      = datetime.utcnow()

    db.commit()
    db.refresh(drawing)
    
    # ── Notification Email Routing ──
    if payload.status in ("approved", "sent_back"):
        employee = db.query(User).filter(User.id == drawing.uploaded_by).first()
        if employee:
            should_send = False
            if payload.status == "approved" and employee.notif_email_approved:
                should_send = True
            elif payload.status == "sent_back" and employee.notif_email_sent_back:
                should_send = True
                
            if should_send:
                background_tasks.add_task(
                    send_status_email,
                    to_email=employee.email,
                    employee_name=employee.name,
                    filename=drawing.filename,
                    new_status=payload.status,
                    manager_name=manager.name,
                    manager_comment=payload.manager_comment
                )

    return {"message": f"Drawing status updated to '{payload.status}'",
            "drawing": DrawingOut.model_validate(drawing)}


@router.put("/{drawing_id}/submit")
async def submit_drawing(
    drawing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Employee submits a drafted drawing to manager."""
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    if current_user.role != "employee" or drawing.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if drawing.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft drawings can be submitted")
    
    drawing.status = "pending"
    drawing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(drawing)
    return {"message": "Drawing submitted successfully", "drawing": DrawingOut.model_validate(drawing)}


@router.delete("/{drawing_id}")
async def delete_drawing(
    drawing_id: int,
    delete_thread: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a drawing or an entire drawing thread.
    """
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    thread_id = drawing.thread_id or drawing.id

    # Access control: employee can delete own; manager can delete assigned.
    if current_user.role == "employee":
        if drawing.uploaded_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
            
        if delete_thread:
            rows = db.query(Drawing).filter(Drawing.thread_id == thread_id).all()
            for d in rows:
                if d.status not in ("draft", "pending", "approved", "older_version"):
                    raise HTTPException(status_code=403, detail="Cannot delete folder: it contains drawings under review or with revisions needed.")
        else:
            if drawing.status not in ("draft", "pending", "approved", "older_version"):
                raise HTTPException(status_code=403, detail="Employees can only delete drawings in draft, pending, approved or older version state")
            rows = [drawing]

        deleted_ids: list[int] = []
        for d in rows:
            # delete issues
            db.query(Issue).filter(Issue.drawing_id == d.id).delete()
            # delete files (best-effort)
            for p in (d.original_path, d.dxf_path, d.image_path):
                try:
                    if p and os.path.exists(p):
                        os.remove(p)
                except Exception:
                    pass
            deleted_ids.append(d.id)
            db.delete(d)

        if not delete_thread and drawing.is_latest:
            remaining = db.query(Drawing).filter(Drawing.thread_id == thread_id).order_by(Drawing.version.desc()).first()
            if remaining:
                remaining.is_latest = True

        db.commit()
        return {"message": "Deleted", "thread_id": thread_id, "deleted_ids": deleted_ids}
    else:
        if drawing.assigned_manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
            
        # Soft delete for manager
        if delete_thread:
            rows = db.query(Drawing).filter(Drawing.thread_id == thread_id).all()
            for d in rows:
                if d.status == "reviewed":
                    raise HTTPException(status_code=403, detail="Cannot delete folder: it contains a drawing currently under review.")
        else:
            if drawing.status == "reviewed":
                raise HTTPException(status_code=403, detail="Cannot delete a drawing currently under review. Wait for Approval or Send Back.")
            rows = [drawing]
            
        deleted_ids: list[int] = []
        for d in rows:
            d.deleted_by_manager = True
            deleted_ids.append(d.id)
            
        db.commit()
        return {"message": "Drawing thread hidden from manager view", "thread_id": thread_id, "deleted_ids": deleted_ids}


@router.get("/{drawing_id}/rerender")
async def rerender_drawing(
    drawing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-render the drawing PNG with current issues from the database."""
    drawing = db.query(Drawing).filter(Drawing.id == drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    if not drawing.dxf_path or not os.path.exists(drawing.dxf_path):
        image_b64s = []
        if drawing.image_path:
            for p in drawing.image_path.split(','):
                if os.path.exists(p):
                    with open(p, "rb") as f:
                        image_b64s.append(base64.b64encode(f.read()).decode("utf-8"))
        return {"image_b64": image_b64s[0] if image_b64s else None, "image_b64s": image_b64s, "message": "No DXF to render, returning existing."}

    issues = db.query(Issue).filter(Issue.drawing_id == drawing_id).all()
    issue_list = [
        {"type": i.type, "severity": i.severity, "message": i.message,
         "position_x": i.position_x, "position_y": i.position_y}
        for i in issues
    ]

    drawing_data = extract_drawing_data(drawing.dxf_path)
    image_b64 = render_drawing(
        drawing.dxf_path, issue_list, drawing_data,
        output_path=drawing.image_path.split(',')[0] if drawing.image_path else None,
    )

    return {"image_b64": image_b64, "image_b64s": [image_b64] if image_b64 else [], "message": "Re-render successful"}
