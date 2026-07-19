from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth import AuthPrincipal, require_authenticated_user
from app.services.runtime_settings import get_settings_status

router = APIRouter(prefix="/account", tags=["account"])


class AccountDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation_email: EmailStr


EXPORT_TABLES: dict[str, tuple[str, ...]] = {
    "entities": (
        "id", "type", "parent_id", "title", "content", "content_type", "tags",
        "confidence_score", "last_revisited_at", "created_at", "updated_at", "metadata",
    ),
    "links": ("id", "from_id", "to_id", "relation_type", "explanation", "status", "created_at"),
    "sessions": ("id", "entity_id", "action", "date", "meta"),
    "reviews": ("id", "entity_id", "recalled_score", "reviewed_at"),
    "comprehension_checks": (
        "id", "entity_id", "ai_assist_level", "question", "your_answer",
        "ai_grade", "created_at", "answered_at",
    ),
    "assistant_threads": ("id", "title", "archived_at", "created_at", "updated_at"),
    "assistant_messages": ("id", "thread_id", "role", "content", "model_stage", "payload", "created_at"),
    "assistant_proposals": (
        "id", "thread_id", "source_message_id", "status", "actions", "result",
        "expires_at", "created_at", "executed_at",
    ),
    "integration_clients": (
        "id", "kind", "scope", "expires_at", "revoked_at", "last_used_at", "metadata", "created_at",
    ),
    "usage_daily": (
        "date", "entity_writes", "assistant_messages", "ai_requests",
        "prompt_tokens", "completion_tokens", "integration_syncs", "errors",
    ),
    "product_events": ("id", "event_name", "properties", "created_at"),
}


def _export_rows(db: Session, table: str, columns: tuple[str, ...], user_id) -> list[dict]:
    selected = ", ".join(f'"{column}"' for column in columns)
    statement = text(f'SELECT {selected} FROM public."{table}" WHERE user_id = :user_id')
    return [dict(row) for row in db.execute(statement, {"user_id": user_id}).mappings()]


@router.get("/export")
def export_account_data(
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(require_authenticated_user),
) -> JSONResponse:
    user = db.execute(
        text(
            'SELECT id, name, email, "emailVerified" AS email_verified, image, '
            '"createdAt" AS created_at, "updatedAt" AS updated_at '
            'FROM auth."user" WHERE id = :user_id'
        ),
        {"user_id": principal.user_id},
    ).mappings().one()
    accounts = [
        dict(row)
        for row in db.execute(
            text(
                'SELECT "providerId" AS provider, "createdAt" AS created_at, '
                '"updatedAt" AS updated_at FROM auth.account WHERE "userId" = :user_id'
            ),
            {"user_id": principal.user_id},
        ).mappings()
    ]
    settings_rows = []
    for row in db.execute(
        text("SELECT key, value, updated_at FROM app_settings WHERE user_id = :user_id"),
        {"user_id": principal.user_id},
    ).mappings():
        value = dict(row["value"] or {})
        value.pop("keys", None)
        settings_rows.append({"key": row["key"], "value": value, "updated_at": row["updated_at"]})

    payload = {
        "schema_version": 1,
        "exported_at": datetime.now(timezone.utc),
        "account": dict(user),
        "linked_accounts": accounts,
        "app_settings": settings_rows,
        "data": {
            name: _export_rows(db, name, columns, principal.user_id)
            for name, columns in EXPORT_TABLES.items()
        },
        "ai_egress_notice": get_settings_status(db).ai_egress.model_dump(),
    }
    return JSONResponse(
        content=jsonable_encoder(payload),
        headers={"Content-Disposition": 'attachment; filename="personal-dev-kg-export.json"'},
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_own_account(
    payload: AccountDeleteRequest,
    db: Session = Depends(get_db),
    principal: AuthPrincipal = Depends(require_authenticated_user),
) -> Response:
    if principal.role == "root_admin":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The root administrator account is protected")
    if payload.confirmation_email.lower() != principal.email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type the exact account email to confirm deletion")
    result = db.execute(
        text('DELETE FROM auth."user" WHERE id = :user_id AND lower(email) = lower(:email)'),
        {"user_id": principal.user_id, "email": principal.email},
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account deletion could not be completed")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
