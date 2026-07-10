from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entity import Entity
from app.models.review import Review

MIN_CONFIDENCE_SCORE = 0.1
MAX_CONFIDENCE_SCORE = 1.0
CONFIDENCE_HALF_LIFE_DAYS = 30.0
SECONDS_PER_DAY = 86_400
RECALL_SCORE_CONFIDENCE_MAP = {
    1: 0.2,
    2: 0.35,
    3: 0.55,
    4: 0.78,
    5: 1.0,
}
REVIEW_ALIGNMENT_TOLERANCE_SECONDS = 1.0


def clamp_confidence_score(value: float) -> float:
    return max(MIN_CONFIDENCE_SCORE, min(MAX_CONFIDENCE_SCORE, value))


def recall_score_to_confidence(recalled_score: int) -> float:
    target_confidence = RECALL_SCORE_CONFIDENCE_MAP.get(recalled_score)
    if target_confidence is None:
        raise ValueError("Recall score must be between 1 and 5")
    return clamp_confidence_score(target_confidence)


def get_confidence_reference_time(entity: Entity, now: datetime | None = None) -> datetime:
    current_time = now or datetime.now(timezone.utc)
    return entity.last_revisited_at or entity.created_at or current_time


def calculate_decayed_confidence(
    reference_time: datetime,
    now: datetime | None = None,
    *,
    base_confidence: float = MAX_CONFIDENCE_SCORE,
) -> float:
    current_time = now or datetime.now(timezone.utc)
    elapsed_seconds = max((current_time - reference_time).total_seconds(), 0.0)
    elapsed_days = elapsed_seconds / SECONDS_PER_DAY
    decay_rate = math.log(2) / CONFIDENCE_HALF_LIFE_DAYS
    score = base_confidence * math.exp(-decay_rate * elapsed_days)
    return clamp_confidence_score(score)


def build_latest_review_map(db: Session) -> dict[UUID, Review]:
    latest_reviews: dict[UUID, Review] = {}
    reviews = db.scalars(select(Review).order_by(Review.reviewed_at.desc(), Review.id.desc())).all()

    for review in reviews:
        if review.entity_id is None or review.entity_id in latest_reviews:
            continue
        latest_reviews[review.entity_id] = review

    return latest_reviews


def get_confidence_baseline(entity: Entity, latest_review: Review | None) -> float:
    if (
        latest_review is not None
        and latest_review.recalled_score is not None
        and latest_review.reviewed_at is not None
        and entity.last_revisited_at is not None
    ):
        delta_seconds = abs((entity.last_revisited_at - latest_review.reviewed_at).total_seconds())
        if delta_seconds <= REVIEW_ALIGNMENT_TOLERANCE_SECONDS:
            return recall_score_to_confidence(latest_review.recalled_score)

    return MAX_CONFIDENCE_SCORE


def calculate_entity_confidence(entity: Entity, latest_review: Review | None = None, now: datetime | None = None) -> float:
    reference_time = get_confidence_reference_time(entity, now)
    baseline = get_confidence_baseline(entity, latest_review)
    return calculate_decayed_confidence(reference_time, now, base_confidence=baseline)


def mark_entity_revisited(entity: Entity, now: datetime | None = None) -> Entity:
    current_time = now or datetime.now(timezone.utc)
    entity.last_revisited_at = current_time
    entity.confidence_score = MAX_CONFIDENCE_SCORE
    return entity


def apply_recall_result(entity: Entity, recalled_score: int, reviewed_at: datetime | None = None) -> Entity:
    current_time = reviewed_at or datetime.now(timezone.utc)
    entity.last_revisited_at = current_time
    entity.confidence_score = recall_score_to_confidence(recalled_score)
    return entity


def apply_confidence_decay(db: Session, now: datetime | None = None) -> dict[str, Any]:
    current_time = now or datetime.now(timezone.utc)
    latest_reviews = build_latest_review_map(db)
    entities = db.scalars(select(Entity).order_by(Entity.created_at.asc())).all()
    updated_count = 0

    for entity in entities:
        next_score = calculate_entity_confidence(entity, latest_reviews.get(entity.id), current_time)
        current_score = entity.confidence_score if entity.confidence_score is not None else MAX_CONFIDENCE_SCORE
        if abs(current_score - next_score) >= 0.0001:
            entity.confidence_score = next_score
            updated_count += 1

    db.commit()
    return {
        "processed_count": len(entities),
        "updated_count": updated_count,
        "run_at": current_time,
        "half_life_days": CONFIDENCE_HALF_LIFE_DAYS,
        "minimum_confidence": MIN_CONFIDENCE_SCORE,
    }
