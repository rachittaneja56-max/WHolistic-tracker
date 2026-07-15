from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from statistics import mean
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.context import serialize_untrusted_context
from app.agents.services.recall import parse_exam_date
from app.agents.utils.prompts import build_system_prompt
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession
from app.services.github import normalize_repo_identifier
from app.schemas.analyst import AnalystWeeklyResponse

ANALYST_SCHEMA = {
    "title": "analyst_weekly_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "headline": {"type": "string", "minLength": 1, "maxLength": 320},
        "trends": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 120},
                    "evidence": {"type": "string", "minLength": 1, "maxLength": 240},
                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["label", "evidence", "severity"],
            },
        },
        "gaps": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "gap": {"type": "string", "minLength": 1, "maxLength": 160},
                    "evidence": {"type": "string", "minLength": 1, "maxLength": 260},
                    "suggested_action": {"type": "string", "minLength": 1, "maxLength": 180},
                    "related_entity_ids": {
                        "type": "array",
                        "items": {"type": "string", "minLength": 1, "maxLength": 80},
                        "maxItems": 8,
                    },
                },
                "required": ["gap", "evidence", "suggested_action", "related_entity_ids"],
            },
        },
        "solve_rate": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string", "minLength": 1, "maxLength": 220},
                "easy": {"type": "integer", "minimum": 0},
                "medium": {"type": "integer", "minimum": 0},
                "hard": {"type": "integer", "minimum": 0},
            },
            "required": ["summary", "easy", "medium", "hard"],
        },
        "learning_debt": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 120},
                    "reason": {"type": "string", "minLength": 1, "maxLength": 220},
                    "suggested_action": {"type": "string", "minLength": 1, "maxLength": 180},
                },
                "required": ["label", "reason", "suggested_action"],
            },
        },
        "next_week_focus": {
            "type": "array",
            "maxItems": 6,
            "items": {"type": "string", "minLength": 1, "maxLength": 180},
        },
    },
    "required": ["headline", "trends", "gaps", "solve_rate", "learning_debt", "next_week_focus"],
}
LOW_CONFIDENCE_THRESHOLD = 0.65


@dataclass(slots=True)
class AnalystContext:
    start_date: date
    end_date: date
    dsa_created: list[Entity]
    dsa_revisited: list[Entity]
    difficulty_distribution: Counter[str]
    review_scores: list[int]
    low_confidence_topics: list[Entity]
    tag_gap_candidates: list[dict[str, object]]
    project_commit_gaps: list[dict[str, object]]
    completed_tasks: list[Entity]
    flagged_checks: list[ComprehensionCheck]
    pending_links: list[Link]
    upcoming_deadlines: list[tuple[date, Entity]]


def get_default_analyst_range(now: datetime | None = None) -> tuple[date, date]:
    current_time = now or datetime.now(timezone.utc)
    end_date = current_time.date()
    start_date = end_date - timedelta(days=6)
    return start_date, end_date


def build_analyst_context(db: Session, *, start_date: date, end_date: date) -> AnalystContext:
    range_start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    range_end = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
    current_date = end_date

    dsa_created = db.scalars(
        select(Entity)
        .where(Entity.type == "dsa_problem")
        .where(Entity.created_at.is_not(None))
        .where(Entity.created_at >= range_start)
        .where(Entity.created_at <= range_end)
        .order_by(Entity.created_at.desc())
    ).all()

    revisited_entity_ids = {
        entity_id
        for entity_id in db.scalars(
            select(ActivitySession.entity_id)
            .where(ActivitySession.action == "revisited")
            .where(ActivitySession.date.is_not(None))
            .where(ActivitySession.date >= range_start)
            .where(ActivitySession.date <= range_end)
            .where(ActivitySession.entity_id.is_not(None))
        ).all()
        if entity_id is not None
    }
    dsa_revisited = db.scalars(
        select(Entity)
        .where(Entity.type == "dsa_problem")
        .where(Entity.id.in_(revisited_entity_ids))
        .order_by(Entity.created_at.desc())
    ).all() if revisited_entity_ids else []

    difficulty_distribution: Counter[str] = Counter()
    for entity in dsa_created:
        difficulty = (entity.entity_metadata or {}).get("difficulty")
        if isinstance(difficulty, str) and difficulty.strip():
            difficulty_distribution[difficulty.strip().lower()] += 1

    review_scores = [
        score
        for score in db.scalars(
            select(Review.recalled_score)
            .where(Review.reviewed_at.is_not(None))
            .where(Review.reviewed_at >= range_start)
            .where(Review.reviewed_at <= range_end)
            .where(Review.recalled_score.is_not(None))
        ).all()
        if isinstance(score, int)
    ]

    low_confidence_topics = db.scalars(
        select(Entity)
        .where(Entity.confidence_score.is_not(None))
        .where(Entity.confidence_score < LOW_CONFIDENCE_THRESHOLD)
        .order_by(Entity.confidence_score.asc(), Entity.created_at.desc())
        .limit(8)
    ).all()

    all_entities = db.scalars(select(Entity)).all()
    tags_to_entities: dict[str, list[Entity]] = defaultdict(list)
    for entity in all_entities:
        for tag in entity.tags or []:
            cleaned = tag.strip()
            if cleaned:
                tags_to_entities[cleaned].append(entity)

    tag_gap_candidates: list[dict[str, object]] = []
    for tag, entities in tags_to_entities.items():
        if len(entities) < 3:
            continue
        note_or_concept = [entity for entity in entities if entity.type in {"concept", "note"}]
        if note_or_concept:
            continue
        related_ids = [entity.id for entity in entities[:5]]
        tag_gap_candidates.append(
            {
                "tag": tag,
                "count": len(entities),
                "related_entity_ids": related_ids,
            }
        )
    tag_gap_candidates.sort(key=lambda item: int(item["count"]), reverse=True)

    projects = db.scalars(select(Entity).where(Entity.type == "project")).all()
    weekly_tils = db.scalars(
        select(Entity)
        .where(Entity.type == "til")
        .where(Entity.created_at.is_not(None))
        .where(Entity.created_at >= range_start)
        .where(Entity.created_at <= range_end)
    ).all()
    project_commit_gaps: list[dict[str, object]] = []
    for project in projects:
        push_sessions = db.scalars(
            select(ActivitySession)
            .where(ActivitySession.entity_id == project.id)
            .where(ActivitySession.action == "push")
            .where(ActivitySession.date.is_not(None))
            .where(ActivitySession.date >= range_start)
            .where(ActivitySession.date <= range_end)
        ).all()
        project_repo = normalize_repo_identifier(str((project.entity_metadata or {}).get("repo_url") or ""))
        matching_tils = [
            til
            for til in weekly_tils
            if normalize_repo_identifier(str((til.entity_metadata or {}).get("repo_full_name") or "")) == project_repo
        ]
        if len(push_sessions) >= 3 and len(matching_tils) <= 1:
            project_commit_gaps.append(
                {
                    "project_id": project.id,
                    "project_title": project.title,
                    "push_count": len(push_sessions),
                    "til_count": len(matching_tils),
                }
            )

    completed_tasks = db.scalars(
        select(Entity)
        .where(Entity.type == "task")
        .where(Entity.entity_metadata.contains({"status": "done"}))
        .where(Entity.created_at.is_not(None))
        .where(Entity.created_at >= range_start)
        .where(Entity.created_at <= range_end)
        .order_by(Entity.created_at.desc())
        .limit(50)
    ).all()

    flagged_checks = db.scalars(
        select(ComprehensionCheck)
        .options(joinedload(ComprehensionCheck.entity))
        .where(ComprehensionCheck.ai_grade == "flagged")
        .where(ComprehensionCheck.answered_at.is_not(None))
        .where(ComprehensionCheck.answered_at >= range_start)
        .where(ComprehensionCheck.answered_at <= range_end)
        .order_by(ComprehensionCheck.answered_at.desc())
    ).all()

    pending_links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "agent_suggested")
        .order_by(Link.created_at.desc())
        .limit(12)
    ).all()

    upcoming_deadlines: list[tuple[date, Entity]] = []
    for entity in db.scalars(select(Entity).where(Entity.type == "subject_topic")).all():
        exam_date = parse_exam_date((entity.entity_metadata or {}).get("exam_date"))
        if exam_date is None or exam_date < current_date:
            continue
        upcoming_deadlines.append((exam_date, entity))
    upcoming_deadlines.sort(key=lambda item: item[0])

    return AnalystContext(
        start_date=start_date,
        end_date=end_date,
        dsa_created=dsa_created,
        dsa_revisited=dsa_revisited,
        difficulty_distribution=difficulty_distribution,
        review_scores=review_scores,
        low_confidence_topics=low_confidence_topics,
        tag_gap_candidates=tag_gap_candidates[:6],
        project_commit_gaps=project_commit_gaps[:6],
        completed_tasks=completed_tasks,
        flagged_checks=flagged_checks,
        pending_links=pending_links,
        upcoming_deadlines=upcoming_deadlines[:6],
    )


def serialize_analyst_context(context: AnalystContext) -> dict[str, object]:
    return {
        "range": {"start_date": context.start_date.isoformat(), "end_date": context.end_date.isoformat()},
        "dsa": {
            "created_count": len(context.dsa_created),
            "revisited_count": len(context.dsa_revisited),
            "created_titles": [entity.title for entity in context.dsa_created[:10]],
            "revisited_titles": [entity.title for entity in context.dsa_revisited[:10]],
            "difficulty_distribution": dict(context.difficulty_distribution),
        },
        "review_scores": context.review_scores[:20],
        "average_review_score": round(mean(context.review_scores), 2) if context.review_scores else None,
        "low_confidence_topics": [
            {"entity_id": str(entity.id), "title": entity.title, "confidence_score": round(entity.confidence_score or 0.0, 2)}
            for entity in context.low_confidence_topics
        ],
        "tag_gap_candidates": [
            {"tag": item["tag"], "count": item["count"], "related_entity_ids": [str(entity_id) for entity_id in item["related_entity_ids"]]}
            for item in context.tag_gap_candidates
        ],
        "project_commit_gaps": [
            {
                "project_id": str(item["project_id"]),
                "project_title": item["project_title"],
                "push_count": item["push_count"],
                "til_count": item["til_count"],
            }
            for item in context.project_commit_gaps
        ],
        "completed_tasks": [{"entity_id": str(entity.id), "title": entity.title} for entity in context.completed_tasks[:12]],
        "flagged_checks": [
            {"check_id": str(check.id), "entity_id": str(check.entity_id) if check.entity_id else None, "title": check.entity.title if check.entity else None}
            for check in context.flagged_checks[:12]
        ],
        "pending_links": [
            {
                "link_id": str(link.id),
                "from_title": link.from_entity.title if link.from_entity else None,
                "to_title": link.to_entity.title if link.to_entity else None,
                "explanation": link.explanation,
            }
            for link in context.pending_links[:12]
        ],
        "upcoming_deadlines": [
            {"entity_id": str(entity.id), "title": entity.title, "date": exam_date.isoformat()}
            for exam_date, entity in context.upcoming_deadlines
        ],
    }


def build_fallback_analyst(context: AnalystContext) -> AnalystWeeklyResponse:
    easy = int(context.difficulty_distribution.get("easy", 0))
    medium = int(context.difficulty_distribution.get("medium", 0))
    hard = int(context.difficulty_distribution.get("hard", 0))

    trends: list[dict[str, object]] = []
    gaps: list[dict[str, object]] = []
    learning_debt: list[dict[str, str]] = []
    next_week_focus: list[str] = []

    if context.dsa_created or context.dsa_revisited:
        trends.append(
            {
                "label": "DSA activity recorded",
                "evidence": f"Created {len(context.dsa_created)} and revisited {len(context.dsa_revisited)} DSA problems this week.",
                "severity": "low" if len(context.dsa_created) + len(context.dsa_revisited) >= 4 else "medium",
            }
        )
    else:
        trends.append(
            {
                "label": "No DSA movement captured",
                "evidence": "No DSA problems were created or revisited in the selected week.",
                "severity": "high",
            }
        )

    if context.review_scores:
        average_score = mean(context.review_scores)
        trends.append(
            {
                "label": "Recall signal",
                "evidence": f"Average review score was {average_score:.2f} across {len(context.review_scores)} review(s).",
                "severity": "low" if average_score >= 4 else "medium" if average_score >= 3 else "high",
            }
        )
    if context.low_confidence_topics:
        topic = context.low_confidence_topics[0]
        trends.append(
            {
                "label": "Fading knowledge detected",
                "evidence": f"{topic.title or 'One topic'} is down to confidence {(topic.confidence_score or 0.0):.2f}.",
                "severity": "high",
            }
        )
        learning_debt.append(
            {
                "label": f"Revisit {topic.title or 'fading topic'}",
                "reason": f"Confidence is {(topic.confidence_score or 0.0):.2f}, below the healthy threshold.",
                "suggested_action": "Open the entity and mark it revisited after a short review.",
            }
        )
        next_week_focus.append(f"Reinforce {topic.title or 'a fading topic'}")

    if context.tag_gap_candidates:
        tag_gap = context.tag_gap_candidates[0]
        gaps.append(
            {
                "gap": f"No dedicated concept or note for #{tag_gap['tag']}",
                "evidence": f"The tag appears on {tag_gap['count']} entities but still has no concept or note entity.",
                "suggested_action": f"Create a note that explains the core idea behind #{tag_gap['tag']}.",
                "related_entity_ids": list(tag_gap["related_entity_ids"]),
            }
        )
    if context.project_commit_gaps:
        project_gap = context.project_commit_gaps[0]
        gaps.append(
            {
                "gap": f"{project_gap['project_title'] or 'A project'} has shipping without captured learning",
                "evidence": f"{project_gap['push_count']} pushes were recorded but only {project_gap['til_count']} TIL(s) were captured this week.",
                "suggested_action": "Capture one short TIL summarizing the most important implementation lesson.",
                "related_entity_ids": [project_gap["project_id"]],
            }
        )

    if context.flagged_checks:
        flagged = context.flagged_checks[0]
        learning_debt.append(
            {
                "label": f"Resolve flagged comprehension on {flagged.entity.title if flagged.entity else 'a task'}",
                "reason": "A comprehension check was flagged this week.",
                "suggested_action": "Re-explain the task in your own words and capture the missing concept as a note.",
            }
        )
    if context.pending_links:
        link = context.pending_links[0]
        learning_debt.append(
            {
                "label": "Clear pending link review",
                "reason": f"{link.from_entity.title if link.from_entity else 'One entity'} and {link.to_entity.title if link.to_entity else 'another entity'} still need confirmation.",
                "suggested_action": "Review the explanation and confirm or reject the suggested connection.",
            }
        )
    if context.upcoming_deadlines:
        exam_date, entity = context.upcoming_deadlines[0]
        next_week_focus.append(f"Prepare {entity.title or 'upcoming subject'} before {exam_date.isoformat()}")

    if not next_week_focus:
        next_week_focus.append("Capture one durable note from your most active project or study thread.")
    if not gaps:
        gaps.append(
            {
                "gap": "No major structural gap was obvious",
                "evidence": "The selected week did not show a strong concept coverage hole from the available graph data.",
                "suggested_action": "Keep capturing short notes when a recurring tag starts to spread.",
                "related_entity_ids": [],
            }
        )

    solve_summary = f"Solved or captured {len(context.dsa_created)} DSA problems this week with difficulty split easy {easy}, medium {medium}, hard {hard}."
    headline = (
        f"This week shows {len(context.dsa_created)} DSA capture(s), {len(context.review_scores)} review(s), "
        f"and {len(context.pending_links)} pending suggested link(s)."
    )

    return AnalystWeeklyResponse(
        headline=headline,
        trends=trends[:6],
        gaps=gaps[:6],
        solve_rate={"summary": solve_summary, "easy": easy, "medium": medium, "hard": hard},
        learning_debt=learning_debt[:6],
        next_week_focus=next_week_focus[:6],
    )


def get_weekly_analyst_brief(
    db: Session,
    *,
    start_date: date,
    end_date: date,
    provider: OpenAIProvider | None,
) -> AnalystWeeklyResponse:
    context = build_analyst_context(db, start_date=start_date, end_date=end_date)
    if provider is None:
        return build_fallback_analyst(context)

    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("analyst_weekly.md")},
            {
                "role": "user",
                "content": (
                    "Return a grounded weekly analyst brief using only this personal knowledge graph evidence. "
                    "Do not invent missing data or overstate weak trends.\n\n"
                    f"{serialize_untrusted_context('weekly', provenance='analyst_graph_summary', data=serialize_analyst_context(context))}"
                ),
            },
        ],
        json_schema=ANALYST_SCHEMA,
        temperature=0.1,
        max_tokens=1200,
        model=provider.smart_model,
    )

    valid_entity_ids = {str(entity.id) for entity in context.dsa_created + context.dsa_revisited + context.low_confidence_topics + context.completed_tasks}
    valid_entity_ids.update(str(entity.id) for _, entity in context.upcoming_deadlines)
    for item in context.tag_gap_candidates:
        valid_entity_ids.update(str(entity_id) for entity_id in item["related_entity_ids"])
    for item in context.project_commit_gaps:
        valid_entity_ids.add(str(item["project_id"]))
    for check in context.flagged_checks:
        if check.entity_id:
            valid_entity_ids.add(str(check.entity_id))

    return AnalystWeeklyResponse(
        headline=str(payload.get("headline", "No analyst headline available.")).strip()[:320],
        trends=[
            {
                "label": str(item.get("label", "Untitled trend")).strip()[:120],
                "evidence": str(item.get("evidence", "No evidence provided.")).strip()[:240],
                "severity": str(item.get("severity", "medium")),
            }
            for item in payload.get("trends", [])
            if isinstance(item, dict)
        ][:6],
        gaps=[
            {
                "gap": str(item.get("gap", "Untitled gap")).strip()[:160],
                "evidence": str(item.get("evidence", "No evidence provided.")).strip()[:260],
                "suggested_action": str(item.get("suggested_action", "No action provided.")).strip()[:180],
                "related_entity_ids": [entity_id for entity_id in item.get("related_entity_ids", []) if isinstance(entity_id, str) and entity_id in valid_entity_ids][:8],
            }
            for item in payload.get("gaps", [])
            if isinstance(item, dict)
        ][:6],
        solve_rate={
            "summary": str((payload.get("solve_rate") or {}).get("summary", "No solve-rate summary available.")).strip()[:220],
            "easy": int((payload.get("solve_rate") or {}).get("easy", 0)),
            "medium": int((payload.get("solve_rate") or {}).get("medium", 0)),
            "hard": int((payload.get("solve_rate") or {}).get("hard", 0)),
        },
        learning_debt=[
            {
                "label": str(item.get("label", "Untitled debt item")).strip()[:120],
                "reason": str(item.get("reason", "No reason provided.")).strip()[:220],
                "suggested_action": str(item.get("suggested_action", "No action provided.")).strip()[:180],
            }
            for item in payload.get("learning_debt", [])
            if isinstance(item, dict)
        ][:6],
        next_week_focus=[str(item).strip()[:180] for item in payload.get("next_week_focus", []) if str(item).strip()][:6],
    )
