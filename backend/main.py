"""
main.py — FastAPI application entry point.

Mounts:
  * /auth      — signup / login
  * /drawings  — upload and manage CAD drawings
  * /issues    — manager CRUD for drawing issues (manual annotation)
  * /uploads   — static file serving for rendered images
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from database import init_db, SessionLocal, User
from auth import SECRET_KEY, ALGORITHM
from jose import jwt
from notification_manager import manager
from routers import auth_router, drawings_router, issues_router

# ─── Upload directories ───────────────────────────────────────────────────────
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")

# ─── Lifespan (replaces deprecated @app.on_event) ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    os.makedirs(os.path.join(UPLOAD_DIR, "dxf"),    exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)
    print("[OK] Telecom CAD System started — database initialised")
    yield
    # Shutdown (nothing needed)

# ─── Application ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Telecom CAD Review & Annotation System",
    description=(
        "Telecom CAD drawing review with rendered previews and collaborative "
        "manager annotation (manual issues and workflow status)."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    # Dev-friendly: Vite may switch ports (5173→5174…) if occupied.
    # Allow localhost/127.0.0.1 on any port for local development.
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static files (rendered drawings) ────────────────────────────────────────
os.makedirs(os.path.join(UPLOAD_DIR, "dxf"),    exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "images"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth_router.router,     prefix="/auth",     tags=["Authentication"])
app.include_router(drawings_router.router, prefix="/drawings",  tags=["Drawings"])
app.include_router(issues_router.router,   prefix="/issues",    tags=["Issues"])

# ─── Health ──────────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "Telecom CAD Review & Annotation System",
        "status":  "running",
        "version": "1.0.0",
        "docs":    "/docs",
    }

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}

# ─── WebSockets Notifications ────────────────────────────────────────────────
@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            await websocket.close(code=1008)
            return
        user = db.query(User).filter(User.email == email).first()
        if not user:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
    finally:
        db.close()

    await manager.connect(user.id, websocket)
    try:
        while True:
            # Receive data (used as ping/keepalive check)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception:
        manager.disconnect(user.id, websocket)

