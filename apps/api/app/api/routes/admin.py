from __future__ import annotations

import hashlib
import secrets
import csv
import io
import socket
from urllib import request as url_request
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.admin import AdminAuditLog, Invitation, PasswordResetToken, SystemSetting, UsageDaily, UserQuota
from app.services.auth import AuthPrincipal, require_admin, require_root_admin

router = APIRouter(prefix="/admin", tags=["admin"])


class InviteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    role: Literal["user", "admin"] = "user"


class UserAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str | None = Field(default=None, max_length=500)
    ban_expires_at: datetime | None = None


class UserRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "admin"]


class UserDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation_email: EmailStr


class SystemSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: dict[str, Any]


class QuotaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_entities: int | None = Field(default=None, ge=1, le=10_000_000)
    max_assistant_messages: int | None = Field(default=None, ge=1, le=10_000_000)
    max_ai_requests_per_day: int | None = Field(default=None, ge=1, le=100_000)


def _audit(db: Session, request: Request, principal: AuthPrincipal, action: str, target: UUID | None = None, details: dict | None = None) -> None:
    db.add(
        AdminAuditLog(
            id=uuid4(),
            actor_user_id=principal.user_id,
            target_user_id=target,
            action=action,
            ip_address=request.client.host if request.client else None,
            details={**(details or {}), "actor_email": str(principal.email)},
        )
    )


def _user(db: Session, user_id: UUID) -> dict:
    row = db.execute(
        text('SELECT id, name, email, "emailVerified" AS email_verified, COALESCE(role, \'user\') AS role, COALESCE(banned, false) AS banned, "banReason" AS ban_reason, "banExpires" AS ban_expires, "createdAt" AS created_at, "updatedAt" AS updated_at FROM auth."user" WHERE id = :id'),
        {"id": user_id},
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


def _protect_root(user: dict) -> None:
    configured_email = (settings.root_admin_email or "").strip().lower()
    if (configured_email and str(user["email"]).lower() == configured_email) or user["role"] == "root_admin":
        raise HTTPException(status_code=409, detail="The root administrator account is protected")


def _protect_root_from_other_admins(user: dict, actor: AuthPrincipal) -> None:
    configured_email = (settings.root_admin_email or "").strip().lower()
    is_root = (configured_email and str(user["email"]).lower() == configured_email) or user["role"] == "root_admin"
    if is_root and not actor.is_root_admin:
        raise HTTPException(status_code=403, detail="Only the root administrator can manage root sessions or credentials")


@router.get("/overview")
def overview(db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> dict:
    now = datetime.now(timezone.utc)
    user_counts = db.execute(
        text(
            'SELECT count(*) AS total, count(*) FILTER (WHERE NOT COALESCE(banned, false)) AS active, count(*) FILTER (WHERE COALESCE(banned, false)) AS banned, '
            'count(*) FILTER (WHERE "createdAt" >= :week) AS new_7d FROM auth."user"'
        ),
        {"week": now - timedelta(days=7)},
    ).mappings().one()
    activity = db.execute(
        text(
            'SELECT count(DISTINCT "userId") FILTER (WHERE "updatedAt" >= :day) AS active_24h, '
            'count(DISTINCT "userId") FILTER (WHERE "updatedAt" >= :week) AS active_7d, '
            'count(DISTINCT "userId") FILTER (WHERE "updatedAt" >= :month) AS active_30d '
            'FROM auth."session"'
        ),
        {"day": now - timedelta(days=1), "week": now - timedelta(days=7), "month": now - timedelta(days=30)},
    ).mappings().one()
    totals = db.execute(
        text(
            "SELECT (SELECT count(*) FROM entities) AS entities, "
            "(SELECT count(*) FROM assistant_messages) AS assistant_messages, "
            "(SELECT count(*) FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()) AS pending_invitations, "
            "(SELECT COALESCE(sum(ai_requests), 0) FROM usage_daily) AS ai_requests, "
            "(SELECT COALESCE(sum(integration_syncs), 0) FROM usage_daily) AS integration_syncs, "
            "(SELECT COALESCE(sum(errors), 0) FROM usage_daily) AS errors"
        )
    ).mappings().one()
    invited = db.execute(text("SELECT count(*) FROM invitations WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()" )).scalar_one()
    events = [dict(row) for row in db.execute(text("SELECT action, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 10")).mappings()]
    return {**dict(user_counts), **dict(activity), **dict(totals), "invited": invited, "recent_security_events": events}


@router.get("/users")
def users(
    search: str = Query(default="", max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: AuthPrincipal = Depends(require_admin),
) -> dict:
    value = f"%{search.strip()}%"
    rows = db.execute(
        text(
            'SELECT u.id, u.name, u.email, u."emailVerified" AS email_verified, COALESCE(u.role, \'user\') AS role, '
            'COALESCE(u.banned, false) AS banned, u."createdAt" AS created_at, u."updatedAt" AS updated_at, '
            '(SELECT max(s."updatedAt") FROM auth."session" s WHERE s."userId" = u.id) AS last_active_at, '
            '(SELECT count(*) FROM auth."session" s WHERE s."userId" = u.id) AS session_count, '
            '(SELECT count(*) FROM entities e WHERE e.user_id = u.id) AS entity_count, '
            '(SELECT COALESCE(sum(d.ai_requests), 0) FROM usage_daily d WHERE d.user_id = u.id) AS ai_requests '
            'FROM auth."user" u WHERE (:search = \'\' OR u.name ILIKE :value OR u.email ILIKE :value) '
            'ORDER BY u."createdAt" DESC LIMIT :limit OFFSET :offset'
        ),
        {"search": search.strip(), "value": value, "limit": limit, "offset": offset},
    ).mappings().all()
    total = db.execute(
        text('SELECT count(*) FROM auth."user" WHERE (:search = \'\' OR name ILIKE :value OR email ILIKE :value)'),
        {"search": search.strip(), "value": value},
    ).scalar_one()
    return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/users/export.csv", response_class=Response)
def export_users(db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> Response:
    rows = users(search="", limit=200, offset=0, db=db, _admin=_admin)["items"]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["name", "email", "role", "banned", "email_verified", "created_at", "last_active_at", "session_count", "entity_count", "ai_requests"], extrasaction="ignore")
    writer.writeheader()
    for row in rows: writer.writerow(row)
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=account-operations.csv"})


@router.get("/users/{user_id}")
def user_detail(user_id: UUID, db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> dict:
    user = _user(db, user_id)
    user["sessions"] = [
        dict(row)
        for row in db.execute(
            text('SELECT id, "createdAt" AS created_at, "updatedAt" AS updated_at, "expiresAt" AS expires_at, "ipAddress" AS ip_address, "userAgent" AS user_agent FROM auth."session" WHERE "userId" = :id ORDER BY "updatedAt" DESC'),
            {"id": user_id},
        ).mappings()
    ]
    quota = db.get(UserQuota, user_id)
    user["quota"] = {
        "max_entities": quota.max_entities if quota else 25000,
        "max_assistant_messages": quota.max_assistant_messages if quota else 50000,
        "max_ai_requests_per_day": quota.max_ai_requests_per_day if quota else 200,
    }
    user["usage"] = dict(
        db.execute(
            text('SELECT count(*) AS entities, (SELECT count(*) FROM assistant_messages WHERE user_id = :id) AS assistant_messages, (SELECT COALESCE(sum(ai_requests), 0) FROM usage_daily WHERE user_id = :id) AS ai_requests FROM entities WHERE user_id = :id'),
            {"id": user_id},
        ).mappings().one()
    )
    user["configured_integration_types"] = [
        row[0] for row in db.execute(text("SELECT key FROM app_settings WHERE user_id = :id AND key IN ('ai', 'github', 'web_search', 'dsa_integrations') ORDER BY key"), {"id": user_id})
    ]
    user["operational_error_count"] = db.execute(text("SELECT COALESCE(sum(errors), 0) FROM usage_daily WHERE user_id = :id"), {"id": user_id}).scalar_one()
    return user


@router.patch("/users/{user_id}/quota")
def update_quota(user_id: UUID, payload: QuotaUpdate, request: Request, db: Session = Depends(get_db), root: AuthPrincipal = Depends(require_root_admin)) -> dict:
    _user(db, user_id)
    quota = db.get(UserQuota, user_id)
    if quota is None:
        quota = UserQuota(user_id=user_id)
        db.add(quota)
    for field, value in payload.model_dump(exclude_none=True).items(): setattr(quota, field, value)
    quota.updated_at = datetime.now(timezone.utc)
    _audit(db, request, root, "user.quota_updated", user_id, payload.model_dump(exclude_none=True))
    db.commit()
    return {"max_entities": quota.max_entities, "max_assistant_messages": quota.max_assistant_messages, "max_ai_requests_per_day": quota.max_ai_requests_per_day}


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
def create_invitation(payload: InviteCreate, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> dict:
    email = payload.email.lower()
    if payload.role == "admin" and not admin.is_root_admin:
        raise HTTPException(status_code=403, detail="Only the root administrator can invite another administrator")
    if db.execute(text('SELECT 1 FROM auth."user" WHERE lower(email) = :email'), {"email": email}).first():
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    now = datetime.now(timezone.utc)
    db.execute(
        text("UPDATE invitations SET revoked_at = :now WHERE lower(email) = :email AND accepted_at IS NULL AND revoked_at IS NULL"),
        {"now": now, "email": email},
    )
    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        id=uuid4(),
        email=email,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        role=payload.role,
        invited_by_user_id=admin.user_id,
        expires_at=now + timedelta(hours=72),
    )
    db.add(invitation)
    _audit(db, request, admin, "invitation.created", details={"email": email, "role": payload.role})
    db.commit()
    return {"id": invitation.id, "email": email, "role": payload.role, "expires_at": invitation.expires_at, "invite_url": f"{settings.frontend_origin.rstrip('/')}/invite?token={token}"}


@router.get("/invitations")
def invitations(db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> list[dict]:
    return [dict(row) for row in db.execute(text("SELECT id, email, role, expires_at, accepted_at, revoked_at, created_at FROM invitations ORDER BY created_at DESC LIMIT 200")).mappings()]


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def revoke_invitation(invitation_id: UUID, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> Response:
    invitation = db.get(Invitation, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    invitation.revoked_at = datetime.now(timezone.utc)
    _audit(db, request, admin, "invitation.revoked", details={"invitation_id": str(invitation_id), "email": invitation.email})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/invitations/{invitation_id}/regenerate")
def regenerate_invitation(invitation_id: UUID, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> dict:
    old = db.get(Invitation, invitation_id)
    if old is None or old.accepted_at is not None:
        raise HTTPException(status_code=404, detail="Pending invitation not found")
    now = datetime.now(timezone.utc)
    old.revoked_at = now
    token = secrets.token_urlsafe(32)
    invitation = Invitation(id=uuid4(), email=old.email, token_hash=hashlib.sha256(token.encode()).hexdigest(), role=old.role, invited_by_user_id=admin.user_id, expires_at=now + timedelta(hours=72))
    db.add(invitation)
    _audit(db, request, admin, "invitation.regenerated", details={"email": old.email, "previous_invitation_id": str(old.id)})
    db.commit()
    return {"id": invitation.id, "email": invitation.email, "expires_at": invitation.expires_at, "invite_url": f"{settings.frontend_origin.rstrip('/')}/invite?token={token}"}


@router.post("/users/{user_id}/ban")
def ban_user(user_id: UUID, payload: UserAction, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> dict:
    user = _user(db, user_id)
    _protect_root(user)
    db.execute(text('UPDATE auth."user" SET banned = true, "banReason" = :reason, "banExpires" = :expires, "updatedAt" = now() WHERE id = :id'), {"reason": payload.reason, "expires": payload.ban_expires_at, "id": user_id})
    db.execute(text('DELETE FROM auth."session" WHERE "userId" = :id'), {"id": user_id})
    _audit(db, request, admin, "user.banned", user_id, {"reason": payload.reason, "expires_at": payload.ban_expires_at.isoformat() if payload.ban_expires_at else None})
    db.commit()
    return _user(db, user_id)


@router.delete("/users/{user_id}/ban")
def unban_user(user_id: UUID, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> dict:
    _user(db, user_id)
    db.execute(text('UPDATE auth."user" SET banned = false, "banReason" = NULL, "banExpires" = NULL, "updatedAt" = now() WHERE id = :id'), {"id": user_id})
    _audit(db, request, admin, "user.unbanned", user_id)
    db.commit()
    return _user(db, user_id)


@router.post("/users/{user_id}/sessions/revoke", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def revoke_sessions(user_id: UUID, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> Response:
    user = _user(db, user_id)
    _protect_root_from_other_admins(user, admin)
    db.execute(text('DELETE FROM auth."session" WHERE "userId" = :id'), {"id": user_id})
    _audit(db, request, admin, "sessions.revoked", user_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/users/{user_id}/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def revoke_session(user_id: UUID, session_id: UUID, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> Response:
    _protect_root_from_other_admins(_user(db, user_id), admin)
    result = db.execute(text('DELETE FROM auth."session" WHERE id = :session_id AND "userId" = :user_id'), {"session_id": session_id, "user_id": user_id})
    if not result.rowcount: raise HTTPException(status_code=404, detail="Session not found")
    _audit(db, request, admin, "session.revoked", user_id, {"session_id": str(session_id)})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/password-reset-link")
def password_reset_link(user_id: UUID, request: Request, db: Session = Depends(get_db), admin: AuthPrincipal = Depends(require_admin)) -> dict:
    user = _user(db, user_id)
    _protect_root_from_other_admins(user, admin)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.execute(text("UPDATE password_reset_tokens SET used_at = :now WHERE user_id = :user_id AND used_at IS NULL"), {"now": now, "user_id": user_id})
    db.add(PasswordResetToken(id=uuid4(), user_id=user_id, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=now + timedelta(hours=1), created_by_user_id=admin.user_id))
    _audit(db, request, admin, "password_reset.created", user_id)
    db.commit()
    return {"email": user["email"], "expires_at": now + timedelta(hours=1), "reset_url": f"{settings.frontend_origin.rstrip('/')}/reset-password?token={token}&source=admin"}


@router.patch("/users/{user_id}/role")
def update_role(user_id: UUID, payload: UserRoleUpdate, request: Request, db: Session = Depends(get_db), root: AuthPrincipal = Depends(require_root_admin)) -> dict:
    user = _user(db, user_id)
    _protect_root(user)
    if user["role"] == "admin" and payload.role == "user":
        admins = db.execute(text('SELECT count(*) FROM auth."user" WHERE role IN (\'admin\', \'root_admin\') AND NOT COALESCE(banned, false)')).scalar_one()
        if admins <= 1:
            raise HTTPException(status_code=409, detail="Cannot demote the last active administrator")
    db.execute(text('UPDATE auth."user" SET role = :role, "updatedAt" = now() WHERE id = :id'), {"role": payload.role, "id": user_id})
    db.execute(text('DELETE FROM auth."session" WHERE "userId" = :id'), {"id": user_id})
    _audit(db, request, root, "user.role_changed", user_id, {"role": payload.role})
    db.commit()
    return _user(db, user_id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_user(user_id: UUID, payload: UserDelete, request: Request, db: Session = Depends(get_db), root: AuthPrincipal = Depends(require_root_admin)) -> Response:
    user = _user(db, user_id)
    _protect_root(user)
    if payload.confirmation_email.lower() != str(user["email"]).lower():
        raise HTTPException(status_code=400, detail="Type the exact email to confirm deletion")
    _audit(db, request, root, "user.deleted", user_id, {"email": user["email"]})
    db.flush()
    db.execute(text('DELETE FROM auth."user" WHERE id = :id'), {"id": user_id})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/usage")
def usage(days: int = Query(default=30, ge=1, le=365), db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> list[dict]:
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    return [dict(row) for row in db.execute(text("SELECT date, sum(entity_writes) AS entity_writes, sum(assistant_messages) AS assistant_messages, sum(ai_requests) AS ai_requests, sum(prompt_tokens) AS prompt_tokens, sum(completion_tokens) AS completion_tokens, sum(integration_syncs) AS integration_syncs, sum(errors) AS errors FROM usage_daily WHERE date >= :cutoff GROUP BY date ORDER BY date"), {"cutoff": cutoff}).mappings()]


@router.get("/product-metrics")
def product_metrics(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    _admin: AuthPrincipal = Depends(require_admin),
) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        text(
            "SELECT date_trunc('day', created_at) AS day, event_name, count(*) AS event_count, "
            "avg(CASE WHEN event_name = 'core_web_vital' "
            "THEN (properties->>'value')::double precision END) AS average_value "
            "FROM product_events WHERE created_at >= :cutoff "
            "GROUP BY day, event_name ORDER BY day, event_name"
        ),
        {"cutoff": cutoff},
    ).mappings()
    return [dict(row) for row in rows]


@router.get("/audit-log")
def audit_log(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> list[dict]:
    query = text("SELECT a.id, a.action, a.target_user_id, a.ip_address, a.details, a.created_at, COALESCE(u.email, a.details->>'actor_email', 'Deleted account') AS actor_email FROM admin_audit_logs a LEFT JOIN auth.\"user\" u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT :limit")
    return [dict(row) for row in db.execute(query, {"limit": limit}).mappings()]
@router.get("/system-settings")
def system_settings(db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> dict:
    return {row.key: row.value for row in db.scalars(select(SystemSetting)).all()}


@router.put("/system-settings/{key}")
def set_system_setting(key: str, payload: SystemSettingUpdate, request: Request, db: Session = Depends(get_db), root: AuthPrincipal = Depends(require_root_admin)) -> dict:
    row = db.get(SystemSetting, key)
    if row is None:
        row = SystemSetting(key=key, value=payload.value, updated_by_user_id=root.user_id)
        db.add(row)
    else:
        row.value = payload.value
        row.updated_by_user_id = root.user_id
        row.updated_at = datetime.now(timezone.utc)
    _audit(db, request, root, "system_setting.updated", details={"key": key})
    db.commit()
    return {"key": key, "value": row.value}


@router.get("/health")
def admin_health(db: Session = Depends(get_db), _admin: AuthPrincipal = Depends(require_admin)) -> dict:
    database = db.execute(text("SELECT 1")).scalar_one() == 1
    auth_schema = db.execute(text("SELECT to_regclass('auth.user') IS NOT NULL")).scalar_one()
    try:
        with url_request.urlopen(settings.auth_jwks_url.replace("/api/auth/jwks", "/health"), timeout=2) as response: auth_service = "ok" if response.status == 200 else "error"
    except Exception: auth_service = "error"
    try:
        with socket.create_connection(("127.0.0.1", 6379), timeout=1): redis = "ok"
    except OSError: redis = "error"
    return {"api": "ok", "auth": auth_service, "database": "ok" if database else "error", "redis": redis, "auth_schema": "ok" if auth_schema else "error", "embedding": settings.embedding_backend, "ai": "per_user", "jobs": "not_configured"}
