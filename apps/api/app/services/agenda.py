from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable
from uuid import UUID

from app.agents.services.recall import RecallDueItem
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.agenda import AgendaContextRead, AgendaItemRead, AgendaPreviewRead, TodayAgendaResponse, AgendaTotalsRead, AgendaCapacityRead
from app.schemas.project import ProjectTrackerItemRead
from app.services.task_statuses import is_terminal_task_status
from app.services.academic import occurrences_for_entity

PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def parse_datetime(value: object, *, end_of_day: bool = False) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    try:
        if len(raw) == 10:
            return datetime.combine(date.fromisoformat(raw), time.max if end_of_day else time.min, tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return as_utc(parsed)
    except ValueError:
        return None


def minutes(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def parent_context(entity: Entity, entities: dict[UUID, Entity]) -> AgendaContextRead | None:
    current = entity
    visited: set[UUID] = set()
    while current.parent_id is not None and current.parent_id not in visited:
        visited.add(current.parent_id)
        parent = entities.get(current.parent_id)
        if parent is None:
            break
        current = parent
        if current.type in {"project", "subject_topic"}:
            return AgendaContextRead(id=current.id, type=current.type, title=current.title)
    if entity.type in {"project", "subject_topic"}:
        return AgendaContextRead(id=entity.id, type=entity.type, title=entity.title)
    return None


def item_filters(entity: Entity | None, context: AgendaContextRead | None, *, revision: bool = False) -> list[str]:
    values: set[str] = set()
    metadata = entity.entity_metadata if entity else {}
    academic_kind = (metadata or {}).get("academic_kind")
    if context and context.type == "project" or (entity and entity.type == "project"):
        values.add("projects")
    if entity and entity.type == "dsa_problem":
        values.add("dsa")
    if revision or academic_kind == "revision":
        values.add("revision")
    if context and context.type == "subject_topic" or academic_kind in {"assignment", "exam", "reading"}:
        values.add("coursework")
    return sorted(values)


def task_item(entity: Entity, entities: dict[UUID, Entity], now: datetime) -> AgendaItemRead:
    metadata = entity.entity_metadata or {}
    deadline = parse_datetime(metadata.get("due_at"), end_of_day=True)
    start_at = parse_datetime(metadata.get("start_at"))
    priority = str(metadata.get("priority", "medium"))
    status = str(metadata.get("status", "backlog"))
    context = parent_context(entity, entities)
    academic_kind = metadata.get("academic_kind")
    kind = "assignment" if academic_kind == "assignment" else "exam" if academic_kind == "exam" else "task"
    overdue = deadline is not None and deadline < now
    urgency = "overdue" if overdue else "today" if (deadline and deadline.date() == now.date()) or (start_at and start_at.date() == now.date()) else "upcoming" if deadline or start_at else "unscheduled"
    reason = "This deadline has passed." if overdue else "Due today." if urgency == "today" and deadline else "Scheduled to start today." if urgency == "today" else "Has a scheduled deadline." if deadline else "Open work without a scheduled time."
    return AgendaItemRead(
        id=f"{kind}:{entity.id}", kind=kind, source_entity_id=entity.id, source_type="entity", context=context,
        title=entity.title or "Untitled task", description=(entity.content or "").strip()[:180] or None,
        start_at=start_at, deadline=deadline, estimated_minutes=minutes(metadata.get("estimated_minutes")), priority=priority if priority in PRIORITY_ORDER else "medium",
        urgency=urgency, recommendation_reason=reason, status=status, destination="entity", destination_id=entity.id,
        allowed_actions=["complete", "snooze", "reschedule", "mark_blocked", "open"], filters=item_filters(entity, context),
    )


def exam_item(entity: Entity, entities: dict[UUID, Entity], now: datetime) -> AgendaItemRead | None:
    metadata = entity.entity_metadata or {}
    deadline = parse_datetime(metadata.get("exam_date"), end_of_day=True)
    if deadline is None:
        return None
    context = parent_context(entity, entities)
    urgency = "overdue" if deadline < now else "today" if deadline.date() == now.date() else "upcoming"
    reason = "This assessment date has passed." if urgency == "overdue" else "This assessment is today." if urgency == "today" else "Upcoming assessment date."
    return AgendaItemRead(
        id=f"exam:{entity.id}", kind="exam", source_entity_id=entity.id, source_type="entity", context=context,
        title=entity.title or "Upcoming assessment", description=None, deadline=deadline, estimated_minutes=minutes(metadata.get("estimated_minutes")),
        priority="high", urgency=urgency, recommendation_reason=reason, status=str(metadata.get("status", "scheduled")),
        destination="subject", destination_id=(context.id if context and context.type == "subject_topic" else entity.id),
        allowed_actions=["open"], filters=item_filters(entity, context),
    )

def study_item(session: ActivitySession, entity: Entity | None, entities: dict[UUID, Entity], now: datetime) -> AgendaItemRead:
    meta = session.meta or {}
    start_at = as_utc(session.date)
    context = parent_context(entity, entities) if entity else None
    urgency = "overdue" if start_at and start_at < now else "today" if start_at and start_at.date() == now.date() else "upcoming"
    return AgendaItemRead(
        id=f"study:{session.id}", kind="study", source_entity_id=entity.id if entity else session.entity_id, source_type="session", context=context,
        title=f"Study {entity.title}" if entity and entity.title else "Planned study session", description="Planned study session.",
        start_at=start_at, estimated_minutes=minutes(meta.get("duration_minutes")) or minutes(meta.get("estimated_minutes")), priority="medium", urgency=urgency,
        recommendation_reason="You planned this study block.", status="planned", destination="subject" if context and context.type == "subject_topic" else "entity",
        destination_id=(context.id if context and context.type == "subject_topic" else entity.id if entity else None), allowed_actions=["open", "start", "reschedule", "cancel"], filters=item_filters(entity, context),
    )


def scheduled_occurrence_item(entity: Entity, occurrence, entities: dict[UUID, Entity], now: datetime) -> AgendaItemRead:
    context = parent_context(entity, entities)
    urgency = "overdue" if occurrence.start_at < now else "today" if occurrence.start_at.date() == now.date() else "upcoming"
    kind = occurrence.kind if occurrence.kind in {"lecture", "lab", "tutorial", "office_hours", "study_block"} else "study"
    return AgendaItemRead(
        id=occurrence.id, kind=kind, source_entity_id=entity.id, source_type="recurrence", context=context,
        title=occurrence.title, description="Recurring academic schedule.", start_at=occurrence.start_at, deadline=None,
        estimated_minutes=occurrence.estimated_minutes, priority="medium", urgency=urgency,
        recommendation_reason="Part of your recurring academic timetable.", status=str((entity.entity_metadata or {}).get("status", "planned")),
        destination="subject" if context and context.type == "subject_topic" else "entity",
        destination_id=context.id if context and context.type == "subject_topic" else entity.id,
        allowed_actions=["open"], filters=item_filters(entity, context),
    )

def recall_item(item: RecallDueItem, entities: dict[UUID, Entity]) -> AgendaItemRead:
    entity = item.entity
    context = parent_context(entity, entities)
    return AgendaItemRead(
        id=f"recall:{entity.id}", kind="recall", source_entity_id=entity.id, source_type="entity", context=context,
        title=entity.title or "Untitled recall", description=None, estimated_minutes=8, priority="high" if item.days_until_exam is not None and item.days_until_exam <= 7 else "medium",
        urgency="overdue" if item.days_until_exam is not None and item.days_until_exam < 0 else "today", recommendation_reason=item.due_reasons[0] if item.due_reasons else "Ready for recall.",
        status="due", destination="recall", destination_id=entity.id, allowed_actions=["start", "open"], filters=item_filters(entity, context, revision=True),
    )


def comprehension_item(check: ComprehensionCheck, entities: dict[UUID, Entity]) -> AgendaItemRead:
    entity = entities.get(check.entity_id) if check.entity_id else None
    context = parent_context(entity, entities) if entity else None
    return AgendaItemRead(
        id=f"comprehension:{check.id}", kind="comprehension", source_entity_id=check.entity_id, source_type="comprehension_check", context=context,
        title=f"Explain {entity.title}" if entity and entity.title else "Complete comprehension check", description=check.question,
        estimated_minutes=10, priority="high" if check.ai_assist_level in {"ai-generated", "ai-paired"} else "medium", urgency="today",
        recommendation_reason="A pending comprehension check is waiting after assisted work.", status="pending", destination="comprehension", destination_id=check.id,
        allowed_actions=["start", "open"], filters=item_filters(entity, context, revision=True),
    )


def project_item(row: ProjectTrackerItemRead, entities: dict[UUID, Entity], now: datetime) -> AgendaItemRead:
    project = entities.get(row.project.id)
    deadline = parse_datetime(row.next_deadline, end_of_day=True)
    urgency = "overdue" if deadline and deadline < now else "today" if deadline and deadline.date() == now.date() else "upcoming" if deadline else "unscheduled"
    return AgendaItemRead(
        id=f"project:{row.project.id}", kind="project", source_entity_id=row.project.id, source_type="entity", context=AgendaContextRead(id=row.project.id, type="project", title=row.project.title),
        title=row.project.title or "Untitled project", description=row.health_reasons[0] if row.health_reasons else None, deadline=deadline,
        priority="high" if row.health in {"stalled", "at_risk"} else "medium", urgency=urgency,
        recommendation_reason=row.health_reasons[0] if row.health_reasons else "This project needs attention.", status=row.health,
        destination="project", destination_id=row.project.id, allowed_actions=["open"], filters=item_filters(project, None),
    )


def sort_items(items: Iterable[AgendaItemRead]) -> list[AgendaItemRead]:
    far = datetime.max.replace(tzinfo=timezone.utc)
    urgency_order = {"overdue": 0, "today": 1, "upcoming": 2, "unscheduled": 3}
    return sorted(items, key=lambda item: (urgency_order[item.urgency], item.start_at or item.deadline or far, PRIORITY_ORDER[item.priority], item.title.lower(), item.id))


def preview(items: list[AgendaItemRead], limit: int) -> AgendaPreviewRead:
    return AgendaPreviewRead(total=len(items), items=items[:limit])


def build_agenda(*, entities: list[Entity], sessions: list[ActivitySession], recalls: list[RecallDueItem], checks: list[ComprehensionCheck], projects: list[ProjectTrackerItemRead], start_date: date, end_date: date, now: datetime | None = None, preview_limit: int = 8, available_minutes: int | None = None) -> TodayAgendaResponse:
    current = as_utc(now) or datetime.now(timezone.utc)
    entity_by_id = {entity.id: entity for entity in entities}
    items: list[AgendaItemRead] = []
    items.extend(task_item(entity, entity_by_id, current) for entity in entities if entity.type == "task" and not is_terminal_task_status(str((entity.entity_metadata or {}).get("status", "backlog"))))
    items.extend(item for item in (exam_item(entity, entity_by_id, current) for entity in entities if entity.type == "subject_topic") if item is not None)
    items.extend(study_item(session, entity_by_id.get(session.entity_id), entity_by_id, current) for session in sessions if session.action == "study_planned" and session.date is not None and (session.meta or {}).get("status", "planned") == "planned")
    items.extend(recall_item(item, entity_by_id) for item in recalls)
    items.extend(comprehension_item(check, entity_by_id) for check in checks if check.answered_at is None)
    items.extend(project_item(row, entity_by_id, current) for row in projects if row.health in {"at_risk", "stalled"})

    range_start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    range_end = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
    scheduled = [item for item in items if item.start_at or item.deadline]
    in_range = [item for item in scheduled if (item.start_at or item.deadline) and range_start <= (item.start_at or item.deadline) <= range_end]
    overdue = sort_items([item for item in items if item.urgency == "overdue"])
    today = sort_items([item for item in items if item.urgency == "today" and item.kind not in {"recall", "comprehension"}])
    upcoming = sort_items([item for item in in_range if item.urgency == "upcoming"])
    unscheduled = sort_items([item for item in items if item.urgency == "unscheduled"])
    recall = sort_items([item for item in items if item.kind == "recall"])
    comprehension = sort_items([item for item in items if item.kind == "comprehension"])
    ordered = sort_items(items)
    planned_minutes = sum(item.estimated_minutes or 0 for item in items)
    scheduled_minutes = sum(item.estimated_minutes or 0 for item in scheduled if item.urgency in {"today", "upcoming"})
    return TodayAgendaResponse(
        start_date=start_date, end_date=end_date,
        totals=AgendaTotalsRead(total_items=len(items), overdue_items=len(overdue), scheduled_items=len(scheduled), unscheduled_items=len(unscheduled), recall_items=len(recall), comprehension_items=len(comprehension), planned_minutes=planned_minutes),
        capacity=AgendaCapacityRead(available_minutes=available_minutes, scheduled_minutes=scheduled_minutes, is_over_capacity=available_minutes is not None and scheduled_minutes > available_minutes), recommended=ordered[0] if ordered else None,
        overdue=preview(overdue, preview_limit), today=preview(today, preview_limit), upcoming=preview(upcoming, preview_limit), unscheduled=preview(unscheduled, preview_limit), recall=preview(recall, preview_limit), comprehension=preview(comprehension, preview_limit),
    )
