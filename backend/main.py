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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from database import init_db
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
