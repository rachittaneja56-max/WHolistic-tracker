from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import func
from sqlalchemy.sql.elements import ColumnElement

from app.models.entity import Entity


TERMINAL_TASK_STATUSES = frozenset({
    'done',
    'completed',
    'submitted',
    'cancelled',
    'archived',
})


def normalize_task_status(value: object, *, default: str = "todo") -> str:
    if not isinstance(value, str) or not value.strip():
        return default
    return value.strip().lower()


def entity_task_status(entity: Entity, *, default: str = 'todo') -> str:
    return normalize_task_status((entity.entity_metadata or {}).get('status'), default=default)


def is_terminal_task_status(value: object) -> bool:
    return normalize_task_status(value) in TERMINAL_TASK_STATUSES


def is_open_task(entity: Entity) -> bool:
    return not is_terminal_task_status((entity.entity_metadata or {}).get('status'))


def open_task_clause() -> ColumnElement[bool]:
    status = func.lower(func.coalesce(Entity.entity_metadata['status'].astext, 'todo'))
    return status.not_in(tuple(sorted(TERMINAL_TASK_STATUSES)))


def task_priority_key(entity: Entity, *, now: datetime | None = None) -> tuple[int, int, int, datetime, datetime, str, str]:
    """Deterministic task ordering shared by Today and daily guidance."""
    metadata = entity.entity_metadata or {}
    status_value = str(metadata.get("status", "backlog")).strip().lower()
    priority_value = str(metadata.get("priority", "medium")).strip().lower()
    deadline = datetime.max.replace(tzinfo=timezone.utc)
    due_value = metadata.get("due_at")
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
    current_time = current_time.replace(tzinfo=timezone.utc) if current_time.tzinfo is None else current_time.astimezone(timezone.utc)
    created_at = entity.created_at or datetime.max.replace(tzinfo=timezone.utc)
    created_at = created_at.replace(tzinfo=timezone.utc) if created_at.tzinfo is None else created_at.astimezone(timezone.utc)
    return (
        0 if deadline < current_time else 1,
        0 if status_value == "blocked" else 1,
        {"urgent": 0, "high": 1, "medium": 2, "low": 3}.get(priority_value, 2),
        deadline,
        created_at,
        (entity.title or "").lower(),
        str(entity.id),
    )