from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

from app.agents.services.daily_guidance import build_fallback_guidance
from app.agents.services.recall import get_due_recall_items
from app.api.routes.dashboard import get_today_dashboard, task_priority_key
from app.models.entity import Entity
from app.schemas.entity import normalize_entity_metadata
from app.services.task_statuses import TERMINAL_TASK_STATUSES, is_terminal_task_status


def _entity(
    entity_type: str,
    *,
    metadata: dict | None = None,
    parent_id: UUID | None = None,
    title: str = "Entity",
    created_at: datetime | None = None,
) -> Entity:
    return Entity(
        id=uuid4(),
        type=entity_type,
        parent_id=parent_id,
        title=title,
        content="",
        content_type="markdown",
        tags=[],
        confidence_score=1.0,
        entity_metadata=metadata or {},
        created_at=created_at or datetime.now(timezone.utc),
    )


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _SequenceDb:
    def __init__(self, *results):
        self._results = iter(results)
        self.statements = []

    def scalars(self, statement):
        self.statements.append(statement)
        return _Rows(next(self._results))


def test_all_terminal_statuses_share_one_definition_and_validate_for_tasks() -> None:
    assert TERMINAL_TASK_STATUSES == {"done", "completed", "submitted", "cancelled", "archived"}
    for status in TERMINAL_TASK_STATUSES:
        assert is_terminal_task_status(status.upper())
        assert normalize_entity_metadata("task", {"status": status})["status"] == status


def test_today_uses_database_open_filter_real_totals_and_future_exams(monkeypatch) -> None:
    open_tasks = [_entity("task", title=f"Task {index}") for index in range(105)]
    past_exam = _entity("subject_topic", metadata={"exam_date": "2000-01-01"}, title="Past")
    future_exam = _entity("subject_topic", metadata={"exam_date": "2099-01-01"}, title="Future")
    db = _SequenceDb([], [], open_tasks, [past_exam, future_exam])
    monkeypatch.setattr("app.api.routes.dashboard.get_project_tracker", lambda _db: [])
    monkeypatch.setattr("app.api.routes.dashboard.get_due_recall_items", lambda *_args, **_kwargs: [])

    result = get_today_dashboard(recent_limit=5, db=db)

    assert result.totals.open_tasks == 105
    assert len(result.open_tasks) == 5
    assert result.totals.upcoming_exams == 1
    assert [item.title for item in result.upcoming_subject_topics] == ["Future"]
    open_task_statement = db.statements[2]
    assert open_task_statement._limit_clause is None
    compiled_params = open_task_statement.compile().params
    assert TERMINAL_TASK_STATUSES <= set(next(value for value in compiled_params.values() if isinstance(value, list)))


def test_task_priority_order_is_deterministic_across_signals() -> None:
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    overdue = _entity("task", metadata={"status": "todo", "priority": "low", "due_at": "2026-07-18"}, title="overdue")
    blocked = _entity("task", metadata={"status": "blocked", "priority": "low", "due_at": "2026-08-20"}, title="blocked")
    urgent = _entity("task", metadata={"status": "todo", "priority": "urgent", "due_at": "2026-08-20"}, title="urgent")
    earlier = _entity("task", metadata={"status": "todo", "priority": "medium", "due_at": "2026-07-25"}, title="earlier")
    later = _entity("task", metadata={"status": "todo", "priority": "medium", "due_at": "2026-07-26"}, title="later")

    ordered = sorted([later, urgent, earlier, blocked, overdue], key=lambda item: task_priority_key(item, now=now))
    assert [item.title for item in ordered] == ["overdue", "blocked", "urgent", "earlier", "later"]


def test_recall_eligibility_defaults_and_boolean_overrides() -> None:
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    old = now - timedelta(days=20)
    eligible = [_entity(kind, created_at=old) for kind in ("note", "concept", "til", "subject_topic", "dsa_problem")]
    ineligible = [_entity(kind, created_at=old) for kind in ("task", "project", "milestone", "idea", "canvas")]
    forced_in = _entity("task", metadata={"recall_enabled": True}, created_at=old)
    forced_out = _entity("note", metadata={"recall_enabled": False}, created_at=old)
    db = _SequenceDb([], [*eligible, *ineligible, forced_in, forced_out])

    due = get_due_recall_items(db, limit=100, now=now)
    due_ids = {item.entity.id for item in due}

    assert {item.id for item in eligible} <= due_ids
    assert forced_in.id in due_ids
    assert not ({item.id for item in ineligible} & due_ids)
    assert forced_out.id not in due_ids


def test_subject_topic_inherits_parent_exam_urgency() -> None:
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    parent = _entity("subject_topic", metadata={"exam_date": "2026-07-24"})
    topic = _entity("subject_topic", parent_id=parent.id, created_at=now)
    db = _SequenceDb([], [topic], [parent])

    due = get_due_recall_items(db, limit=10, now=now)

    assert len(due) == 1
    assert due[0].days_until_exam == 5
    assert "Exam date is in 5 days." in due[0].due_reasons


def test_dsa_review_date_is_part_of_primary_recall_due_reasons() -> None:
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    overdue = _entity("dsa_problem", metadata={"review_date": date(2026, 7, 18).isoformat()}, created_at=now)
    due_today = _entity("dsa_problem", metadata={"review_date": date(2026, 7, 19).isoformat()}, created_at=now)
    db = _SequenceDb([], [overdue, due_today])

    due = get_due_recall_items(db, limit=10, now=now)

    assert len(due) == 2
    reasons_by_id = {item.entity.id: item.due_reasons for item in due}
    assert "scheduled DSA review was due 1 day ago" in reasons_by_id[overdue.id][0]
    assert reasons_by_id[due_today.id] == ["The scheduled DSA review date is today."]


def test_fallback_guidance_emits_typed_actions() -> None:
    context = {
        "due_items": [{"entity_id": str(uuid4()), "title": "Recall", "reasons": ["Due"]}],
        "low_confidence_entities": [],
        "upcoming_exams": [{"entity_id": str(uuid4()), "title": "Exam", "days_until_exam": 2}],
        "open_tasks": [{"entity_id": str(uuid4()), "title": "Task", "status": "todo"}],
        "project_attention": [{"entity_id": str(uuid4()), "title": "Project", "reason": "Blocked"}],
        "suggested_links": [{"from_title": "A", "to_title": "B"}],
    }

    response = build_fallback_guidance(context, current_date=date(2026, 7, 19))

    assert [action.action_kind for action in response.actions] == [
        "start_recall", "study_subject", "open_project", "open_task", "review_connection"
    ]
