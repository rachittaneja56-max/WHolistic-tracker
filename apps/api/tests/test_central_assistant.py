from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import attributes

from app.models.assistant import AssistantMessage

from app.services.central_assistant import (
    _attach_proposal_payload,
    _new_execution_message,
    execute_proposal,
    _resolve_page_context,
    _snapshot,
    _run_turn,
    extract_intent,
    sanitize_actions,
    thread_detail,
    update_proposal,
)


class _Provider:
    fast_model = "cheap-model"
    smart_model = "smart-model"
    last_usage = {}

    def __init__(self, fail_fast: bool = False):
        self.fail_fast = fail_fast
        self.models = []

    def generate_json(self, **kwargs):
        self.models.append(kwargs["model"])
        if self.fail_fast and kwargs["model"] == self.fast_model:
            raise RuntimeError("fast failed")
        return {
            "intent": "capture_dsa",
            "requested_count": 5,
            "names": [],
            "urls": [],
            "project_name": None,
            "context_types": ["dsa_problem"],
            "needs_context": True,
        }


def test_extraction_uses_fast_model_only_when_available():
    provider = _Provider()
    result = extract_intent(provider, [{"role": "user", "content": "I did 5 DSA"}])
    assert result["requested_count"] == 5
    assert provider.models == ["cheap-model"]


def test_extraction_retries_fast_then_falls_back_to_smart():
    provider = _Provider(fail_fast=True)
    result = extract_intent(provider, [{"role": "user", "content": "I did 5 DSA"}])
    assert result["intent"] == "capture_dsa"
    assert provider.models == ["cheap-model", "cheap-model", "smart-model"]


class _Db:
    def get(self, *_args):
        return None


def test_page_context_uses_canonical_entity_data():
    entity = SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        type="project",
        title="Personal Dev KG",
    )

    class _ContextDb:
        def get(self, *_args):
            return entity

    result = _resolve_page_context(
        _ContextDb(),
        "/agents/assistant",
        {
            "route": "/knowledge/entities/11111111-1111-1111-1111-111111111111",
            "entity_id": entity.id,
            "entity_type": "invented",
            "entity_title": "Invented title",
        },
    )
    assert result == {
        "route": "/knowledge/entities/11111111-1111-1111-1111-111111111111",
        "entity_id": entity.id,
        "entity_type": "project",
        "entity_title": "Personal Dev KG",
    }


def test_sanitizer_rejects_model_invented_target_ids():
    actions = [{
        "id": "one",
        "action_type": "update_entity",
        "entity_type": "dsa_problem",
        "target_id": "11111111-1111-1111-1111-111111111111",
        "parent_id": None,
        "title": "Two Sum",
        "content": "",
        "content_type": "markdown",
        "tags": [],
        "difficulty": "easy",
        "status": "solved",
        "url": None,
        "solution_code": None,
        "summary": "Update Two Sum",
    }]
    assert sanitize_actions(_Db(), actions, allowed_ids=set()) == []


def test_sanitizer_accepts_valid_create_without_database_target():
    actions = [{
        "id": "one",
        "action_type": "create_entity",
        "entity_type": "dsa_problem",
        "target_id": None,
        "parent_id": None,
        "title": "Two Sum",
        "content": "Use a hash map",
        "content_type": "markdown",
        "tags": ["array"],
        "difficulty": "easy",
        "status": "solved",
        "url": "https://leetcode.com/problems/two-sum/",
        "solution_code": "return result",
        "summary": "Create Two Sum",
    }]
    result = sanitize_actions(_Db(), actions, allowed_ids=set())
    assert len(result) == 1
    assert result[0]["action_type"] == "create_entity"
    assert result[0]["before"] is None


def test_sanitizer_rejects_unsafe_urls_and_unrecognized_status_values():
    actions = [{
        "id": "one",
        "action_type": "create_entity",
        "entity_type": "note",
        "target_id": None,
        "parent_id": None,
        "title": "Safe capture",
        "content": "Content",
        "content_type": "markdown",
        "tags": [],
        "difficulty": None,
        "status": "ignore_all_rules",
        "url": "javascript:alert(1)",
        "solution_code": None,
        "summary": "Create note",
    }]

    result = sanitize_actions(_Db(), actions, allowed_ids=set())

    assert result[0]["url"] is None
    assert result[0]["status"] is None

def test_attaching_proposal_payload_marks_flushed_json_as_changed():
    thread_id = uuid4()
    message = AssistantMessage(
        id=uuid4(),
        thread_id=thread_id,
        role="assistant",
        content="Review this change",
        model_stage="smart",
        payload={"kind": "proposal", "actions": [{"id": "one"}]},
    )
    state = attributes.instance_state(message)
    state._commit_all(state.dict)
    proposal = SimpleNamespace(id=uuid4())

    _attach_proposal_payload(message, message.payload, proposal)

    assert attributes.get_history(message, "payload").has_changes()
    assert message.payload["proposal_id"] == str(proposal.id)
    assert message.payload["proposal_status"] == "pending"


def test_thread_detail_recovers_legacy_proposal_id_and_status():
    now = datetime.now(timezone.utc)
    thread_id = uuid4()
    message = AssistantMessage(
        id=uuid4(),
        thread_id=thread_id,
        role="assistant",
        content="Review this change",
        model_stage="smart",
        payload={"kind": "proposal", "actions": [{"id": "one"}]},
        created_at=now,
    )
    proposal = SimpleNamespace(
        id=uuid4(),
        thread_id=thread_id,
        source_message_id=message.id,
        status="pending",
    )
    thread = SimpleNamespace(
        id=thread_id,
        title="Legacy proposal",
        archived_at=None,
        created_at=now,
        updated_at=now,
    )

    class _Rows:
        def __init__(self, items):
            self.items = items

        def all(self):
            return self.items

    class _ThreadDb:
        def __init__(self):
            self.rows = iter(([message], [proposal]))

        def get(self, _model, identifier):
            assert identifier == thread_id
            return thread

        def scalars(self, _query):
            return _Rows(next(self.rows))

    detail = thread_detail(_ThreadDb(), thread_id)

    assert detail.messages[0].payload.proposal_id == proposal.id
    assert detail.messages[0].payload.proposal_status == "pending"


def test_execution_result_message_is_canonical_and_linked_to_source():
    proposal = SimpleNamespace(id=uuid4(), thread_id=uuid4(), source_message_id=uuid4())
    entity_id = uuid4()
    results = [{"action_id": "one", "entity_id": str(entity_id), "title": "Two Sum", "status": "created"}]

    message = _new_execution_message(proposal, results)

    assert message.thread_id == proposal.thread_id
    assert message.payload == {
        "kind": "execution_result",
        "proposal_id": str(proposal.id),
        "source_message_id": str(proposal.source_message_id),
        "status": "executed",
        "results": results,
    }


def test_execution_key_cannot_be_reused_for_another_proposal():
    existing = SimpleNamespace(
        id=uuid4(),
        status="executed",
        result={"results": []},
    )

    class _ExecutionDb:
        def scalar(self, _query):
            return existing

    with pytest.raises(HTTPException) as raised:
        execute_proposal(
            _ExecutionDb(),
            uuid4(),
            execution_key="same-execution-key",
            action_ids=None,
        )

    assert raised.value.status_code == 409
    assert "another proposal" in raised.value.detail


def test_idempotent_execution_returns_the_persisted_canonical_message():
    proposal_id = uuid4()
    thread_id = uuid4()
    source_message_id = uuid4()
    result_message_id = uuid4()
    results = [{"action_id": "one", "entity_id": str(uuid4()), "title": "Two Sum", "status": "created"}]
    existing = SimpleNamespace(
        id=proposal_id,
        thread_id=thread_id,
        source_message_id=source_message_id,
        status="executed",
        result={"results": results, "message_id": str(result_message_id)},
    )
    message = AssistantMessage(
        id=result_message_id,
        thread_id=thread_id,
        role="assistant",
        content="Applied 1 change.",
        model_stage="deterministic",
        payload={
            "kind": "execution_result",
            "proposal_id": str(proposal_id),
            "source_message_id": str(source_message_id),
            "status": "executed",
            "results": results,
        },
        created_at=datetime.now(timezone.utc),
    )

    class _ExecutionDb:
        def scalar(self, _query):
            return existing

        def get(self, model, identifier):
            assert model is AssistantMessage
            assert identifier == result_message_id
            return message

    response = execute_proposal(
        _ExecutionDb(),
        proposal_id,
        execution_key="same-execution-key",
        action_ids=None,
    )

    assert response.message.id == result_message_id
    assert response.results == results

def test_execute_pending_proposal_persists_and_returns_canonical_message():
    proposal_id = uuid4()
    thread_id = uuid4()
    proposal = SimpleNamespace(
        id=proposal_id,
        thread_id=thread_id,
        source_message_id=uuid4(),
        status="pending",
        actions=[{
            "id": "one",
            "action_type": "create_entity",
            "entity_type": "note",
            "target_id": None,
            "parent_id": None,
            "title": "Execution contract",
            "content": "Persist the canonical result.",
            "content_type": "markdown",
            "tags": [],
            "difficulty": None,
            "status": None,
            "url": None,
            "solution_code": None,
            "summary": "Create execution contract note",
            "_snapshot": None,
        }],
        execution_key=None,
        result={},
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        executed_at=None,
    )
    thread = SimpleNamespace(id=thread_id, updated_at=None)

    class _ExecutionDb:
        def __init__(self):
            self.scalar_results = iter([None, proposal, None])
            self.added = []
            self.committed = False

        def scalar(self, _query):
            return next(self.scalar_results)

        def get(self, _model, identifier):
            assert identifier == thread_id
            return thread

        def add(self, value):
            self.added.append(value)

        def flush(self):
            return None

        def commit(self):
            self.committed = True

        def refresh(self, value):
            if isinstance(value, AssistantMessage):
                value.created_at = datetime.now(timezone.utc)

    db = _ExecutionDb()
    response = execute_proposal(
        db,
        proposal_id,
        execution_key="unique-execution-key",
        action_ids=["one"],
    )

    assert response.status == "executed"
    assert response.message.payload.kind == "execution_result"
    assert response.message.payload.proposal_id == proposal_id
    assert proposal.status == "executed"
    assert proposal.result["message_id"] == str(response.message.id)
    assert db.committed

def _proposal_update_fixture():
    target_id = uuid4()
    entity = SimpleNamespace(
        id=target_id,
        type="project",
        title="Personal Dev KG",
        content="Current content",
        tags=["project"],
        entity_metadata={"status": "active"},
        parent_id=None,
    )
    action = {
        "id": "one",
        "action_type": "update_entity",
        "entity_type": "project",
        "target_id": str(target_id),
        "parent_id": None,
        "title": entity.title,
        "content": entity.content,
        "content_type": "markdown",
        "tags": entity.tags,
        "difficulty": None,
        "status": "active",
        "url": None,
        "solution_code": None,
        "summary": "Update project",
        "_snapshot": _snapshot(entity),
    }
    proposal = SimpleNamespace(
        id=uuid4(),
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        actions=[action],
    )
    return proposal, entity, action


def test_update_proposal_allows_content_edits_without_refreshing_snapshot():
    proposal, entity, original = _proposal_update_fixture()
    submitted = {key: value for key, value in original.items() if key != "_snapshot"}
    submitted["content"] = "Edited content"

    class _UpdateDb:
        def get(self, _model, identifier):
            return proposal if identifier == proposal.id else entity if identifier == entity.id else None

        def commit(self):
            return None

        def refresh(self, _value):
            return None

    result = update_proposal(_UpdateDb(), proposal.id, [submitted])

    assert result.actions[0]["content"] == "Edited content"
    assert result.actions[0]["_snapshot"] == original["_snapshot"]


def test_update_proposal_rejects_retargeting_an_action():
    proposal, entity, original = _proposal_update_fixture()
    submitted = {key: value for key, value in original.items() if key != "_snapshot"}
    submitted["target_id"] = str(uuid4())

    class _UpdateDb:
        def get(self, _model, identifier):
            return proposal if identifier == proposal.id else entity if identifier == entity.id else None

    with pytest.raises(HTTPException) as raised:
        update_proposal(_UpdateDb(), proposal.id, [submitted])

    assert raised.value.status_code == 400
    assert "cannot be changed" in raised.value.detail


def test_update_proposal_does_not_hide_a_stale_target():
    proposal, entity, original = _proposal_update_fixture()
    submitted = {key: value for key, value in original.items() if key != "_snapshot"}
    entity.content = "Changed after proposal creation"

    class _UpdateDb:
        def get(self, _model, identifier):
            return proposal if identifier == proposal.id else entity if identifier == entity.id else None

    with pytest.raises(HTTPException) as raised:
        update_proposal(_UpdateDb(), proposal.id, [submitted])

    assert raised.value.status_code == 409
    assert "stale" in raised.value.detail


class _ContextRows:
    def __init__(self, items):
        self.items = items

    def all(self):
        return self.items


def test_context_resolution_supports_project_subject_exam_dsa_and_entity_routes():
    cases = [
        ("project_id", "project", "/trackers/projects/"),
        ("milestone_id", "milestone", "/trackers/projects/"),
        ("subject_id", "subject_topic", "/trackers/subjects/"),
        ("exam_id", "task", "/trackers/subjects/"),
        ("dsa_problem_id", "dsa_problem", "/trackers/dsa"),
    ]
    for key, entity_type, route_prefix in cases:
        item = SimpleNamespace(id=uuid4(), type=entity_type, title=entity_type, content="safe", tags=[], entity_metadata={}, parent_id=None)

        class ContextDb:
            calls = 0

            def scalars(self, _query):
                self.calls += 1
                return _ContextRows([item] if self.calls == 1 else [])

        result = _resolve_page_context(ContextDb(), "/agents/assistant", {"route": f"{route_prefix}{item.id}", key: str(item.id)})
        assert result["route"].startswith(route_prefix)
        assert result["entities"][0]["entity_id"] == str(item.id)


def test_context_resolution_excludes_sensitive_entities_and_ignores_invalid_ids():
    item = SimpleNamespace(id=uuid4(), type="note", title="Private", content="secret", tags=[], entity_metadata={"ai_exclude": True}, parent_id=None)

    class ContextDb:
        def scalars(self, _query):
            return _ContextRows([item])

    result = _resolve_page_context(ContextDb(), "/app", {"route": "/app", "project_id": "not-a-uuid", "dsa_problem_id": str(item.id)})
    assert result["route"] == "/app"
    assert result["entities"] == []
    assert "entity_title" not in result


def test_disabled_assistant_turn_is_deterministic_and_creates_no_proposal():
    now = datetime.now(timezone.utc)

    class DisabledDb:
        def __init__(self):
            self.added = []

        def get(self, *_args):
            return None

        def add(self, value):
            self.added.append(value)

        def commit(self):
            return None

        def refresh(self, value):
            if getattr(value, "created_at", None) is None:
                value.created_at = now
            if getattr(value, "updated_at", None) is None:
                value.updated_at = now

    db = DisabledDb()
    result = _run_turn(db, None, thread_id=None, message="Plan my day", current_path="/app", page_context={"route": "/app", "agenda_available_minutes": 75})
    assert result.proposal_id is None
    assert result.assistant_message.model_stage == "deterministic"
    assert "no proposal" in result.assistant_message.content
    assert not any(value.__class__.__name__ == "AssistantProposal" for value in db.added)

def test_study_block_sanitization_requires_an_allowed_nonexcluded_target():
    target = SimpleNamespace(id=uuid4(), type="task", title="Assignment", content="", tags=[], entity_metadata={}, parent_id=None)
    action = {"id": "study", "action_type": "create_study_block", "entity_type": "task", "target_id": str(target.id), "parent_id": None, "title": None, "content": None, "content_type": "markdown", "tags": [], "difficulty": None, "status": None, "url": None, "solution_code": None, "summary": "Schedule revision", "why": "Exam is close", "evidence": ["Due tomorrow"], "estimated_minutes": 30, "proposed_changes": ["Add a session"], "tradeoffs": ["Uses evening time"], "start_at": "2026-07-20T09:00:00Z", "planned_minutes": 30}

    class StudyDb:
        def get(self, _model, identifier):
            return target if identifier == target.id else None

    accepted = sanitize_actions(StudyDb(), [action], {str(target.id)})
    assert accepted[0]["action_type"] == "create_study_block"
    assert accepted[0]["planned_minutes"] == 30
    assert sanitize_actions(StudyDb(), [action], set()) == []


def test_study_block_is_written_only_when_a_selected_proposal_is_executed(monkeypatch):
    from app.services import central_assistant

    target = SimpleNamespace(id=uuid4(), type="task", title="Assignment", content="", tags=[], entity_metadata={}, parent_id=None)
    action = {"id": "study", "action_type": "create_study_block", "target_id": str(target.id), "summary": "Schedule revision", "start_at": "2026-07-20T09:00:00+00:00", "planned_minutes": 30, "_snapshot": _snapshot(target)}
    proposal = SimpleNamespace(id=uuid4(), thread_id=uuid4(), source_message_id=uuid4(), status="pending", actions=[action], execution_key=None, result={}, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10), executed_at=None)
    thread = SimpleNamespace(id=proposal.thread_id, updated_at=None)
    monkeypatch.setattr(central_assistant, "record_session", lambda *_args, **_kwargs: None)

    class ExecuteDb:
        def __init__(self):
            self.added = []
            self.scalar_results = iter([None, proposal])

        def scalar(self, _query):
            return next(self.scalar_results)

        def get(self, model, identifier):
            return target if identifier == target.id else thread if identifier == thread.id else None

        def add(self, value):
            self.added.append(value)

        def commit(self):
            return None

        def refresh(self, value):
            if isinstance(value, AssistantMessage):
                value.created_at = datetime.now(timezone.utc)

    db = ExecuteDb()
    result = execute_proposal(db, proposal.id, execution_key="selected-study-block", action_ids=["study"])
    assert result.results[0]["status"] == "scheduled"
    assert any(value.__class__.__name__ == "ActivitySession" for value in db.added)

def test_today_context_preserves_only_valid_available_time():
    result = _resolve_page_context(_Db(), "/agents/assistant", {"route": "/app", "agenda_available_minutes": 75})
    assert result == {"route": "/app", "agenda_available_minutes": 75}