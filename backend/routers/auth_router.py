"""
routers/auth_router.py — Signup and Login endpoints.

POST /auth/signup  → create user, return JWT
POST /auth/login   → verify credentials, return JWT
GET  /auth/me      → return current user info
"""

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import get_db, User
from auth import (
    hash_password, verify_password,
    create_access_token, ACCESS_TOKEN_EXPIRE_HOURS,
    get_current_user,
)

router = APIRouter()


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name:     str
    email:    str
    password: str
    role:     str   # "employee" | "manager"


class LoginRequest(BaseModel):
    email:    str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:    int
    name:  str
    email: str
    role:  str
    notif_email_approved: bool = True
    notif_email_sent_back: bool = True


class ManagerListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:    int
    name:  str
    email: str


class AuthResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserResponse


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class PreferencesUpdate(BaseModel):
    notif_email_approved: bool
    notif_email_sent_back: bool


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse, status_code=201)
async def signup(payload: UserCreate, db: Session = Depends(get_db)):
    """Register a new user and return a JWT access token."""
    if payload.role not in ("employee", "manager"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be 'employee' or 'manager'",
        )

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        {"sub": user.email},
        timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    )
    return AuthResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate existing user and return a JWT access token."""
    user = db.query(User).filter(User.email == credentials.email).first()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(
        {"sub": user.email},
        timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    )
    return AuthResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.get("/managers", response_model=list[ManagerListItem])
async def list_managers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all manager accounts (for employee assignment)."""
    return (
        db.query(User)
        .filter(User.role == "manager")
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if not payload.new_password or len(payload.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 6 characters")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated"}

@router.put("/preferences", response_model=UserResponse)
async def update_preferences(
    payload: PreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update notification preferences for the current user."""
    current_user.notif_email_approved = payload.notif_email_approved
    current_user.notif_email_sent_back = payload.notif_email_sent_back
    db.commit()
    db.refresh(current_user)
    return current_user
