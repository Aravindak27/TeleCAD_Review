"""
routers/issues_router.py — CRUD endpoints for drawing issues.

GET    /issues/{drawing_id}   → list all issues for a drawing
POST   /issues/               → create a new issue (manager only)
PUT    /issues/{id}/resolve   → toggle resolved flag (manager only)   ← MUST be before /{id}
PUT    /issues/{id}           → update an issue (manager only)
DELETE /issues/{id}           → delete an issue (manager only)
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from sqlalchemy.orm import Session

from database import get_db, Issue, Drawing
from auth import get_current_user, require_manager
from database import User

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class IssueCreate(BaseModel):
    drawing_id: int
    type:       str
    severity:   str   # Critical | Warning | Info
    message:    str
    position_x: Optional[float] = 0.0
    position_y: Optional[float] = 0.0
    page_index: Optional[int]   = 0
    is_comment: Optional[bool]  = False


class IssueUpdate(BaseModel):
    type:       Optional[str]   = None
    severity:   Optional[str]   = None
    message:    Optional[str]   = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    page_index: Optional[int]   = None
    is_comment: Optional[bool]  = None


class IssueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         int
    drawing_id: int
    type:       str
    severity:   str
    message:    str
    position_x: float
    position_y: float
    page_index: int
    created_by: str
    resolved:   bool
    is_comment: bool


# ─── Endpoints (order matters — specific paths before generic {id}) ───────────

@router.post("", response_model=IssueResponse, status_code=201)
async def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an issue on a drawing (Manager or Employee)."""
    drawing = db.query(Drawing).filter(Drawing.id == payload.drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")

    # Access control
    if current_user.role == "employee":
        if drawing.uploaded_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if drawing.assigned_manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    issue = Issue(
        drawing_id=payload.drawing_id,
        type=payload.type,
        severity=payload.severity,
        message=payload.message,
        position_x=payload.position_x or 0.0,
        position_y=payload.position_y or 0.0,
        page_index=payload.page_index or 0,
        is_comment=payload.is_comment or False,
        created_by="Manager" if current_user.role == "manager" else "Employee",
    )
    db.add(issue)

    # Mark drawing as under review if it was still pending
    if drawing.status == "pending" and current_user.role == "manager":
        drawing.status = "reviewed"
    drawing.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(issue)
    return issue


@router.get("/{drawing_id}", response_model=List[IssueResponse])
async def list_issues(
    drawing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all issues for a drawing (visible to both roles)."""
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

    return db.query(Issue).filter(Issue.drawing_id == drawing_id).all()

# ── IMPORTANT: /resolve must appear BEFORE /{issue_id} to avoid route shadowing ──

@router.put("/{issue_id}/resolve", response_model=IssueResponse)
async def resolve_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the resolved state of an issue (Both roles)."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    drawing = db.query(Drawing).filter(Drawing.id == issue.drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role == "employee":
        if drawing.uploaded_by != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if drawing.assigned_manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    issue.resolved = not issue.resolved
    drawing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(issue)
    return issue


@router.put("/{issue_id}", response_model=IssueResponse)
async def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing issue. Employees can only update their own issues."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    drawing = db.query(Drawing).filter(Drawing.id == issue.drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role == "employee":
        if drawing.uploaded_by != current_user.id or issue.created_by != "Employee":
            raise HTTPException(status_code=403, detail="Access denied: Cannot edit manager issues")
    else:
        if drawing.assigned_manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    if payload.type       is not None: issue.type       = payload.type
    if payload.severity   is not None: issue.severity   = payload.severity
    if payload.message    is not None: issue.message    = payload.message
    if payload.position_x is not None: issue.position_x = payload.position_x
    if payload.position_y is not None: issue.position_y = payload.position_y
    if payload.page_index is not None: issue.page_index = payload.page_index
    if payload.is_comment is not None: issue.is_comment = payload.is_comment

    drawing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/{issue_id}")
async def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an issue. Employees can only delete their own issues."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    drawing = db.query(Drawing).filter(Drawing.id == issue.drawing_id).first()
    if not drawing:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role == "employee":
        if drawing.uploaded_by != current_user.id or issue.created_by != "Employee":
            raise HTTPException(status_code=403, detail="Access denied: Cannot delete manager issues")
    else:
        if drawing.assigned_manager_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    db.delete(issue)
    drawing.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Issue deleted successfully", "id": issue_id}
