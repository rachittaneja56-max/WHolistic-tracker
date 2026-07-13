from types import SimpleNamespace

from app.services.central_assistant import _resolve_page_context, extract_intent, sanitize_actions


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
