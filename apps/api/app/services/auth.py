from __future__ import annotations

from fastapi import HTTPException, Request, status
from pwdlib import PasswordHash

from app.core.config import settings

password_hash = PasswordHash.recommended()


def auth_is_configured() -> bool:
    return bool((settings.app_admin_password_hash or "").strip() and (settings.app_session_secret or "").strip())


def verify_owner_password(password: str) -> bool:
    configured_hash = (settings.app_admin_password_hash or "").strip()
    if not auth_is_configured() or not configured_hash:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Owner authentication is not configured")
    try:
        return password_hash.verify(password, configured_hash)
    except Exception:
        return False


def validate_request_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin:
        return
    allowed = {settings.frontend_origin.rstrip("/"), *[item.rstrip("/") for item in settings.cors_origins]}
    if origin.rstrip("/") not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Request origin is not allowed")


def require_authenticated_owner(request: Request) -> str:
    if not auth_is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Owner authentication is not configured")
    if request.session.get("owner") != "owner":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Owner authentication required")
    return "owner"


def require_owner_mutation(request: Request) -> str:
    owner = require_authenticated_owner(request)
    validate_request_origin(request)
    return owner
