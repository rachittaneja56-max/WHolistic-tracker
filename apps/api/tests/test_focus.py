from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.api.routes.focus import elapsed, read_focus
from app.models.session import ActivitySession
from app.models.entity import Entity


def test_focus_elapsed_recovery_and_pause_are_stable() -> None:
    started = datetime(2026, 7, 19, 9, tzinfo=timezone.utc)
    running = {"status": "running", "started_at": started.isoformat(), "elapsed_seconds": 30}
    assert elapsed(running, started + timedelta(minutes=2, seconds=1)) == 3
    paused = {"status": "paused", "elapsed_seconds": 121}
    assert elapsed(paused, started + timedelta(hours=3)) == 3


def test_focus_read_exposes_planned_and_actual_minutes() -> None:
    started = datetime(2026, 7, 19, 9, tzinfo=timezone.utc)
    row = ActivitySession(id=uuid4(), entity_id=uuid4(), action="focus_session", date=started, meta={"status": "completed", "planned_minutes": 25, "actual_minutes": 18, "elapsed_seconds": 1080, "started_at": started.isoformat(), "completed_at": (started + timedelta(minutes=18)).isoformat(), "source": "today", "interruption_count": 1})
    result = read_focus(row, current=started + timedelta(minutes=20))
    assert result.planned_minutes == 25
    assert result.actual_minutes == 18
    assert result.status == "completed"
    assert result.interruption_count == 1

def test_agenda_excludes_cancelled_study_blocks_and_reports_capacity() -> None:
    from app.services.agenda import build_agenda
    item = Entity(id=uuid4(), type="task", title="Plan", content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata={"status": "todo", "estimated_minutes": 25, "start_at": "2026-07-19T09:00:00Z"})
    session = ActivitySession(id=uuid4(), entity_id=item.id, action="study_planned", date=datetime(2026, 7, 19, 10, tzinfo=timezone.utc), meta={"planned_minutes": 45, "status": "cancelled"})
    agenda = build_agenda(entities=[item], sessions=[session], recalls=[], checks=[], projects=[], start_date=datetime(2026, 7, 19, tzinfo=timezone.utc).date(), end_date=datetime(2026, 7, 19, tzinfo=timezone.utc).date(), now=datetime(2026, 7, 19, tzinfo=timezone.utc), available_minutes=20)
    assert all(row.kind != "study" for row in agenda.today.items)
    assert agenda.capacity.is_over_capacity is True

def test_complete_transition_aggregates_task_minutes(monkeypatch) -> None:
    import app.api.routes.focus as focus
    started = datetime(2026, 7, 19, 9, tzinfo=timezone.utc)
    task = Entity(id=uuid4(), type="task", title="Write", content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata={"actual_minutes": 5})
    row = ActivitySession(id=uuid4(), entity_id=task.id, action="focus_session", date=started, meta={"status": "running", "planned_minutes": 25, "elapsed_seconds": 300, "started_at": started.isoformat(), "source": "today", "interruption_count": 0})
    class Db:
        def get(self, cls, identifier): return task if identifier == task.id else row if identifier == row.id else None
        def commit(self): pass
        def refresh(self, value): pass
    monkeypatch.setattr(focus, "now", lambda: started + timedelta(minutes=10))
    result = focus.transition(row.id, "complete", None, Db())
    assert result.status == "completed"
    assert result.actual_minutes == 15
    assert task.entity_metadata["actual_minutes"] == 20