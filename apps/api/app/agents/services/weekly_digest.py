from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.context import serialize_untrusted_context
from app.agents.services.recall import get_due_recall_items, parse_exam_date
from app.agents.utils.prompts import build_system_prompt
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession
from app.schemas.weekly import WeeklyDigestResponse

LOW_CONFIDENCE_THRESHOLD = 0.65
MAX_ITEMS = 6
WEEKLY_DIGEST_SCHEMA = {
    "title": "weekly_digest_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string", "minLength": 1, "maxLength": 500},
        "wins": {
            "type": "array",
            "items": {"type": "string", "minLength": 1, "maxLength": 200},
            "maxItems": 6,
        },
        "needs_attention": {
            "type": "array",
            "items": {"type": "string", "minLength": 1, "maxLength": 220},
            "maxItems": 6,
        },
        "suggested_next_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 120},
                    "reason": {"type": "string", "minLength": 1, "maxLength": 220},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["label", "reason", "priority"],
            },
            "maxItems": 6,
        },
    },
    "required": ["summary", "wins", "needs_attention", "suggested_next_actions"],
}


@dataclass(slots=True)
class WeeklyDigestContext:
    start_date: date
    end_date: date
    new_entities: list[Entity]
    revisited_sessions: list[ActivitySession]
    reviews: list[Review]
    confirmed_links: list[Link]
    pending_suggested_links: list[Link]
    low_confidence_entities: list[Entity]
    upcoming_subject_topics: list[tuple[date, Entity]]
    open_tasks: list[Entity]
    comprehension_pending: list[ComprehensionCheck]
    comprehension_flagged: list[ComprehensionCheck]



def get_default_weekly_range(now: datetime | None = None) -> tuple[date, date]:
    current_time = now or datetime.now(timezone.utc)
    end_date = current_time.date()
    start_date = end_date - timedelta(days=6)
    return start_date, end_date



def build_weekly_digest_context(db: Session, *, start_date: date, end_date: date) -> WeeklyDigestContext:
    range_start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    range_end = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
    current_date = end_date

    new_entities = db.scalars(
        select(Entity)
        .where(Entity.created_at.is_not(None))
        .where(Entity.created_at >= range_start)
        .where(Entity.created_at <= range_end)
        .order_by(Entity.created_at.desc())
    ).all()

    revisited_sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action == "revisited")
        .where(ActivitySession.date.is_not(None))
        .where(ActivitySession.date >= range_start)
        .where(ActivitySession.date <= range_end)
        .order_by(ActivitySession.date.desc())
    ).all()

    reviews = db.scalars(
        select(Review)
        .where(Review.reviewed_at.is_not(None))
        .where(Review.reviewed_at >= range_start)
        .where(Review.reviewed_at <= range_end)
        .order_by(Review.reviewed_at.desc())
    ).all()

    confirmed_links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "confirmed")
        .where(Link.created_at.is_not(None))
        .where(Link.created_at >= range_start)
        .where(Link.created_at <= range_end)
        .order_by(Link.created_at.desc())
    ).all()

    pending_suggested_links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "agent_suggested")
        .order_by(Link.created_at.desc())
        .limit(20)
    ).all()

    low_confidence_entities = db.scalars(
        select(Entity)
        .where(Entity.confidence_score.is_not(None))
        .where(Entity.confidence_score < LOW_CONFIDENCE_THRESHOLD)
        .order_by(Entity.confidence_score.asc(), Entity.created_at.desc())
        .limit(20)
    ).all()

    upcoming_subject_topics: list[tuple[date, Entity]] = []
    for entity in db.scalars(select(Entity).where(Entity.type == "subject_topic")).all():
        exam_date = parse_exam_date((entity.entity_metadata or {}).get("exam_date"))
        if exam_date is None or exam_date < current_date:
            continue
        upcoming_subject_topics.append((exam_date, entity))
    upcoming_subject_topics.sort(key=lambda item: item[0])

    open_tasks = [
        entity
        for entity in db.scalars(select(Entity).where(Entity.type == "task").order_by(Entity.created_at.desc()).limit(200)).all()
        if (entity.entity_metadata or {}).get("status", "todo") != "done"
    ]

    comprehension_pending = db.scalars(
        select(ComprehensionCheck)
        .options(joinedload(ComprehensionCheck.entity))
        .where(ComprehensionCheck.answered_at.is_(None))
        .order_by(ComprehensionCheck.created_at.desc())
        .limit(50)
    ).all()

    comprehension_flagged = db.scalars(
        select(ComprehensionCheck)
        .options(joinedload(ComprehensionCheck.entity))
        .where(ComprehensionCheck.ai_grade == "flagged")
        .order_by(ComprehensionCheck.answered_at.desc(), ComprehensionCheck.created_at.desc())
        .limit(50)
    ).all()

    return WeeklyDigestContext(
        start_date=start_date,
        end_date=end_date,
        new_entities=new_entities,
        revisited_sessions=revisited_sessions,
        reviews=reviews,
        confirmed_links=confirmed_links,
        pending_suggested_links=pending_suggested_links,
        low_confidence_entities=low_confidence_entities,
        upcoming_subject_topics=upcoming_subject_topics,
        open_tasks=open_tasks,
        comprehension_pending=comprehension_pending,
        comprehension_flagged=comprehension_flagged,
    )



def get_weekly_digest(
    db: Session,
    *,
    start_date: date,
    end_date: date,
    provider: OpenAIProvider | None,
) -> WeeklyDigestResponse:
    context = build_weekly_digest_context(db, start_date=start_date, end_date=end_date)

    if provider is None:
        return build_fallback_digest(context)

    prompt_context = serialize_weekly_digest_context(context)
    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("weekly_digest.md")},
            {
                "role": "user",
                "content": (
                    "Return a concise weekly digest JSON using only this personal knowledge graph data. "
                    "Do not invent progress or actions.\n\n"
                    f"{serialize_untrusted_context('weekly', provenance='weekly_graph_summary', data=prompt_context)}"
                ),
            },
        ],
        json_schema=WEEKLY_DIGEST_SCHEMA,
        temperature=0.1,
        max_tokens=900,
        model=provider.fast_model,
    )

    return WeeklyDigestResponse(
        range={"start_date": start_date, "end_date": end_date},
        summary=str(payload.get("summary", "No summary available.")).strip()[:500],
        wins=[str(item).strip()[:200] for item in payload.get("wins", []) if str(item).strip()][:6],
        needs_attention=[str(item).strip()[:220] for item in payload.get("needs_attention", []) if str(item).strip()][:6],
        new_connections=[
            {
                "link_id": link.id,
                "from_title": link.from_entity.title if link.from_entity else None,
                "to_title": link.to_entity.title if link.to_entity else None,
                "explanation": link.explanation,
            }
            for link in context.confirmed_links[:MAX_ITEMS]
        ],
        fading_topics=[
            {
                "entity_id": entity.id,
                "title": entity.title,
                "confidence_score": round(entity.confidence_score or 0.0, 2),
            }
            for entity in context.low_confidence_entities[:MAX_ITEMS]
        ],
        upcoming_deadlines=[
            {"entity_id": entity.id, "title": entity.title, "date": exam_date}
            for exam_date, entity in context.upcoming_subject_topics[:MAX_ITEMS]
        ],
        suggested_next_actions=[
            {
                "label": str(item.get("label", "Untitled action")).strip()[:120],
                "reason": str(item.get("reason", "No reason provided.")).strip()[:220],
                "priority": str(item.get("priority", "medium")),
            }
            for item in payload.get("suggested_next_actions", [])
            if isinstance(item, dict)
        ][:6],
    )



def build_fallback_digest(context: WeeklyDigestContext) -> WeeklyDigestResponse:
    wins: list[str] = []
    needs_attention: list[str] = []
    actions: list[dict[str, str]] = []

    if context.new_entities:
        wins.append(f"Captured {len(context.new_entities)} new entit{'y' if len(context.new_entities) == 1 else 'ies'} this week.")
    if context.reviews:
        wins.append(f"Completed {len(context.reviews)} recall review{'s' if len(context.reviews) != 1 else ''}.")
    if context.confirmed_links:
        wins.append(f"Confirmed {len(context.confirmed_links)} graph connection{'s' if len(context.confirmed_links) != 1 else ''}.")

    if context.pending_suggested_links:
        needs_attention.append(f"{len(context.pending_suggested_links)} suggested link{'s' if len(context.pending_suggested_links) != 1 else ''} still need review.")
        first_link = context.pending_suggested_links[0]
        actions.append(
            {
                "label": "Review link suggestions",
                "reason": f"{first_link.from_entity.title if first_link.from_entity else 'One entity'} and {first_link.to_entity.title if first_link.to_entity else 'another entity'} are still waiting in the inbox.",
                "priority": "medium",
            }
        )
    if context.low_confidence_entities:
        needs_attention.append(f"{len(context.low_confidence_entities)} entit{'y is' if len(context.low_confidence_entities) == 1 else 'ies are'} below confidence {LOW_CONFIDENCE_THRESHOLD:.2f}.")
        first_entity = context.low_confidence_entities[0]
        actions.append(
            {
                "label": f"Revisit {first_entity.title or 'a fading note'}",
                "reason": f"Confidence is down to {(first_entity.confidence_score or 0.0):.2f}.",
                "priority": "high",
            }
        )
    if context.comprehension_pending or context.comprehension_flagged:
        total_debt = len(context.comprehension_pending) + len(context.comprehension_flagged)
        needs_attention.append(f"{total_debt} comprehension check{'s' if total_debt != 1 else ''} are pending or flagged.")
        actions.append(
            {
                "label": "Clear comprehension debt",
                "reason": "AI-assisted work still has unanswered or flagged checks.",
                "priority": "high",
            }
        )
    if context.upcoming_subject_topics:
        exam_date, entity = context.upcoming_subject_topics[0]
        actions.append(
            {
                "label": f"Prepare {entity.title or 'upcoming subject'}",
                "reason": f"Exam date is {exam_date.isoformat()}.",
                "priority": "high",
            }
        )
    if context.open_tasks:
        task = context.open_tasks[0]
        actions.append(
            {
                "label": f"Move task forward: {task.title or 'untitled task'}",
                "reason": f"Task status is {(task.entity_metadata or {}).get('status', 'todo') }.",
                "priority": "medium",
            }
        )

    if not wins:
        wins.append("No major wins were recorded in the selected range yet.")
    if not needs_attention:
        needs_attention.append("Nothing urgent stood out from the selected range.")

    summary_parts = [
        f"{len(context.new_entities)} new entities",
        f"{len(context.reviews)} reviews",
        f"{len(context.confirmed_links)} confirmed links",
    ]
    if context.comprehension_pending or context.comprehension_flagged:
        summary_parts.append(f"{len(context.comprehension_pending) + len(context.comprehension_flagged)} comprehension debt items")
    summary = "This week: " + ", ".join(summary_parts) + "."

    return WeeklyDigestResponse(
        range={"start_date": context.start_date, "end_date": context.end_date},
        summary=summary,
        wins=wins[:6],
        needs_attention=needs_attention[:6],
        new_connections=[
            {
                "link_id": link.id,
                "from_title": link.from_entity.title if link.from_entity else None,
                "to_title": link.to_entity.title if link.to_entity else None,
                "explanation": link.explanation,
            }
            for link in context.confirmed_links[:MAX_ITEMS]
        ],
        fading_topics=[
            {
                "entity_id": entity.id,
                "title": entity.title,
                "confidence_score": round(entity.confidence_score or 0.0, 2),
            }
            for entity in context.low_confidence_entities[:MAX_ITEMS]
        ],
        upcoming_deadlines=[
            {"entity_id": entity.id, "title": entity.title, "date": exam_date}
            for exam_date, entity in context.upcoming_subject_topics[:MAX_ITEMS]
        ],
        suggested_next_actions=actions[:6],
    )



def serialize_weekly_digest_context(context: WeeklyDigestContext) -> dict[str, object]:
    revisited_titles = []
    seen_titles: set[str] = set()
    for session_row in context.revisited_sessions:
        meta = session_row.meta or {}
        title = meta.get("entity_title") if isinstance(meta.get("entity_title"), str) else None
        if title and title not in seen_titles:
            seen_titles.add(title)
            revisited_titles.append(title)

    return {
        "range": {"start_date": context.start_date.isoformat(), "end_date": context.end_date.isoformat()},
        "new_entities": [
            {"id": str(entity.id), "title": entity.title, "type": entity.type, "tags": entity.tags or []}
            for entity in context.new_entities[:12]
        ],
        "revisited_entities": revisited_titles[:12],
        "reviews_completed": len(context.reviews),
        "confirmed_links": [
            {
                "link_id": str(link.id),
                "from_title": link.from_entity.title if link.from_entity else None,
                "to_title": link.to_entity.title if link.to_entity else None,
                "explanation": link.explanation,
            }
            for link in context.confirmed_links[:12]
        ],
        "pending_review_links": [
            {
                "link_id": str(link.id),
                "from_title": link.from_entity.title if link.from_entity else None,
                "to_title": link.to_entity.title if link.to_entity else None,
                "explanation": link.explanation,
            }
            for link in context.pending_suggested_links[:12]
        ],
        "low_confidence_entities": [
            {
                "entity_id": str(entity.id),
                "title": entity.title,
                "confidence_score": round(entity.confidence_score or 0.0, 2),
            }
            for entity in context.low_confidence_entities[:12]
        ],
        "upcoming_deadlines": [
            {"entity_id": str(entity.id), "title": entity.title, "date": exam_date.isoformat()}
            for exam_date, entity in context.upcoming_subject_topics[:12]
        ],
        "open_tasks": [
            {"entity_id": str(entity.id), "title": entity.title, "status": (entity.entity_metadata or {}).get("status", "todo")}
            for entity in context.open_tasks[:12]
        ],
        "comprehension_checks": {
            "pending": [
                {"check_id": str(check.id), "title": check.entity.title if check.entity else None, "question": check.question}
                for check in context.comprehension_pending[:12]
            ],
            "flagged": [
                {"check_id": str(check.id), "title": check.entity.title if check.entity else None, "question": check.question}
                for check in context.comprehension_flagged[:12]
            ],
        },
    }



def build_tag_taxonomy(db: Session) -> dict[str, dict[str, object]]:
    due_items = get_due_recall_items(db, limit=500)
    due_ids = {item.entity.id for item in due_items}

    entities = db.scalars(select(Entity)).all()
    latest_session_by_entity: dict[object, datetime] = {}
    for session_row in db.scalars(select(ActivitySession).where(ActivitySession.entity_id.is_not(None)).order_by(ActivitySession.date.desc()).limit(1000)).all():
        if session_row.entity_id is None or session_row.date is None or session_row.entity_id in latest_session_by_entity:
            continue
        latest_session_by_entity[session_row.entity_id] = session_row.date

    taxonomy: dict[str, dict[str, object]] = defaultdict(
        lambda: {
            "tag": "",
            "total_entity_count": 0,
            "entity_counts_by_type": defaultdict(int),
            "confidence_total": 0.0,
            "last_activity_at": None,
            "open_task_count": 0,
            "review_due_count": 0,
        }
    )

    for entity in entities:
        tags = [tag.strip() for tag in (entity.tags or []) if tag and tag.strip()]
        if not tags:
            continue
        activity_candidates = [value for value in (entity.last_revisited_at, entity.created_at, latest_session_by_entity.get(entity.id)) if value is not None]
        last_activity = max(activity_candidates) if activity_candidates else None
        is_open_task = entity.type == "task" and (entity.entity_metadata or {}).get("status", "todo") != "done"
        is_due = entity.id in due_ids

        for tag in tags:
            item = taxonomy[tag]
            item["tag"] = tag
            item["total_entity_count"] += 1
            if entity.type:
                item["entity_counts_by_type"][entity.type] += 1
            item["confidence_total"] += float(entity.confidence_score or 1.0)
            if last_activity is not None:
                current_last = item["last_activity_at"]
                item["last_activity_at"] = last_activity if current_last is None or last_activity > current_last else current_last
            if is_open_task:
                item["open_task_count"] += 1
            if is_due:
                item["review_due_count"] += 1

    normalized: dict[str, dict[str, object]] = {}
    for tag, item in taxonomy.items():
        total = int(item["total_entity_count"])
        normalized[tag] = {
            "tag": tag,
            "total_entity_count": total,
            "entity_counts_by_type": dict(sorted(item["entity_counts_by_type"].items())),
            "average_confidence_score": round((float(item["confidence_total"]) / total) if total else 1.0, 2),
            "last_activity_at": item["last_activity_at"],
            "open_task_count": int(item["open_task_count"]),
            "review_due_count": int(item["review_due_count"]),
        }

    return normalized
