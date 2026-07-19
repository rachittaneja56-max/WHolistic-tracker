from __future__ import annotations

import hashlib
import json
import math
from datetime import date
from typing import Iterable


def normalise_topic(title: str) -> str:
    return " ".join(title.strip().casefold().split())


def syllabus_preview_token(subject_id: object, topics: Iterable[str]) -> str:
    normalized = sorted({normalise_topic(item) for item in topics if normalise_topic(item)})
    payload = json.dumps({"subject_id": str(subject_id), "topics": normalized}, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def split_syllabus_topics(topics: Iterable[str], existing_titles: Iterable[str]) -> tuple[list[str], list[str]]:
    existing = {normalise_topic(item) for item in existing_titles}
    seen: set[str] = set(); added: list[str] = []; duplicates: list[str] = []
    for raw in topics:
        title = " ".join(raw.strip().split())
        key = normalise_topic(title)
        if not key:
            continue
        if key in existing or key in seen:
            duplicates.append(title)
        else:
            seen.add(key); added.append(title)
    return added, duplicates


def revision_priority(*, exam_weight: float, confidence: float, days_remaining: int, estimated_minutes: int) -> float:
    """Urgency per planned minute; all inputs are explicit, user-owned values."""
    urgency = 1 + 30 / max(days_remaining, 1)
    effort_adjustment = 1 / math.sqrt(max(estimated_minutes, 1) / 30)
    return round((exam_weight / 100) * (1 - confidence) * urgency * effort_adjustment, 4)
