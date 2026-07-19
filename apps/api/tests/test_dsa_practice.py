from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.models.session import ActivitySession
from app.services.dsa_practice import build_pattern_mastery


def _attempt(patterns, outcome="solved", minutes=20, hints=0, entity_id=None):
    return ActivitySession(
        id=uuid4(), entity_id=entity_id or uuid4(), action="dsa_attempt", date=datetime.now(timezone.utc),
        meta={"workflow": "dsa_deliberate_practice", "patterns": patterns, "outcome": outcome, "time_taken_minutes": minutes, "hint_count": hints},
    )


def test_pattern_mastery_uses_attempt_history_and_independence() -> None:
    due_problem = uuid4()
    rows = [_attempt(["Sliding Window"], "solved", 18, 0, due_problem), _attempt(["sliding  window"], "partial", 30, 2)]
    mastery = build_pattern_mastery(rows, due_problem_ids={due_problem})
    assert len(mastery) == 1
    item = mastery[0]
    assert item.pattern == "sliding window"
    assert item.attempts == 2
    assert item.solved == 1
    assert item.solve_rate == pytest.approx(0.5)
    assert item.average_minutes == pytest.approx(24)
    assert item.average_hints == pytest.approx(1)
    assert item.mastery_score == pytest.approx(0.562)
    assert item.due_for_review == 1


def test_pattern_mastery_ignores_non_deliberate_sessions() -> None:
    ignored = ActivitySession(id=uuid4(), entity_id=uuid4(), action="study_completed", meta={"patterns": ["graphs"]})
    assert build_pattern_mastery([ignored]) == []
