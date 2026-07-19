from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.services.recall import get_due_recall_items
from app.db.session import get_db
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.models.comprehension_check import ComprehensionCheck
from app.schemas.dashboard import TodayDashboardResponse, TodayDashboardTotalsRead
from app.schemas.agenda import TodayAgendaResponse
from app.api.routes.projects import get_project_tracker
from app.api.routes.entities import serialize_entity
from app.api.routes.sessions import serialize_session
from app.services.task_statuses import open_task_clause
from app.services.agenda import build_agenda
from app.services.runtime_settings import get_preferences
from app.services.entity_visibility import active_entity_clause

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


def task_priority_key(
    entity: Entity,
    *,
    now: datetime | None = None,
) -> tuple[int, int, int, datetime, datetime, str, str]:
    metadata = entity.entity_metadata or {}
    status_value = str(metadata.get("status", "backlog")).strip().lower()
    priority_value = str(metadata.get("priority", "medium")).strip().lower()
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
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    else:
        current_time = current_time.astimezone(timezone.utc)
    urgency = 0 if deadline < current_time else 1
    state_order = 0 if status_value == "blocked" else 1
    priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}.get(str(priority_value), 2)
    created_at = entity.created_at or datetime.max.replace(tzinfo=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return (
        urgency,
        state_order,
        priority_order,
        deadline,
        created_at,
        (entity.title or "").lower(),
        str(entity.id),
    )


@router.get("/today", response_model=TodayDashboardResponse)
def get_today_dashboard(
    recent_limit: int = Query(default=8, ge=1, le=25),
    db: Session = Depends(get_db),
) -> TodayDashboardResponse:
    current_time = datetime.now(timezone.utc)
    current_date = current_time.date()
    recent_entities = db.scalars(select(Entity).order_by(Entity.created_at.desc()).limit(recent_limit)).all()
    recent_sessions = db.scalars(select(ActivitySession).order_by(ActivitySession.date.desc()).limit(recent_limit)).all()

    open_tasks = list(db.scalars(
        select(Entity)
        .where(Entity.type == "task")
        .where(open_task_clause())
        .order_by(Entity.created_at.desc())
    ).all())
    open_tasks.sort(key=lambda entity: task_priority_key(entity, now=current_time))

    subject_entities = db.scalars(select(Entity).where(Entity.type == "subject_topic")).all()
    dated_subjects = [
        (parse_exam_date((entity.entity_metadata or {}).get("exam_date")), entity)
        for entity in subject_entities
    ]
    dated_subjects = [item for item in dated_subjects if item[0] is not None and item[0] >= current_date]
    dated_subjects.sort(key=lambda item: (item[0], (item[1].title or "").lower(), str(item[1].id)))

    project_rows = get_project_tracker(db)
    project_attention = [row for row in project_rows if row.health in {"stalled", "at_risk"}]
    due_recall_total = len(get_due_recall_items(db, limit=1_000_000, now=current_time))

    return TodayDashboardResponse(
        totals=TodayDashboardTotalsRead(
            open_tasks=len(open_tasks),
            upcoming_exams=len(dated_subjects),
            projects_needing_attention=len(project_attention),
            due_recall=due_recall_total,
        ),
        recent_entities=[serialize_entity(entity) for entity in recent_entities],
        recent_sessions=[serialize_session(session_row) for session_row in recent_sessions],
        open_tasks=[serialize_entity(entity) for entity in open_tasks[:recent_limit]],
        upcoming_subject_topics=[serialize_entity(entity) for _, entity in dated_subjects[:recent_limit]],
        project_attention=project_attention[:recent_limit],
    )


@router.get("/agenda", response_model=TodayAgendaResponse)
def get_today_agenda(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    preview_limit: int = Query(default=8, ge=1, le=25),
    db: Session = Depends(get_db),
) -> TodayAgendaResponse:
    """Return a derived agenda; this endpoint never persists a parallel task list."""
    now = datetime.now(timezone.utc)
    range_start = start_date or now.date()
    range_end = end_date or range_start + timedelta(days=6)
    if range_end < range_start:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    if (range_end - range_start).days > 31:
        raise HTTPException(status_code=400, detail="Agenda date range cannot exceed 31 days")

    entities = list(db.scalars(select(Entity).where(active_entity_clause())).all())
    entity_ids = [entity.id for entity in entities]
    sessions = list(db.scalars(select(ActivitySession).where(ActivitySession.action == "study_planned").where(ActivitySession.entity_id.in_(entity_ids))).all()) if entity_ids else []
    checks = list(db.scalars(select(ComprehensionCheck).where(ComprehensionCheck.answered_at.is_(None))).all())
    day_start = datetime.combine(range_start, time.min, tzinfo=timezone.utc)
    capacity_rows = list(db.scalars(select(ActivitySession).where(ActivitySession.action == "daily_plan").where(ActivitySession.date >= day_start).where(ActivitySession.date < day_start + timedelta(days=1)).order_by(ActivitySession.date.desc())).all())
    preferences = get_preferences(db)
    available_minutes = next((row.meta.get("available_minutes") for row in capacity_rows if isinstance((row.meta or {}).get("available_minutes"), int)), preferences.typical_study_minutes)
    return build_agenda(
        entities=entities,
        sessions=sessions,
        recalls=get_due_recall_items(db, limit=1_000, now=now),
        checks=checks,
        projects=get_project_tracker(db),
        start_date=range_start,
        end_date=range_end,
        now=now,
        preview_limit=preview_limit,
        available_minutes=available_minutes,
        learning_focuses=preferences.learning_focuses,
        preferred_focus_minutes=preferences.preferred_focus_minutes,
        max_daily_workload_minutes=preferences.max_daily_workload_minutes,
    )