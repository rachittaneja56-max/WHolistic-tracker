from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.agents.services.recall import RecallDueItem
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.services.agenda import build_agenda


def entity(entity_type: str, title: str, metadata: dict | None = None, parent_id=None) -> Entity:
    return Entity(
        id=uuid4(), type=entity_type, title=title, parent_id=parent_id, content="", content_type="markdown",
        tags=[], confidence_score=1, entity_metadata=metadata or {},
    )


def test_agenda_normalizes_overlapping_work_and_keeps_totals_outside_previews() -> None:
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    subject = entity("subject_topic", "Algorithms", {"exam_date": "2026-07-21"})
    task = entity("task", "Submit assignment", {"academic_kind": "assignment", "status": "todo", "priority": "urgent", "due_at": "2026-07-18", "estimated_minutes": 45}, subject.id)
    dsa = entity("dsa_problem", "Sliding window", {"review_date": "2026-07-19"})
    session = ActivitySession(id=uuid4(), entity_id=subject.id, action="study_planned", date=now + timedelta(hours=2), meta={"duration_minutes": 60})
    check = ComprehensionCheck(id=uuid4(), entity_id=task.id, ai_assist_level="ai-paired", question="Why this approach?", answered_at=None)
    recall = RecallDueItem(entity=dsa, due_score=9, due_reasons=["Scheduled DSA review is due."], days_since_review=12, days_until_exam=None)

    agenda = build_agenda(
        entities=[subject, task, dsa], sessions=[session], recalls=[recall], checks=[check], projects=[],
        start_date=now.date(), end_date=(now + timedelta(days=6)).date(), now=now, preview_limit=1,
    )

    assert agenda.totals.total_items == 5
    assert agenda.totals.overdue_items == 1
    assert agenda.overdue.total == 1
    assert agenda.recommended is not None and agenda.recommended.id == f"assignment:{task.id}"
    assert agenda.today.total == 1  # comprehension remains in its dedicated queue
    assert agenda.recall.items[0].destination == "recall"
    assert agenda.comprehension.items[0].destination == "comprehension"
    assert agenda.comprehension.items[0].filters == ["coursework", "revision"]
    assert agenda.upcoming.items[0].kind == "exam"
    assert set(agenda.overdue.items[0].allowed_actions) >= {"complete", "snooze", "reschedule", "mark_blocked"}


def test_agenda_excludes_terminal_tasks_and_orders_overdue_before_today() -> None:
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    complete = entity("task", "Already done", {"status": "done", "due_at": "2026-07-18"})
    overdue = entity("task", "Late", {"status": "todo", "due_at": "2026-07-18", "priority": "low"})
    today = entity("task", "Today", {"status": "todo", "due_at": "2026-07-19", "priority": "urgent"})

    agenda = build_agenda(
        entities=[complete, today, overdue], sessions=[], recalls=[], checks=[], projects=[],
        start_date=now.date(), end_date=(now + timedelta(days=6)).date(), now=now,
    )

    assert agenda.totals.total_items == 2
    assert agenda.recommended is not None and agenda.recommended.title == "Late"
    assert [item.title for item in agenda.overdue.items] == ["Late"]
