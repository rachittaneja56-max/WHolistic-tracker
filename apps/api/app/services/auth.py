from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

import jwt
from fastapi import HTTPException, Request, status
from jwt import PyJWKClient
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings
from app.db.session import engine


@dataclass(frozen=True)
class AuthPrincipal:
    user_id: UUID
    session_id: UUID
    email: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role in {"admin", "root_admin"}

    @property
    def is_root_admin(self) -> bool:
        configured_email = (settings.root_admin_email or "").strip().lower()
        return self.role == "root_admin" and bool(configured_email) and self.email.lower() == configured_email


_jwks = PyJWKClient(settings.auth_jwks_url, cache_keys=True, cache_jwk_set=True, lifespan=3600)
PUBLIC_EXACT_PATHS = {
    "/health",
    "/openapi.json",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
    "/integrations/dsa/extension/exchange",
    "/integrations/dsa/extension/import-batches",
}
PUBLIC_PREFIXES = ("/webhooks/github/",)


def _unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _decode_token(raw_token: str) -> dict:
    try:
        signing_key = _jwks.get_signing_key_from_jwt(raw_token)
        return jwt.decode(
            raw_token,
            signing_key.key,
            algorithms=["EdDSA"],
            audience=settings.auth_jwt_audience,
            issuer=settings.auth_jwt_issuer,
            options={"require": ["exp", "iat", "iss", "aud"]},
            leeway=15,
        )
    except Exception as exc:
        raise _unauthorized("Invalid or expired access token") from exc


def authenticate_bearer(authorization: str | None) -> AuthPrincipal:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized()
    payload = _decode_token(token)
    try:
        user_id = UUID(str(payload["userId"]))
        session_id = UUID(str(payload["sessionId"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise _unauthorized("Access token is missing identity claims") from exc

    with engine.connect() as connection:
        row = connection.execute(
            text(
                'SELECT u.email, COALESCE(u.role, \'user\') AS role, COALESCE(u.banned, false) AS banned, '
                's."expiresAt" AS expires_at '
                'FROM auth."session" s JOIN auth."user" u ON u.id = s."userId" '
                'WHERE s.id = :session_id AND u.id = :user_id'
            ),
            {"session_id": session_id, "user_id": user_id},
        ).mappings().one_or_none()
    if row is None or row["banned"] or row["expires_at"] <= datetime.now(timezone.utc):
        raise _unauthorized("Session is expired or revoked")
    if str(payload.get("email", "")).lower() != str(row["email"]).lower():
        raise _unauthorized("Account identity changed")
    return AuthPrincipal(user_id=user_id, session_id=session_id, email=row["email"], role=row["role"])


def require_authenticated_user(request: Request) -> AuthPrincipal:
    principal = getattr(request.state, "principal", None)
    if not isinstance(principal, AuthPrincipal):
        raise _unauthorized()
    return principal


def require_admin(request: Request) -> AuthPrincipal:
    principal = require_authenticated_user(request)
    if not principal.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return principal


def require_root_admin(request: Request) -> AuthPrincipal:
    principal = require_authenticated_user(request)
    if not principal.is_root_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Root administrator access required")
    return principal


def require_authenticated_owner(request: Request) -> str:
    return str(require_authenticated_user(request).user_id)


def require_owner_mutation(request: Request) -> str:
    return require_authenticated_owner(request)


class AuthenticationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/") or "/"
        is_public = request.method == "OPTIONS" or path in PUBLIC_EXACT_PATHS or any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)
        if not is_public:
            try:
                request.state.principal = authenticate_bearer(request.headers.get("authorization"))
            except HTTPException as exc:
                return JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail},
                    headers=exc.headers or {},
                )
        response = await call_next(request)
        if path not in {"/health"}:
            response.headers.setdefault("Cache-Control", "no-store")
        return response
