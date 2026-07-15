from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.agents.services.comprehension import preview_comprehension_answer
from app.agents.services.recall import grade_recall_answer, preview_recall_answer
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity


class _Provider:
    smart_model = "test-model"

    def __init__(self, payload):
        self.payload = payload

    def generate_json(self, **_kwargs):
        return self.payload


class _RecallDb:
    def __init__(self, entity):
        self.entity = entity
        self.commits = 0
        self.added = []

    def get(self, model, _identifier):
        return self.entity if model is Entity else None

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1


def test_recall_preview_never_mutates_learning_state():
    entity = Entity(
        id=uuid4(),
        user_id=uuid4(),
        type="note",
        title="Hash maps",
        content="A map stores key/value pairs.",
        content_type="markdown",
        tags=[],
        confidence_score=0.72,
        entity_metadata={},
    )
    db = _RecallDb(entity)
    provider = _Provider(
        {
            "entity_id": str(entity.id),
            "recalled_score": 5,
            "feedback": "Strong recall.",
            "missed_points": [],
            "next_action": "mark_revisited",
        }
    )

    preview = preview_recall_answer(entity.id, answer="It stores keys.", self_score=None, db=db, provider=provider)

    assert preview.suggested_score == 5
    assert preview.mutates_state is False
    assert entity.confidence_score == 0.72
    assert db.commits == 0
    assert db.added == []


def test_recall_apply_requires_an_explicit_user_score():
    with pytest.raises(TypeError, match="user-confirmed score"):
        grade_recall_answer(uuid4(), answer="answer", self_score=None, db=SimpleNamespace(), provider=None)


class _ComprehensionDb:
    def __init__(self, check, task):
        self.check = check
        self.task = task

    def get(self, model, _identifier):
        if model is ComprehensionCheck:
            return self.check
        if model is Entity:
            return self.task
        return None


def test_comprehension_preview_does_not_answer_or_reduce_confidence():
    task = Entity(
        id=uuid4(),
        user_id=uuid4(),
        type="task",
        title="Ship parser",
        content="Validate every payload.",
        content_type="markdown",
        tags=[],
        confidence_score=0.8,
        entity_metadata={"ai_assist_level": "ai-paired"},
    )
    check = ComprehensionCheck(
        id=uuid4(),
        user_id=task.user_id,
        entity_id=task.id,
        ai_assist_level="ai-paired",
        question="Why validate it?",
        your_answer="",
        ai_grade=None,
    )
    provider = _Provider(
        {"ai_grade": "flagged", "feedback": "Add the failure mode.", "follow_up": "Name one malformed payload."}
    )

    preview = preview_comprehension_answer(
        check.id,
        your_answer="To avoid errors.",
        self_grade=None,
        db=_ComprehensionDb(check, task),
        provider=provider,
    )

    assert preview.suggested_grade == "flagged"
    assert preview.mutates_state is False
    assert check.your_answer == ""
    assert check.ai_grade is None
    assert check.answered_at is None
    assert task.confidence_score == 0.8


def test_assistant_recall_apply_alias_uses_user_confirmed_score(monkeypatch):
    from app.api.routes import assistant as assistant_routes
    from app.schemas.assistant import AssistantRecallRequest

    route = next(
        item
        for item in assistant_routes.router.routes
        if item.path == "/assistant/recall/apply" and "POST" in item.methods
    )
    captured = {}
    sentinel = object()

    def fake_run_recall(db, provider, **kwargs):
        captured.update({"db": db, "provider": provider, **kwargs})
        return sentinel

    monkeypatch.setattr(assistant_routes, "run_recall", fake_run_recall)
    db = object()
    entity_id = uuid4()
    result = route.endpoint(
        AssistantRecallRequest(
            entity_id=entity_id,
            answer="A hash map stores key/value pairs.",
            self_score=4,
        ),
        db=db,
        _owner="owner",
    )

    assert result is sentinel
    assert captured["db"] is db
    assert captured["provider"] is None
    assert captured["entity_id"] == entity_id
    assert captured["self_score"] == 4
