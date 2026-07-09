from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.dashboard import TodayDashboardResponse
from app.api.routes.entities import serialize_entity
from app.api.routes.sessions import serialize_session

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def parse_exam_date(value: object) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None

    raw_value = value.strip()
    for parser in (date.fromisoformat, lambda item: datetime.fromisoformat(item).date()):
        try:
            return parser(raw_value)
        except ValueError:
            continue
    return None


@router.get("/today", response_model=TodayDashboardResponse)
def get_today_dashboard(
    recent_limit: int = Query(default=8, ge=1, le=25),
    db: Session = Depends(get_db),
) -> TodayDashboardResponse:
    recent_entities = db.scalars(select(Entity).order_by(Entity.created_at.desc()).limit(recent_limit)).all()
    recent_sessions = db.scalars(select(ActivitySession).order_by(ActivitySession.date.desc()).limit(recent_limit)).all()

    task_entities = db.scalars(select(Entity).where(Entity.type == "task").order_by(Entity.created_at.desc()).limit(100)).all()
    open_tasks = [
        entity
        for entity in task_entities
        if (entity.entity_metadata or {}).get("status", "todo") != "done"
    ]

    subject_entities = db.scalars(select(Entity).where(Entity.type == "subject_topic")).all()
    dated_subjects = [
        (parse_exam_date((entity.entity_metadata or {}).get("exam_date")), entity)
        for entity in subject_entities
    ]
    dated_subjects = [item for item in dated_subjects if item[0] is not None]
    dated_subjects.sort(key=lambda item: item[0])

    return TodayDashboardResponse(
        recent_entities=[serialize_entity(entity) for entity in recent_entities],
        recent_sessions=[serialize_session(session_row) for session_row in recent_sessions],
        open_tasks=[serialize_entity(entity) for entity in open_tasks[:recent_limit]],
        upcoming_subject_topics=[serialize_entity(entity) for _, entity in dated_subjects[:recent_limit]],
    )
