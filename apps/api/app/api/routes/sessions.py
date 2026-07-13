from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.session import SessionCreate, SessionRead

router = APIRouter(prefix="/sessions", tags=["sessions"])


def serialize_session(session_row: ActivitySession) -> SessionRead:
    return SessionRead.model_validate(
        {
            "id": session_row.id,
            "entity_id": session_row.entity_id,
            "action": session_row.action,
            "date": session_row.date,
            "meta": session_row.meta or {},
        }
    )


@router.get("", response_model=list[SessionRead])
def list_sessions(
    entity_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[SessionRead]:
    query = select(ActivitySession).order_by(ActivitySession.date.desc()).limit(limit)
    if entity_id is not None:
        query = query.where(ActivitySession.entity_id == entity_id)

    sessions = db.scalars(query).all()
    return [serialize_session(session_row) for session_row in sessions]


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> SessionRead:
    if payload.entity_id is not None and db.get(Entity, payload.entity_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Entity does not exist")

    session_values = dict(
        id=uuid.uuid4(),
        entity_id=payload.entity_id,
        action=payload.action,
        meta=payload.meta,
    )
    if payload.date is not None:
        session_values["date"] = payload.date
    session_row = ActivitySession(**session_values)
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return serialize_session(session_row)
