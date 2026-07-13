from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.api.routes.entities import serialize_entity
from app.api.routes.subjects import build_subject_summary, get_subject_tracker, router
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.subject import SubjectTrackerItemRead


def _entity(
    entity_type: str,
    *,
    parent_id: UUID | None = None,
    metadata: dict | None = None,
    confidence: float = 1.0,
    title: str = "Entity",
) -> Entity:
    return Entity(
        id=uuid4(),
        type=entity_type,
        parent_id=parent_id,
        title=title,
        content="",
        content_type="markdown",
        tags=[],
        confidence_score=confidence,
        entity_metadata=metadata or {},
    )


def _study_session(
    entity_id: UUID,
    action: str,
    session_date: datetime,
    **meta: int,
) -> ActivitySession:
    return ActivitySession(
        id=uuid4(),
        entity_id=entity_id,
        action=action,
        date=session_date,
        meta=meta,
    )


def test_subject_summary_derives_dense_tracker_metrics_without_mutating_progress() -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=timezone.utc)
    subject = _entity(
        "subject_topic",
        metadata={"progress_percent": 77, "exam_date": "2026-08-01"},
        confidence=0.9,
        title="Algorithms",
    )
    completed_topic = _entity(
        "subject_topic",
        parent_id=subject.id,
        metadata={"status": "completed", "progress_percent": 0},
        confidence=0.8,
    )
    active_topic = _entity(
        "subject_topic",
        parent_id=subject.id,
        metadata={"status": "active", "progress_percent": 50},
        confidence=0.4,
    )
    completed_task = _entity(
        "task",
        parent_id=subject.id,
        metadata={
            "status": "done",
            "due_at": (now - timedelta(days=3)).isoformat(),
            "points_earned": 90,
            "points_possible": 100,
            "weight_percent": 60,
        },
    )
    upcoming_task = _entity(
        "task",
        parent_id=active_topic.id,
        metadata={
            "status": "todo",
            "due_at": (now + timedelta(days=2)).isoformat(),
            "points_earned": 40,
            "points_possible": 50,
            "weight_percent": 40,
        },
    )
    overdue_task = _entity(
        "task",
        parent_id=subject.id,
        metadata={"status": "in_progress", "due_at": (now - timedelta(days=1)).isoformat()},
    )
    sessions = [
        _study_session(subject.id, "study_planned", now + timedelta(days=2), duration_minutes=90),
        _study_session(subject.id, "study_planned", now + timedelta(days=8), duration_minutes=60),
        _study_session(active_topic.id, "study_completed", now - timedelta(days=1), duration_minutes=45),
        _study_session(upcoming_task.id, "study_completed", now - timedelta(days=2), actual_minutes=30),
        _study_session(subject.id, "study_completed", now - timedelta(days=10), duration_minutes=100),
    ]
    stored_metadata = dict(subject.entity_metadata or {})

    summary = build_subject_summary(
        subject,
        [completed_topic, active_topic],
        [completed_task, upcoming_task, overdue_task],
        sessions,
        {subject.id, active_topic.id, upcoming_task.id},
        now=now,
    )

    assert summary.topic_count == 2
    assert summary.completed_topic_count == 1
    assert summary.open_task_count == 2
    assert summary.overdue_task_count == 1
    assert summary.due_review_count == 3
    assert summary.progress_percent == 50
    assert summary.mastery_score == pytest.approx(0.6)
    assert summary.grade_percent == 86
    assert summary.next_deadline == (now - timedelta(days=1)).isoformat()
    assert summary.planned_minutes_7d == 90
    assert summary.studied_minutes_7d == 75
    assert summary.last_studied_at == now - timedelta(days=1)
    assert subject.entity_metadata == stored_metadata


def test_subject_summary_uses_subject_fallbacks_when_it_has_no_children() -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=timezone.utc)
    subject = _entity(
        "subject_topic",
        metadata={"progress_percent": 42, "exam_date": "2026-07-20"},
        confidence=0.73,
    )

    summary = build_subject_summary(subject, [], [], [], {subject.id}, now=now)

    assert summary.progress_percent == 42
    assert summary.mastery_score == 0.73
    assert summary.grade_percent is None
    assert summary.next_deadline == "2026-07-20"
    assert summary.due_review_count == 1


def test_tracker_route_precedes_dynamic_route_and_has_a_flat_contract() -> None:
    paths = [route.path for route in router.routes]
    assert paths.index("/subjects/tracker") < paths.index("/subjects/{subject_id}/overview")

    subject = _entity("subject_topic")
    summary = build_subject_summary(subject, [], [], [], set())
    payload = SubjectTrackerItemRead(
        subject=serialize_entity(subject),
        **summary.model_dump(),
    ).model_dump()
    assert payload["subject"]["id"] == subject.id
    assert payload["topic_count"] == 0
    assert "summary" not in payload


def test_tracker_endpoint_groups_tasks_and_sessions_under_direct_topics(monkeypatch) -> None:
    subject = _entity("subject_topic", title="Databases")
    topic = _entity("subject_topic", parent_id=subject.id, confidence=0.5)
    task = _entity(
        "task",
        parent_id=topic.id,
        metadata={"status": "todo", "due_at": "2099-01-01"},
    )
    session_row = _study_session(
        task.id,
        "study_completed",
        datetime.now(timezone.utc) - timedelta(minutes=5),
        duration_minutes=20,
    )

    class ScalarRows:
        def __init__(self, rows):
            self.rows = rows

        def all(self):
            return self.rows

    class FakeDb:
        def __init__(self):
            self.results = iter(([subject], [topic], [task], [session_row]))

        def scalars(self, _query):
            return ScalarRows(next(self.results))

    monkeypatch.setattr("app.api.routes.subjects.get_due_recall_items", lambda *_args, **_kwargs: [])

    rows = get_subject_tracker(FakeDb())

    assert len(rows) == 1
    assert rows[0].subject.id == subject.id
    assert rows[0].topic_count == 1
    assert rows[0].open_task_count == 1
    assert rows[0].studied_minutes_7d == 20
