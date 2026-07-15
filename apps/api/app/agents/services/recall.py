from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.context import is_ai_excluded, serialize_entity_context
from app.agents.utils.exceptions import ModelResponseError
from app.agents.utils.prompts import build_system_prompt
from app.api.activity import record_session
from app.models.entity import Entity
from app.models.review import Review
from app.schemas.recall import RecallGradePreviewResponse, RecallGradeResponse
from app.services.confidence import apply_recall_result, build_latest_review_map, calculate_entity_confidence

RECALL_DUE_CONFIDENCE_THRESHOLD = 0.72
RECALL_DUE_STALE_DAYS = 10
RECALL_DUE_EXAM_WINDOW_DAYS = 21
RECALL_RESULT_SCHEMA = {
    "title": "recall_grade_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "entity_id": {"type": "string", "minLength": 1, "maxLength": 80},
        "recalled_score": {"type": "integer", "minimum": 1, "maximum": 5},
        "feedback": {"type": "string", "minLength": 1, "maxLength": 600},
        "missed_points": {
            "type": "array",
            "items": {"type": "string", "minLength": 1, "maxLength": 160},
        },
        "next_action": {
            "type": "string",
            "enum": ["review_again", "mark_revisited", "strengthen_note"],
        },
    },
    "required": ["entity_id", "recalled_score", "feedback", "missed_points", "next_action"],
}
FALLBACK_FEEDBACK = {
    1: "You marked this as a weak recall. Review the original note carefully and try again soon.",
    2: "You remembered a small part of it. Revisit the original note and tighten the explanation in your own words.",
    3: "You recalled the core idea partially. A quick follow-up review should make it stick better.",
    4: "You recalled this well. A short revisit is enough to keep it fresh.",
    5: "You recalled this confidently. Mark it as revisited and move on.",
}
FALLBACK_MISSED_POINTS = {
    1: ["Rebuild the main idea from the original note."],
    2: ["Capture the missing steps you could not explain."],
    3: ["Strengthen the details you skipped."],
    4: ["Review one weak edge case or example."],
    5: [],
}
FALLBACK_NEXT_ACTION = {
    1: "review_again",
    2: "review_again",
    3: "strengthen_note",
    4: "mark_revisited",
    5: "mark_revisited",
}


@dataclass(slots=True)
class RecallDueItem:
    entity: Entity
    due_score: float
    due_reasons: list[str]
    days_since_review: int | None
    days_until_exam: int | None


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


def get_due_recall_items(
    db: Session,
    *,
    limit: int = 20,
    tag: str | None = None,
    now: datetime | None = None,
) -> list[RecallDueItem]:
    current_time = now or datetime.now(timezone.utc)
    latest_reviews = build_latest_review_map(db)
    entity_query = select(Entity).order_by(Entity.created_at.desc())
    if tag:
        entity_query = entity_query.where(Entity.tags.any(tag))
    entities = db.scalars(entity_query).all()
    due_items: list[RecallDueItem] = []

    for entity in entities:
        current_confidence = calculate_entity_confidence(entity, latest_reviews.get(entity.id), current_time)
        reference_time = entity.last_revisited_at or entity.created_at
        days_since_review: int | None = None
        if reference_time is not None:
            days_since_review = max(int((current_time - reference_time).total_seconds() // 86_400), 0)

        exam_date = parse_exam_date((entity.entity_metadata or {}).get("exam_date"))
        days_until_exam: int | None = None
        if exam_date is not None:
            days_until_exam = (exam_date - current_time.date()).days

        due_score = 0.0
        due_reasons: list[str] = []

        if current_confidence <= RECALL_DUE_CONFIDENCE_THRESHOLD:
            due_score += (RECALL_DUE_CONFIDENCE_THRESHOLD - current_confidence) * 8 + 1
            due_reasons.append(f"Confidence is fading at {current_confidence:.2f}.")

        if days_since_review is not None and days_since_review >= RECALL_DUE_STALE_DAYS:
            due_score += min(days_since_review / 7, 6)
            due_reasons.append(f"Last revisited {days_since_review} days ago.")

        if days_until_exam is not None and days_until_exam <= RECALL_DUE_EXAM_WINDOW_DAYS:
            due_score += max(0.0, (RECALL_DUE_EXAM_WINDOW_DAYS - max(days_until_exam, 0)) / 3)
            if days_until_exam < 0:
                due_reasons.append("The related exam date has already passed.")
            elif days_until_exam == 0:
                due_reasons.append("The related exam date is today.")
            else:
                due_reasons.append(f"Exam date is in {days_until_exam} days.")

        if due_score <= 0:
            continue

        entity.confidence_score = current_confidence
        due_items.append(
            RecallDueItem(
                entity=entity,
                due_score=round(due_score, 2),
                due_reasons=due_reasons,
                days_since_review=days_since_review,
                days_until_exam=days_until_exam,
            )
        )

    due_items.sort(
        key=lambda item: (
            -item.due_score,
            item.days_until_exam if item.days_until_exam is not None else 9999,
            -(item.days_since_review or 0),
            item.entity.created_at or current_time,
        )
    )
    return due_items[:limit]


def build_recall_grading_context(entity: Entity, answer: str) -> str:
    return serialize_entity_context(
        "recall",
        entity,
        provenance="personal_graph_entity_and_recall_answer",
        content_chars=5_000,
        extra={"answer": answer},
    )


def finalize_recall_grade(
    *,
    entity: Entity,
    recalled_score: int,
    feedback: str,
    missed_points: list[str],
    next_action: str,
    reviewed_at: datetime,
    db: Session,
    used_fallback: bool,
) -> RecallGradeResponse:
    apply_recall_result(entity, recalled_score, reviewed_at)
    review = Review(
        id=uuid.uuid4(),
        entity_id=entity.id,
        recalled_score=recalled_score,
        reviewed_at=reviewed_at,
    )
    db.add(review)
    record_session(
        db,
        entity_id=entity.id,
        action="revisited",
        meta={
            "entity_title": entity.title,
            "entity_type": entity.type,
            "source": "recall_mode",
            "recalled_score": recalled_score,
            "next_action": next_action,
            "used_fallback": used_fallback,
        },
    )
    db.commit()
    db.refresh(entity)

    return RecallGradeResponse(
        entity_id=entity.id,
        recalled_score=recalled_score,
        feedback=feedback.strip(),
        missed_points=missed_points,
        next_action=next_action,
        reviewed_at=reviewed_at,
        updated_confidence_score=entity.confidence_score or 1.0,
        used_fallback=used_fallback,
    )


def preview_recall_answer(
    entity_id: uuid.UUID,
    *,
    answer: str,
    self_score: int | None,
    db: Session,
    provider: OpenAIProvider | None,
) -> RecallGradePreviewResponse:
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise ValueError("Entity not found")

    cleaned_answer = answer.strip()
    if not cleaned_answer:
        raise TypeError("Answer is required")

    if provider is None or is_ai_excluded(entity):
        if self_score is None:
            raise TypeError("Self-score is required when AI grading is unavailable")
        return RecallGradePreviewResponse(
            entity_id=entity.id,
            suggested_score=self_score,
            feedback=FALLBACK_FEEDBACK[self_score],
            missed_points=FALLBACK_MISSED_POINTS[self_score],
            next_action=FALLBACK_NEXT_ACTION[self_score],
            used_fallback=True,
        )

    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("recall_grader.md")},
            {
                "role": "user",
                "content": (
                    "Grade this recall attempt conservatively using only the supplied entity context. "
                    "Do not reveal the original note in the feedback.\n\n"
                    f"{build_recall_grading_context(entity, cleaned_answer)}"
                ),
            },
        ],
        json_schema=RECALL_RESULT_SCHEMA,
        temperature=0.1,
        max_tokens=700,
        model=provider.smart_model,
    )

    if str(payload.get("entity_id", "")).strip() != str(entity.id):
        raise ModelResponseError("AI grade referenced an entity outside the requested target.")
    recalled_score = int(payload.get("recalled_score", 1))
    feedback = str(payload.get("feedback", "Insufficient grading feedback returned.")).strip()[:600]
    missed_points = [str(item).strip()[:160] for item in payload.get("missed_points", []) if str(item).strip()][:5]
    next_action = str(payload.get("next_action", "review_again"))

    return RecallGradePreviewResponse(
        entity_id=entity.id,
        suggested_score=recalled_score,
        feedback=feedback,
        missed_points=missed_points,
        next_action=next_action,
        used_fallback=False,
    )


def grade_recall_answer(
    entity_id: uuid.UUID,
    *,
    answer: str,
    self_score: int | None,
    db: Session,
    provider: OpenAIProvider | None,
) -> RecallGradeResponse:
    if self_score is None:
        raise TypeError("A user-confirmed score is required before applying a recall grade")

    entity = db.get(Entity, entity_id)
    if entity is None:
        raise ValueError("Entity not found")
    preview = preview_recall_answer(
        entity_id,
        answer=answer,
        self_score=self_score,
        db=db,
        provider=provider,
    )
    # Only the explicit user score controls durable learning state. If it
    # differs from the advisory score, use deterministic feedback aligned to
    # the user's decision rather than persisting an AI-selected action.
    overridden = preview.suggested_score != self_score
    return finalize_recall_grade(
        entity=entity,
        recalled_score=self_score,
        feedback=FALLBACK_FEEDBACK[self_score] if overridden else preview.feedback,
        missed_points=FALLBACK_MISSED_POINTS[self_score] if overridden else preview.missed_points,
        next_action=FALLBACK_NEXT_ACTION[self_score] if overridden else preview.next_action,
        reviewed_at=datetime.now(timezone.utc),
        db=db,
        used_fallback=preview.used_fallback,
    )
