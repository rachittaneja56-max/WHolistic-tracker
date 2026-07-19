from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from app.models.entity import Entity
from app.schemas.academic import GradeAssessmentRead
from app.schemas.entity import normalize_entity_metadata
from app.services.academic import grade_summary, occurrence_starts, occurrences_for_entity, parse_ics


def test_weekly_selected_days_respect_end_date() -> None:
    start = datetime(2026, 8, 3, 9, tzinfo=timezone.utc)
    values = occurrence_starts(start, {"frequency": "weekly", "weekdays": [0, 2], "until": "2026-08-12"}, datetime(2026, 8, 1, tzinfo=timezone.utc), datetime(2026, 8, 31, tzinfo=timezone.utc))
    assert [value.date().isoformat() for value in values] == ["2026-08-03", "2026-08-05", "2026-08-10", "2026-08-12"]


def test_recurrence_keeps_local_wall_clock_across_dst() -> None:
    eastern = ZoneInfo("America/New_York")
    values = occurrence_starts(datetime(2026, 3, 6, 9, tzinfo=eastern), {"frequency": "daily", "until": "2026-03-10"}, datetime(2026, 3, 6, tzinfo=timezone.utc), datetime(2026, 3, 11, tzinfo=timezone.utc))
    assert [value.astimezone(eastern).hour for value in values] == [9, 9, 9, 9, 9]


def test_grade_summary_calculates_target_and_flags_invalid_weight() -> None:
    summary = grade_summary([GradeAssessmentRead(entity_id=uuid4(), title="Quiz", weight_percent=25, points_earned=16, points_possible=20), GradeAssessmentRead(entity_id=uuid4(), title="Final", weight_percent=75, points_earned=None, points_possible=100)], 80)
    assert summary.current_weighted_grade == 20
    assert summary.ungraded_weight == 75
    assert summary.required_score_on_remaining == 80
    invalid = grade_summary([GradeAssessmentRead(entity_id=uuid4(), title="A", weight_percent=110, points_earned=1, points_possible=1)])
    assert "Assessment weights exceed 100%." in invalid.warnings


def test_ics_parser_validates_and_legacy_metadata_is_compatible() -> None:
    events = parse_ics("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc\r\nDTSTART:20260803T090000Z\r\nDTEND:20260803T100000Z\r\nSUMMARY:Lab\\, section A\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
    assert events[0]["title"] == "Lab, section A"
    with pytest.raises(ValueError): parse_ics("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Missing start\nEND:VEVENT\nEND:VCALENDAR")
    assert normalize_entity_metadata("subject_topic", {"term": "Fall 2026"})["term_status"] == "active"
    assert normalize_entity_metadata("task", {"recurrence": " weekly "})["recurrence"] == "weekly"

def test_one_occurrence_override_does_not_change_future_series() -> None:
    start = datetime(2026, 8, 3, 9, tzinfo=timezone.utc)
    entity = Entity(id=uuid4(), type="task", parent_id=uuid4(), title="Tutorial", content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata={"academic_kind": "tutorial", "start_at": start.isoformat(), "recurrence": {"frequency": "weekly", "until": "2026-08-17"}, "recurrence_overrides": {(start + timedelta(days=7)).isoformat(): {"title": "Moved tutorial"}}})
    occurrences = occurrences_for_entity(entity, start, start + timedelta(days=21))
    assert [item.title for item in occurrences] == ["Tutorial", "Moved tutorial", "Tutorial"]