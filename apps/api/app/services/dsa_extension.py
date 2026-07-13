from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.entity import Entity
from app.models.integration_client import IntegrationClient
from app.schemas.dsa_extension import ExtensionImportRecord

PAIRING_TTL = timedelta(minutes=10)
EXTENSION_SCOPE = "dsa:import"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_secret(secret: str) -> str:
    pepper = settings.app_session_secret or "authentication-not-configured"
    return hashlib.sha256(f"{pepper}:{secret}".encode()).hexdigest()


def create_pairing_code(db: Session) -> tuple[str, datetime]:
    now = _now()
    db.query(IntegrationClient).filter(
        IntegrationClient.kind == "pairing_code",
        IntegrationClient.revoked_at.is_(None),
    ).update({"revoked_at": now})
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(8))
    expires_at = now + PAIRING_TTL
    db.add(
        IntegrationClient(
            id=uuid4(),
            kind="pairing_code",
            secret_hash=hash_secret(code),
            scope=EXTENSION_SCOPE,
            expires_at=expires_at,
            client_metadata={},
        )
    )
    db.commit()
    return code, expires_at


def exchange_pairing_code(db: Session, code: str, extension_name: str | None) -> str:
    now = _now()
    pairing = db.scalar(
        select(IntegrationClient)
        .where(
            IntegrationClient.kind == "pairing_code",
            IntegrationClient.secret_hash == hash_secret(code.strip().upper()),
            IntegrationClient.revoked_at.is_(None),
        )
        .with_for_update()
    )
    if pairing is None or pairing.expires_at is None or pairing.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pairing code is invalid or expired")
    pairing.revoked_at = now
    raw_token = f"pdkg_dsa_{secrets.token_urlsafe(32)}"
    db.add(
        IntegrationClient(
            id=uuid4(),
            kind="extension_token",
            secret_hash=hash_secret(raw_token),
            scope=EXTENSION_SCOPE,
            expires_at=None,
            client_metadata={"name": extension_name or "Browser extension"},
        )
    )
    db.commit()
    return raw_token


def revoke_extension_tokens(db: Session) -> int:
    now = _now()
    count = (
        db.query(IntegrationClient)
        .filter(
            IntegrationClient.kind == "extension_token",
            IntegrationClient.revoked_at.is_(None),
        )
        .update({"revoked_at": now})
    )
    db.commit()
    return count


def require_extension_token(request: Request, db: Session = Depends(get_db)) -> IntegrationClient:
    authorization = request.headers.get("authorization", "")
    scheme, _, raw_token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Extension token required")
    client = db.scalar(
        select(IntegrationClient).where(
            IntegrationClient.kind == "extension_token",
            IntegrationClient.secret_hash == hash_secret(raw_token),
            IntegrationClient.scope == EXTENSION_SCOPE,
            IntegrationClient.revoked_at.is_(None),
        )
    )
    now = _now()
    if client is None or (client.expires_at is not None and client.expires_at <= now):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Extension token is invalid or revoked")
    client.last_used_at = now
    db.flush()
    return client


def extension_status(db: Session) -> tuple[bool, datetime | None, int]:
    clients = db.scalars(
        select(IntegrationClient).where(
            IntegrationClient.kind == "extension_token",
            IntegrationClient.revoked_at.is_(None),
        )
    ).all()
    last_used = max((item.last_used_at for item in clients if item.last_used_at), default=None)
    imported = db.scalar(
        select(func.count()).select_from(Entity).where(
            Entity.type == "dsa_problem",
            Entity.entity_metadata["integration"]["platform"].astext == "leetcode",
        )
    ) or 0
    return bool(clients), last_used, imported


def _digest(value: str | None) -> str | None:
    return hashlib.sha256(value.encode()).hexdigest() if value is not None else None


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def upsert_extension_record(db: Session, record: ExtensionImportRecord) -> tuple[str, str]:
    key = f"leetcode:{record.external_problem_id}"
    entity = next(
        (
            item
            for item in db.scalars(select(Entity).where(Entity.type == "dsa_problem")).all()
            if ((item.entity_metadata or {}).get("integration") or {}).get("external_key") == key
        ),
        None,
    )
    created = entity is None
    now = _now().isoformat()
    if entity is None:
        entity = Entity(
            id=uuid4(),
            type="dsa_problem",
            title=record.title,
            content=record.tracker_notes or "",
            content_type="markdown",
            tags=record.tracker_tags if record.tracker_tags is not None else record.tags,
            confidence_score=1.0,
            entity_metadata={},
        )
        db.add(entity)

    metadata = dict(entity.entity_metadata or {})
    integration = dict(metadata.get("integration") or {})
    previous_title = integration.get("imported_title")
    previous_difficulty = integration.get("imported_difficulty")
    previous_code_hash = integration.get("imported_code_hash")
    current_code = metadata.get("solution_code")
    changed = created

    if created or entity.title == previous_title:
        changed = changed or entity.title != record.title
        entity.title = record.title
    if record.tracker_notes is not None:
        changed = changed or entity.content != record.tracker_notes
        entity.content = record.tracker_notes
    if record.tracker_tags is not None:
        changed = changed or entity.tags != record.tracker_tags
        entity.tags = record.tracker_tags

    current_difficulty = metadata.get("difficulty")
    if record.difficulty and (created or current_difficulty in (None, previous_difficulty)):
        changed = changed or current_difficulty != record.difficulty
        metadata["difficulty"] = record.difficulty

    incoming_code_hash = _digest(record.solution_code)
    if record.solution_code is not None and (created or current_code is None or _digest(current_code) == previous_code_hash):
        changed = changed or current_code != record.solution_code
        metadata["solution_code"] = record.solution_code

    provider_fields = {
        "platform": "leetcode",
        "external_id": record.external_problem_id,
        "external_key": key,
        "url": record.url,
        "accepted": record.accepted,
        "language": record.language,
        "first_solved_at": _iso(record.first_solved_at),
        "last_submitted_at": _iso(record.last_submitted_at),
        "source_updated_at": _iso(record.source_updated_at),
        "source_notes": record.source_notes,
        "last_imported_at": now,
        "imported_title": record.title,
        "imported_difficulty": record.difficulty,
        "imported_code_hash": incoming_code_hash,
        "platform_tags": record.tags,
    }
    comparable = {key: value for key, value in provider_fields.items() if key != "last_imported_at"}
    if any(integration.get(field) != value for field, value in comparable.items()):
        changed = True
    integration.update(provider_fields)
    metadata["integration"] = integration
    entity.entity_metadata = metadata
    db.flush()
    return ("imported", "created") if created else (("updated", "updated") if changed else ("skipped", "unchanged"))
