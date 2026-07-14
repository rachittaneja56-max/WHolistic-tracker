from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.provider import OpenAIProvider
from app.agents.services.recall import get_due_recall_items, parse_exam_date
from app.agents.utils.prompts import build_system_prompt
from app.models.entity import Entity
from app.models.link import Link
from app.api.routes.dashboard import task_priority_key
from app.api.routes.projects import get_project_tracker
from app.schemas.guidance import DailyGuidanceActionRead, DailyGuidanceResponse

TERMINAL_TASK_STATUSES = {"done", "completed", "submitted", "cancelled", "archived"}

DAILY_GUIDANCE_SCHEMA = {
    "title": "daily_guidance_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "date": {"type": "string", "minLength": 10, "maxLength": 10},
        "summary": {"type": "string", "minLength": 1, "maxLength": 600},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 120},
                    "reason": {"type": "string", "minLength": 1, "maxLength": 240},
                    "entity_id": {"type": ["string", "null"]},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["label", "reason", "entity_id", "priority"],
            },
        },
    },
    "required": ["date", "summary", "actions"],
}


def build_daily_guidance_context(db: Session, *, current_date: date, now: datetime) -> dict[str, object]:
    due_items = get_due_recall_items(db, limit=6, now=now)
    low_confidence_entities = db.scalars(
        select(Entity)
        .where(Entity.confidence_score.is_not(None))
        .order_by(Entity.confidence_score.asc(), Entity.created_at.desc())
        .limit(6)
    ).all()

    task_entities = db.scalars(select(Entity).where(Entity.type == "task").order_by(Entity.created_at.desc()).limit(50)).all()
    open_tasks = [
        entity
        for entity in task_entities
        if (entity.entity_metadata or {}).get("status", "todo") not in TERMINAL_TASK_STATUSES
    ]
    open_tasks.sort(key=task_priority_key)
    open_tasks = open_tasks[:6]

    project_attention = [row for row in get_project_tracker(db) if row.health in {"stalled", "at_risk"}][:4]

    upcoming_subjects: list[tuple[date, Entity]] = []
    for entity in db.scalars(select(Entity).where(Entity.type == "subject_topic")).all():
        exam_date = parse_exam_date((entity.entity_metadata or {}).get("exam_date"))
        if exam_date is None:
            continue
        if exam_date < current_date:
            continue
        upcoming_subjects.append((exam_date, entity))
    upcoming_subjects.sort(key=lambda item: item[0])

    suggested_links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "agent_suggested")
        .order_by(Link.created_at.desc())
        .limit(6)
    ).all()

    return {
        "due_items": [
            {
                "entity_id": str(item.entity.id),
                "title": item.entity.title,
                "type": item.entity.type,
                "confidence_score": round(item.entity.confidence_score or 1.0, 2),
                "due_score": item.due_score,
                "reasons": item.due_reasons,
            }
            for item in due_items
        ],
        "low_confidence_entities": [
            {
                "entity_id": str(entity.id),
                "title": entity.title,
                "type": entity.type,
                "confidence_score": round(entity.confidence_score or 1.0, 2),
            }
            for entity in low_confidence_entities
        ],
        "upcoming_exams": [
            {
                "entity_id": str(entity.id),
                "title": entity.title,
                "type": entity.type,
                "exam_date": exam_date.isoformat(),
                "days_until_exam": (exam_date - current_date).days,
            }
            for exam_date, entity in upcoming_subjects[:6]
        ],
        "open_tasks": [
            {
                "entity_id": str(entity.id),
                "title": entity.title,
                "type": entity.type,
                "status": (entity.entity_metadata or {}).get("status", "todo"),
            }
            for entity in open_tasks
        ],
        "project_attention": [
            {
                "entity_id": str(row.project.id),
                "title": row.project.title,
                "health": row.health,
                "reason": row.health_reasons[0] if row.health_reasons else "Project health needs review.",
                "blocked_task_count": row.blocked_task_count,
                "overdue_task_count": row.overdue_task_count,
            }
            for row in project_attention
        ],
        "suggested_links": [
            {
                "link_id": str(link.id),
                "from_title": link.from_entity.title if link.from_entity else None,
                "to_title": link.to_entity.title if link.to_entity else None,
                "relation_type": link.relation_type,
                "explanation": link.explanation,
            }
            for link in suggested_links
        ],
    }


def build_fallback_guidance(context: dict[str, object], *, current_date: date) -> DailyGuidanceResponse:
    actions: list[DailyGuidanceActionRead] = []

    for due_item in list(context["due_items"])[:3]:
        title = due_item.get("title") or "Untitled entity"
        reasons = due_item.get("reasons") or ["Confidence is fading."]
        actions.append(
            DailyGuidanceActionRead(
                label=f"Review {title}",
                reason=str(reasons[0]),
                entity_id=due_item.get("entity_id"),
                priority="high",
            )
        )

    if context["upcoming_exams"]:
        exam_item = context["upcoming_exams"][0]
        title = exam_item.get("title") or "Upcoming subject"
        days_until_exam = exam_item.get("days_until_exam")
        reason = "Exam date is approaching."
        if isinstance(days_until_exam, int):
            if days_until_exam == 0:
                reason = "Exam date is today."
            else:
                reason = f"Exam date is in {days_until_exam} days."
        actions.append(
            DailyGuidanceActionRead(
                label=f"Prepare {title}",
                reason=reason,
                entity_id=exam_item.get("entity_id"),
                priority="high",
            )
        )

    if context["project_attention"]:
        project_item = context["project_attention"][0]
        actions.append(
            DailyGuidanceActionRead(
                label=f"Unblock project: {project_item.get('title') or 'Untitled project'}",
                reason=str(project_item.get("reason") or "Project health needs review."),
                entity_id=project_item.get("entity_id"),
                priority="high",
            )
        )

    if context["open_tasks"]:
        task_item = context["open_tasks"][0]
        actions.append(
            DailyGuidanceActionRead(
                label=f"Move task forward: {task_item.get('title') or 'Untitled task'}",
                reason=f"Task status is {task_item.get('status') or 'todo'}.",
                entity_id=task_item.get("entity_id"),
                priority="medium",
            )
        )

    if context["suggested_links"]:
        link_item = context["suggested_links"][0]
        actions.append(
            DailyGuidanceActionRead(
                label="Review suggested connection",
                reason=(
                    f"Check whether {link_item.get('from_title') or 'one entity'} and "
                    f"{link_item.get('to_title') or 'another entity'} should become a confirmed link."
                ),
                entity_id=None,
                priority="low",
            )
        )

    actions = actions[:5]

    summary_parts: list[str] = []
    due_count = len(context["due_items"])
    exam_count = len(context["upcoming_exams"])
    task_count = len(context["open_tasks"])
    suggested_count = len(context["suggested_links"])
    project_count = len(context["project_attention"])

    if due_count:
        summary_parts.append(f"{due_count} recall item{'s' if due_count != 1 else ''} need attention")
    if exam_count:
        summary_parts.append(f"{exam_count} upcoming exam deadline{'s' if exam_count != 1 else ''}")
    if task_count:
        summary_parts.append(f"{task_count} open task{'s' if task_count != 1 else ''}")
    if project_count:
        summary_parts.append(f"{project_count} project{'s' if project_count != 1 else ''} need attention")
    if suggested_count:
        summary_parts.append(f"{suggested_count} suggested link{'s' if suggested_count != 1 else ''} waiting for review")

    if summary_parts:
        summary = "Today, focus on " + ", ".join(summary_parts) + "."
    else:
        summary = "No urgent guidance items were found today. Capture new work or revisit a recent note to keep the graph moving."

    return DailyGuidanceResponse(date=current_date, summary=summary, actions=actions)


def get_daily_guidance(
    db: Session,
    *,
    provider: OpenAIProvider | None,
    now: datetime | None = None,
) -> DailyGuidanceResponse:
    current_time = now or datetime.now(timezone.utc)
    current_date = current_time.date()
    context = build_daily_guidance_context(db, current_date=current_date, now=current_time)

    if provider is None:
        return build_fallback_guidance(context, current_date=current_date)

    valid_entity_ids = {
        item["entity_id"]
        for key in ("due_items", "low_confidence_entities", "upcoming_exams", "open_tasks", "project_attention")
        for item in context[key]
        if item.get("entity_id")
    }

    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("daily_guidance.md")},
            {
                "role": "user",
                "content": (
                    "Return compact daily guidance JSON using only the provided personal graph context. "
                    "Prefer due recall items and upcoming deadlines over optional work.\n\n"
                    f"Date: {current_date.isoformat()}\n"
                    f"Available entity_ids: {sorted(valid_entity_ids)}\n"
                    f"Context:\n{json.dumps(context, ensure_ascii=True, sort_keys=True)}"
                ),
            },
        ],
        json_schema=DAILY_GUIDANCE_SCHEMA,
        temperature=0.1,
        max_tokens=700,
        model=provider.fast_model,
    )

    actions: list[DailyGuidanceActionRead] = []
    for action in payload.get("actions", [])[:5]:
        raw_entity_id = action.get("entity_id")
        entity_id = raw_entity_id if isinstance(raw_entity_id, str) and raw_entity_id in valid_entity_ids else None
        actions.append(
            DailyGuidanceActionRead(
                label=str(action.get("label", "Untitled action")).strip()[:120],
                reason=str(action.get("reason", "No reason provided.")).strip()[:240],
                entity_id=entity_id,
                priority=str(action.get("priority", "medium")),
            )
        )

    if not actions and any(
        context[key]
        for key in ("due_items", "upcoming_exams", "open_tasks", "project_attention", "suggested_links")
    ):
        return build_fallback_guidance(context, current_date=current_date)

    return DailyGuidanceResponse(
        date=current_date,
        summary=str(payload.get("summary", "No guidance available.")).strip()[:600],
        actions=actions,
    )
