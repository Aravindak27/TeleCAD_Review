"""
auth.py — Authentication utilities.

Provides:
  * Password hashing / verification (direct bcrypt — passlib skipped for Python 3.14 compat)
  * JWT access-token creation / decoding (python-jose)
  * FastAPI dependencies: get_current_user, require_manager
"""

import os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db, User

# ─── Config ──────────────────────────────────────────────────────────────────

SECRET_KEY                = os.getenv("SECRET_KEY", "telecom-cad-secret-key-change-me")
ALGORITHM                 = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ─── Password utilities (direct bcrypt — bypasses passlib/bcrypt 5.x conflict) ─

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the password (bytes → stored as str)."""
    pw_bytes = password.encode("utf-8")[:72]        # bcrypt hard limit
    salt     = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plain-text password against stored bcrypt hash.
    Falls back to passlib for hashes created before the bcrypt 5.x migration.
    """
    try:
        pw_bytes   = plain.encode("utf-8")[:72]
        hash_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        # Fallback: try passlib for old hashes (pre-migration)
        try:
            from passlib.context import CryptContext
            _ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
            return _ctx.verify(plain, hashed)
        except Exception:
            return False


# ─── JWT utilities ────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Encode a JWT access token with an expiry claim."""
    payload = data.copy()
    expire  = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db:    Session = Depends(get_db),
) -> User:
    """Decode JWT and return the active User row, or raise 401."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise exc
    except JWTError:
        raise exc

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise exc
    return user


async def require_manager(current_user: User = Depends(get_current_user)) -> User:
    """Ensure the authenticated user has the 'manager' role."""
    if current_user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager role required for this action",
        )
    return current_user
