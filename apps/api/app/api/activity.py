from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.session import ActivitySession


def record_session(
    db: Session,
    *,
    entity_id: uuid.UUID | None,
    action: str,
    meta: dict[str, Any] | None = None,
) -> None:
    db.add(
        ActivitySession(
            id=uuid.uuid4(),
            entity_id=entity_id,
            action=action,
            meta=meta or {},
        )
    )
