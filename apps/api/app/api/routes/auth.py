from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.schemas.auth import AuthSessionRead, LoginRequest
from app.services.auth import auth_is_configured, require_authenticated_owner, validate_request_origin, verify_owner_password

router = APIRouter(prefix="/auth", tags=["auth"])


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@router.post("/login", response_model=AuthSessionRead)
def login(payload: LoginRequest, request: Request, response: Response) -> AuthSessionRead:
    no_store(response)
    validate_request_origin(request)
    if not verify_owner_password(payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid owner password")
    request.session.clear()
    request.session["owner"] = "owner"
    return AuthSessionRead(authenticated=True, owner="owner")


@router.post("/logout", response_model=AuthSessionRead)
def logout(request: Request, response: Response, _owner: str = Depends(require_authenticated_owner)) -> AuthSessionRead:
    no_store(response)
    validate_request_origin(request)
    request.session.clear()
    return AuthSessionRead(authenticated=False, configured=auth_is_configured())


@router.get("/session", response_model=AuthSessionRead)
def get_session(request: Request, response: Response) -> AuthSessionRead:
    no_store(response)
    configured = auth_is_configured()
    authenticated = configured and request.session.get("owner") == "owner"
    return AuthSessionRead(authenticated=authenticated, owner="owner" if authenticated else None, configured=configured)
