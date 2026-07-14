from __future__ import annotations

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.dashboard import TodayDashboardResponse
from app.api.routes.projects import get_project_tracker
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


def task_priority_key(entity: Entity) -> tuple[int, int, datetime, datetime]:
    metadata = entity.entity_metadata or {}
    status_value = metadata.get("status", "backlog")
    priority_value = metadata.get("priority", "medium")
    due_value = metadata.get("due_at")
    deadline = datetime.max.replace(tzinfo=timezone.utc)
    if isinstance(due_value, str) and due_value.strip():
        try:
            if len(due_value.strip()) == 10:
                deadline = datetime.combine(date.fromisoformat(due_value.strip()), time.max, tzinfo=timezone.utc)
            else:
                parsed = datetime.fromisoformat(due_value.strip().replace("Z", "+00:00"))
                deadline = parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    now = datetime.now(timezone.utc)
    urgency = 0 if deadline < now else 1
    state_order = 0 if status_value == "blocked" else 1
    priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}.get(str(priority_value), 2)
    created_at = entity.created_at or datetime.max.replace(tzinfo=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return urgency, state_order + priority_order, deadline, created_at


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
    open_tasks.sort(key=task_priority_key)

    subject_entities = db.scalars(select(Entity).where(Entity.type == "subject_topic")).all()
    dated_subjects = [
        (parse_exam_date((entity.entity_metadata or {}).get("exam_date")), entity)
        for entity in subject_entities
    ]
    dated_subjects = [item for item in dated_subjects if item[0] is not None]
    dated_subjects.sort(key=lambda item: item[0])

    project_rows = get_project_tracker(db)
    project_attention = [row for row in project_rows if row.health in {"stalled", "at_risk"}]

    return TodayDashboardResponse(
        recent_entities=[serialize_entity(entity) for entity in recent_entities],
        recent_sessions=[serialize_session(session_row) for session_row in recent_sessions],
        open_tasks=[serialize_entity(entity) for entity in open_tasks[:recent_limit]],
        upcoming_subject_topics=[serialize_entity(entity) for _, entity in dated_subjects[:recent_limit]],
        project_attention=project_attention[:recent_limit],
    )
