from __future__ import annotations

from collections import defaultdict
from statistics import mean
from typing import Iterable

from app.models.session import ActivitySession
from app.schemas.workflows import DsaPatternMasteryRead


def normalise_pattern(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.strip().lower().split())
    return cleaned[:80] or None


def attempt_meta(session: ActivitySession) -> dict:
    meta = session.meta or {}
    return meta if session.action == "dsa_attempt" and meta.get("workflow") == "dsa_deliberate_practice" else {}


def build_pattern_mastery(
    attempts: Iterable[ActivitySession],
    *,
    due_problem_ids: set[object] | None = None,
) -> list[DsaPatternMasteryRead]:
    """Calculate transparent mastery from user-entered attempts only."""
    buckets: dict[str, list[tuple[dict, object]]] = defaultdict(list)
    for session in attempts:
        meta = attempt_meta(session)
        if not meta:
            continue
        patterns = {normalise_pattern(item) for item in meta.get("patterns", []) if normalise_pattern(item)}
        for pattern in patterns:
            buckets[pattern].append((meta, session.entity_id))

    due_ids = due_problem_ids or set()
    result: list[DsaPatternMasteryRead] = []
    for pattern, rows in buckets.items():
        solved = sum(meta.get("outcome") == "solved" for meta, _ in rows)
        minutes = [float(meta["time_taken_minutes"]) for meta, _ in rows if isinstance(meta.get("time_taken_minutes"), (int, float))]
        hints = [float(meta["hint_count"]) for meta, _ in rows if isinstance(meta.get("hint_count"), (int, float))]
        solve_rate = solved / len(rows)
        # Deliberate practice rewards correct, independent work but never hides attempt volume.
        independence = max(0.0, 1 - ((mean(hints) if hints else 0) / 4))
        mastery = round(min(1.0, solve_rate * 0.75 + independence * 0.25), 3)
        result.append(DsaPatternMasteryRead(
            pattern=pattern,
            attempts=len(rows),
            solved=solved,
            solve_rate=round(solve_rate, 3),
            average_minutes=round(mean(minutes), 1) if minutes else None,
            average_hints=round(mean(hints), 1) if hints else None,
            mastery_score=mastery,
            due_for_review=len({entity_id for _, entity_id in rows if entity_id in due_ids}),
        ))
    return sorted(result, key=lambda row: (row.mastery_score, -row.attempts, row.pattern))
