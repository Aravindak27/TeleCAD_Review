"""
database.py — SQLAlchemy ORM models and database session management.

Models:
  • User     — employee and manager accounts
  • Drawing  — uploaded CAD files with review status
  • Issue    — manager-annotated issues on a drawing
"""

from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String,
    Float, Boolean, Text, DateTime, ForeignKey
)
from sqlalchemy import text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

# ─── Database setup ──────────────────────────────────────────────────────────

DATABASE_URL = "sqlite:///./telecom_cad.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─── Models ──────────────────────────────────────────────────────────────────

class User(Base):
    """User account for employee and manager roles."""
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), nullable=False)
    email           = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(String(20), nullable=False)   # "employee" | "manager"
    notif_email_approved = Column(Boolean, default=True)
    notif_email_sent_back = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    drawings = relationship(
        "Drawing",
        back_populates="uploader",
        foreign_keys="Drawing.uploaded_by",
    )
    assigned_drawings = relationship(
        "Drawing",
        back_populates="assigned_manager",
        foreign_keys="Drawing.assigned_manager_id",
    )


class Drawing(Base):
    """Uploaded CAD drawing with lifecycle tracking."""
    __tablename__ = "drawings"

    id              = Column(Integer, primary_key=True, index=True)
    filename        = Column(String(255), nullable=False)
    original_path   = Column(String(500), nullable=False)  # Stored upload path
    dxf_path        = Column(String(500))                  # Converted DXF path
    image_path      = Column(String(500))                  # Rendered PNG path
    status          = Column(String(20), default="pending")
    # Status lifecycle: pending → reviewed → approved | sent_back
    manager_comment = Column(Text)                         # Comment on send-back
    uploaded_by     = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    thread_id       = Column(Integer, nullable=True)       # Root drawing id for version thread
    thread_name     = Column(String(255), nullable=True)   # Folder name
    version         = Column(Integer, default=1)
    is_latest       = Column(Boolean, default=True)
    deleted_by_manager = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    uploader = relationship(
        "User",
        back_populates="drawings",
        foreign_keys=[uploaded_by],
    )
    assigned_manager = relationship(
        "User",
        back_populates="assigned_drawings",
        foreign_keys=[assigned_manager_id],
    )
    issues   = relationship("Issue", back_populates="drawing", cascade="all, delete-orphan")


class Issue(Base):
    """Engineering issue on a drawing (manager-created)."""
    __tablename__ = "issues"

    id          = Column(Integer, primary_key=True, index=True)
    drawing_id  = Column(Integer, ForeignKey("drawings.id"), nullable=False)
    type        = Column(String(50), nullable=False)       # e.g. Tower / Antenna / Equipment
    severity    = Column(String(20), nullable=False)       # Critical / Warning / Info
    message     = Column(Text, nullable=False)
    position_x  = Column(Float, default=0.0)
    position_y  = Column(Float, default=0.0)
    created_by  = Column(String(20), default="Manager")    # always "Manager" for new rows
    resolved    = Column(Boolean, default=False)
    page_index  = Column(Integer, default=0)               # Page index for multi-page docs
    is_comment  = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    drawing = relationship("Drawing", back_populates="issues")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_db():
    """FastAPI dependency: yields a DB session, always closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Create all tables and perform lightweight SQLite migrations.

    This project does not use Alembic; instead we add new nullable columns
    as needed so existing local databases keep working.
    """
    Base.metadata.create_all(bind=engine)

    # ── Lightweight migrations for existing SQLite DB ───────────────────────
    # Only additive/nullable changes here.
    with engine.begin() as conn:
        # users table: add notification preferences
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
        if "notif_email_approved" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN notif_email_approved BOOLEAN DEFAULT 1"))
            conn.execute(text("UPDATE users SET notif_email_approved = 1 WHERE notif_email_approved IS NULL"))
        if "notif_email_sent_back" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN notif_email_sent_back BOOLEAN DEFAULT 1"))
            conn.execute(text("UPDATE users SET notif_email_sent_back = 1 WHERE notif_email_sent_back IS NULL"))

        # drawings table: assignment + versioning
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(drawings)")).fetchall()}
        if "assigned_manager_id" not in cols:
            conn.execute(text("ALTER TABLE drawings ADD COLUMN assigned_manager_id INTEGER"))
        if "thread_id" not in cols:
            conn.execute(text("ALTER TABLE drawings ADD COLUMN thread_id INTEGER"))
        if "thread_name" not in cols:
            conn.execute(text("ALTER TABLE drawings ADD COLUMN thread_name VARCHAR(255)"))
        if "version" not in cols:
            conn.execute(text("ALTER TABLE drawings ADD COLUMN version INTEGER DEFAULT 1"))
            conn.execute(text("UPDATE drawings SET version = 1 WHERE version IS NULL"))
        if "is_latest" not in cols:
            conn.execute(text("ALTER TABLE drawings ADD COLUMN is_latest BOOLEAN DEFAULT 1"))
            conn.execute(text("UPDATE drawings SET is_latest = 1 WHERE is_latest IS NULL"))
        if "deleted_by_manager" not in cols:
            conn.execute(text("ALTER TABLE drawings ADD COLUMN deleted_by_manager BOOLEAN DEFAULT 0"))
            conn.execute(text("UPDATE drawings SET deleted_by_manager = 0 WHERE deleted_by_manager IS NULL"))

        # Backfill thread_id for existing rows: each drawing is its own thread root
        conn.execute(text("UPDATE drawings SET thread_id = id WHERE thread_id IS NULL"))

        # issues table: support for multi-page
        issue_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(issues)")).fetchall()}
        if "page_index" not in issue_cols:
            conn.execute(text("ALTER TABLE issues ADD COLUMN page_index INTEGER DEFAULT 0"))
        if "is_comment" not in issue_cols:
            conn.execute(text("ALTER TABLE issues ADD COLUMN is_comment BOOLEAN DEFAULT 0"))
