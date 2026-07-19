from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from math import isfinite
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.recall import get_due_recall_items
from app.api.routes.entities import serialize_entity
from app.api.routes.sessions import serialize_session
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession
from app.schemas.recall import RecallDueEntityRead
from app.schemas.subject import SubjectOverviewRead, SubjectSummaryRead, SubjectTrackerItemRead
from app.services.entity_visibility import active_entity_clause, is_entity_deleted
from app.services.task_statuses import is_terminal_task_status

router = APIRouter(prefix="/subjects", tags=["subjects"])
LINKED_TYPES = {"note", "til", "dsa_problem", "concept", "task"}
SESSION_MINUTE_KEYS = {
    "study_planned": ("planned_minutes", "duration_minutes", "minutes", "estimated_minutes"),
    "study_completed": ("actual_minutes", "duration_minutes", "minutes", "studied_minutes", "estimated_minutes"),
}


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_deadline(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw_value = value.strip()
    try:
        parsed_date = date.fromisoformat(raw_value)
    except ValueError:
        parsed_date = None
    if parsed_date is not None:
        return datetime.combine(parsed_date, time.max, tzinfo=timezone.utc)
    try:
        return _as_utc(datetime.fromisoformat(raw_value.replace("Z", "+00:00")))
    except ValueError:
        return None


def _metadata_number(metadata: dict, key: str) -> float | None:
    value = metadata.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric_value = float(value)
    return numeric_value if isfinite(numeric_value) else None


def _status(entity: Entity) -> str:
    value = (entity.entity_metadata or {}).get("status")
    return value.strip().lower() if isinstance(value, str) else ""


def _task_is_open(task: Entity) -> bool:
    return not is_terminal_task_status(_status(task))


def _topic_progress(topic: Entity) -> float:
    if _status(topic) in {"done", "completed"}:
        return 100.0
    progress = _metadata_number(topic.entity_metadata or {}, "progress_percent")
    return min(max(progress or 0.0, 0.0), 100.0)


def _task_progress(task: Entity) -> float:
    if not _task_is_open(task):
        return 100.0
    progress = _metadata_number(task.entity_metadata or {}, "progress_percent")
    return min(max(progress or 0.0, 0.0), 100.0)


def _grade_percent(tasks: Iterable[Entity]) -> float | None:
    graded: list[tuple[float, float, float | None]] = []
    for task in tasks:
        if _status(task) == "cancelled":
            continue
        metadata = task.entity_metadata or {}
        earned = _metadata_number(metadata, "points_earned")
        possible = _metadata_number(metadata, "points_possible")
        if earned is None or possible is None or possible <= 0:
            continue
        graded.append((earned, possible, _metadata_number(metadata, "weight_percent")))
    if not graded:
        return None

    if all(weight is not None for _, _, weight in graded):
        total_weight = sum(weight or 0.0 for _, _, weight in graded)
        if total_weight > 0:
            weighted_grade = sum((earned / possible) * (weight or 0.0) for earned, possible, weight in graded)
            return round((weighted_grade / total_weight) * 100, 2)

    total_possible = sum(possible for _, possible, _ in graded)
    total_earned = sum(earned for earned, _, _ in graded)
    return round((total_earned / total_possible) * 100, 2)


def _session_minutes(session_row: ActivitySession) -> float:
    metadata = session_row.meta or {}
    for key in SESSION_MINUTE_KEYS.get(session_row.action or "", ()):
        value = metadata.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        if isfinite(float(value)) and value >= 0:
            return float(value)
    return 0.0


def _task_sort_key(task: Entity) -> tuple[datetime, datetime, str]:
    deadline = _parse_deadline((task.entity_metadata or {}).get("due_at"))
    created_at = _as_utc(task.created_at) if task.created_at is not None else datetime.max.replace(tzinfo=timezone.utc)
    return (
        deadline or datetime.max.replace(tzinfo=timezone.utc),
        created_at,
        (task.title or "").lower(),
    )


def build_subject_summary(
    subject: Entity,
    topics: Iterable[Entity],
    academic_tasks: Iterable[Entity],
    sessions: Iterable[ActivitySession],
    due_review_ids: set[uuid.UUID],
    *,
    now: datetime | None = None,
) -> SubjectSummaryRead:
    current_time = _as_utc(now or datetime.now(timezone.utc))
    topic_rows = list(topics)
    task_rows = list(academic_tasks)
    session_rows = list(sessions)
    tracked_entity_ids = {subject.id, *[topic.id for topic in topic_rows], *[task.id for task in task_rows]}

    topic_progress = [_topic_progress(topic) for topic in topic_rows]
    task_progress = [_task_progress(task) for task in task_rows if _status(task) != "cancelled"]
    progress_parts = [*topic_progress, *task_progress]
    if progress_parts:
        progress_percent = round(sum(progress_parts) / len(progress_parts), 1)
    else:
        stored_progress = _metadata_number(subject.entity_metadata or {}, "progress_percent")
        progress_percent = min(max(stored_progress or 0.0, 0.0), 100.0)

    mastery_values = [
        min(max(float(topic.confidence_score if topic.confidence_score is not None else 1.0), 0.0), 1.0)
        for topic in topic_rows
    ]
    if not mastery_values:
        mastery_values = [
            min(max(float(subject.confidence_score if subject.confidence_score is not None else 1.0), 0.0), 1.0)
        ]

    open_tasks = [task for task in task_rows if _task_is_open(task)]
    task_deadlines = [
        (deadline, str((task.entity_metadata or {}).get("due_at")).strip())
        for task in open_tasks
        if (deadline := _parse_deadline((task.entity_metadata or {}).get("due_at"))) is not None
    ]
    if task_deadlines:
        next_deadline = min(task_deadlines, key=lambda item: item[0])[1]
    else:
        exam_date = (subject.entity_metadata or {}).get("exam_date")
        next_deadline = str(exam_date).strip() if _parse_deadline(exam_date) is not None else None
    overdue_task_count = sum(
        1
        for task in open_tasks
        if (deadline := _parse_deadline((task.entity_metadata or {}).get("due_at"))) is not None
        and deadline < current_time
    )

    planned_start = current_time
    planned_end = current_time + timedelta(days=7)
    studied_start = current_time - timedelta(days=7)
    planned_minutes = 0.0
    studied_minutes = 0.0
    last_studied_at: datetime | None = None
    for session_row in session_rows:
        if session_row.entity_id not in tracked_entity_ids or session_row.date is None:
            continue
        session_date = _as_utc(session_row.date)
        if session_row.action == "study_planned" and planned_start <= session_date <= planned_end:
            planned_minutes += _session_minutes(session_row)
        if session_row.action == "study_completed" and studied_start <= session_date <= current_time:
            studied_minutes += _session_minutes(session_row)
        if session_row.action == "study_completed" and session_date <= current_time:
            if last_studied_at is None or session_date > last_studied_at:
                last_studied_at = session_date

    return SubjectSummaryRead(
        topic_count=len(topic_rows),
        completed_topic_count=sum(progress >= 100 for progress in topic_progress),
        open_task_count=len(open_tasks),
        overdue_task_count=overdue_task_count,
        due_review_count=len(tracked_entity_ids & due_review_ids),
        progress_percent=progress_percent,
        mastery_score=round(sum(mastery_values) / len(mastery_values), 3),
        grade_percent=_grade_percent(task_rows),
        next_deadline=next_deadline,
        planned_minutes_7d=round(planned_minutes),
        studied_minutes_7d=round(studied_minutes),
        last_studied_at=last_studied_at,
    )


@router.get("/tracker", response_model=list[SubjectTrackerItemRead])
def get_subject_tracker(db: Session = Depends(get_db)) -> list[SubjectTrackerItemRead]:
    subjects = db.scalars(
        select(Entity)
        .where(Entity.type == "subject_topic")
        .where(Entity.parent_id.is_(None))
        .where(active_entity_clause())
        .order_by(Entity.title.asc(), Entity.created_at.asc())
    ).all()
    if not subjects:
        return []

    subject_ids = {subject.id for subject in subjects}
    topics = db.scalars(
        select(Entity)
        .where(Entity.type == "subject_topic")
        .where(Entity.parent_id.in_(subject_ids))
        .where(active_entity_clause())
        .order_by(Entity.created_at.asc())
    ).all()
    topic_owner = {topic.id: topic.parent_id for topic in topics}
    academic_parent_ids = {*subject_ids, *topic_owner.keys()}
    academic_tasks = db.scalars(
        select(Entity)
        .where(Entity.type == "task")
        .where(Entity.parent_id.in_(academic_parent_ids))
        .where(active_entity_clause())
        .order_by(Entity.created_at.asc())
    ).all()

    task_owner: dict[uuid.UUID, uuid.UUID] = {}
    for task in academic_tasks:
        if task.parent_id is not None and task.parent_id in subject_ids:
            task_owner[task.id] = task.parent_id
        elif task.parent_id in topic_owner and topic_owner[task.parent_id] is not None:
            task_owner[task.id] = topic_owner[task.parent_id]

    tracked_entity_ids = {*subject_ids, *topic_owner.keys(), *task_owner.keys()}
    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.entity_id.in_(tracked_entity_ids))
        .order_by(ActivitySession.date.desc())
    ).all()

    due_review_ids = {
        item.entity.id for item in get_due_recall_items(db, limit=1_000_000) if item.entity.id in tracked_entity_ids
    }
    topics_by_subject = {
        subject.id: [topic for topic in topics if topic.parent_id == subject.id]
        for subject in subjects
    }
    tasks_by_subject = {
        subject.id: sorted(
            [task for task in academic_tasks if task_owner.get(task.id) == subject.id],
            key=_task_sort_key,
        )
        for subject in subjects
    }
    entity_owner = {subject.id: subject.id for subject in subjects}
    entity_owner.update({
        topic.id: topic.parent_id for topic in topics if topic.parent_id is not None
    })
    entity_owner.update(task_owner)
    sessions_by_subject: dict[uuid.UUID, list[ActivitySession]] = {
        subject.id: [] for subject in subjects
    }
    for session_row in sessions:
        owner_id = entity_owner.get(session_row.entity_id)
        if owner_id is not None:
            sessions_by_subject[owner_id].append(session_row)
    current_time = datetime.now(timezone.utc)

    return [
        SubjectTrackerItemRead(
            subject=serialize_entity(subject),
            **build_subject_summary(
                subject,
                topics_by_subject[subject.id],
                tasks_by_subject[subject.id],
                sessions_by_subject[subject.id],
                due_review_ids,
                now=current_time,
            ).model_dump(),
        )
        for subject in subjects
    ]


@router.get("/{subject_id}/overview", response_model=SubjectOverviewRead)
def get_subject_overview(subject_id: uuid.UUID, db: Session = Depends(get_db)) -> SubjectOverviewRead:
    subject = db.get(Entity, subject_id)
    if subject is None or is_entity_deleted(subject) or subject.type != "subject_topic" or subject.parent_id is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    topics = db.scalars(
        select(Entity)
        .where(Entity.type == "subject_topic")
        .where(Entity.parent_id == subject.id)
        .where(active_entity_clause())
        .order_by(Entity.created_at.asc())
    ).all()
    academic_tasks = db.scalars(
        select(Entity)
        .where(Entity.type == "task")
        .where(Entity.parent_id.in_({subject.id, *[topic.id for topic in topics]}))
        .where(active_entity_clause())
        .order_by(Entity.created_at.asc())
    ).all()
    academic_tasks = sorted(academic_tasks, key=_task_sort_key)
    subtree_ids = {
        subject.id,
        *[topic.id for topic in topics],
        *[task.id for task in academic_tasks],
    }

    links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "confirmed")
        .where(or_(Link.from_id.in_(subtree_ids), Link.to_id.in_(subtree_ids)))
        .order_by(Link.created_at.desc())
    ).all()
    linked_entities: dict[str, list] = {key: [] for key in sorted(LINKED_TYPES)}
    seen: set[uuid.UUID] = set()
    for link in links:
        for candidate in (link.from_entity, link.to_entity):
            if candidate is None or candidate.id in subtree_ids or candidate.id in seen or is_entity_deleted(candidate):
                continue
            if candidate.type in LINKED_TYPES:
                linked_entities[candidate.type].append(serialize_entity(candidate))
                seen.add(candidate.id)

    due_reviews = []
    for item in get_due_recall_items(db, limit=1_000_000):
        if item.entity.id not in subtree_ids:
            continue
        due_reviews.append(
            RecallDueEntityRead(
                entity=serialize_entity(item.entity),
                due_score=item.due_score,
                due_reasons=item.due_reasons,
                days_since_review=item.days_since_review,
                days_until_exam=item.days_until_exam,
            )
        )

    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.entity_id.in_(subtree_ids))
        .order_by(ActivitySession.date.desc())
    ).all()
    due_review_ids = {item.entity.id for item in due_reviews}

    metadata = subject.entity_metadata or {}
    target = float(metadata.get("target_confidence", 0.8)) if isinstance(metadata.get("target_confidence", 0.8), (int, float)) else 0.8
    weak_topics = sorted(
        [topic for topic in topics if (topic.confidence_score if topic.confidence_score is not None else 1.0) < target],
        key=lambda topic: topic.confidence_score if topic.confidence_score is not None else 1.0,
    )

    return SubjectOverviewRead(
        subject=serialize_entity(subject),
        topics=[serialize_entity(topic) for topic in topics],
        academic_tasks=[serialize_entity(task) for task in academic_tasks],
        summary=build_subject_summary(
            subject,
            topics,
            academic_tasks,
            sessions,
            due_review_ids,
        ),
        linked_entities=linked_entities,
        due_reviews=due_reviews,
        recent_sessions=[serialize_session(row) for row in sessions[:50]],
        weak_topics=[serialize_entity(topic) for topic in weak_topics],
    )
