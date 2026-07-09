from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entity import Entity

MIN_CONFIDENCE_SCORE = 0.1
MAX_CONFIDENCE_SCORE = 1.0
CONFIDENCE_HALF_LIFE_DAYS = 30.0
SECONDS_PER_DAY = 86_400


def clamp_confidence_score(value: float) -> float:
    return max(MIN_CONFIDENCE_SCORE, min(MAX_CONFIDENCE_SCORE, value))


def get_confidence_reference_time(entity: Entity, now: datetime | None = None) -> datetime:
    current_time = now or datetime.now(timezone.utc)
    return entity.last_revisited_at or entity.created_at or current_time


def calculate_decayed_confidence(reference_time: datetime, now: datetime | None = None) -> float:
    current_time = now or datetime.now(timezone.utc)
    elapsed_seconds = max((current_time - reference_time).total_seconds(), 0.0)
    elapsed_days = elapsed_seconds / SECONDS_PER_DAY
    decay_rate = math.log(2) / CONFIDENCE_HALF_LIFE_DAYS
    score = math.exp(-decay_rate * elapsed_days)
    return clamp_confidence_score(score)


def mark_entity_revisited(entity: Entity, now: datetime | None = None) -> Entity:
    current_time = now or datetime.now(timezone.utc)
    entity.last_revisited_at = current_time
    entity.confidence_score = MAX_CONFIDENCE_SCORE
    return entity


def apply_confidence_decay(db: Session, now: datetime | None = None) -> dict[str, Any]:
    current_time = now or datetime.now(timezone.utc)
    entities = db.scalars(select(Entity).order_by(Entity.created_at.asc())).all()
    updated_count = 0

    for entity in entities:
        reference_time = get_confidence_reference_time(entity, current_time)
        next_score = calculate_decayed_confidence(reference_time, current_time)
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
