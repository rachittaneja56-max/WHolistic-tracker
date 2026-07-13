from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.dsa_extension import ExtensionImportBatchRequest, ExtensionImportRecord
from app.services.dsa_extension import hash_secret, upsert_extension_record


class _Rows:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class _FakeDb:
    def __init__(self):
        self.entities = []

    def scalars(self, _query):
        return _Rows(self.entities)

    def add(self, entity):
        self.entities.append(entity)

    def flush(self):
        return None


def _record(**overrides):
    values = {
        "platform": "leetcode",
        "external_problem_id": "two-sum",
        "title": "Two Sum",
        "url": "https://leetcode.com/problems/two-sum/",
        "difficulty": "easy",
        "tags": ["Array", "Hash Table"],
        "accepted": True,
        "language": "python3",
        "solution_code": "return a + b",
        "source_notes": "Use a map.",
        "last_submitted_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }
    values.update(overrides)
    return ExtensionImportRecord(**values)


def test_extension_record_rejects_non_leetcode_urls_and_oversized_batches():
    with pytest.raises(ValidationError):
        _record(url="https://example.com/problems/two-sum/")
    with pytest.raises(ValidationError):
        ExtensionImportBatchRequest(records=[_record(external_problem_id=f"problem-{index}") for index in range(21)])


def test_extension_secret_hash_does_not_contain_raw_secret():
    digest = hash_secret("PAIR-CODE")
    assert digest != "PAIR-CODE"
    assert "PAIR-CODE" not in digest
    assert len(digest) == 64


def test_recapture_preserves_user_edits_and_refreshes_provider_fields():
    db = _FakeDb()
    assert upsert_extension_record(db, _record()) == ("imported", "created")
    entity = db.entities[0]
    entity.title = "My Two Sum"
    entity.tags = ["favorite"]
    entity.content = "My explanation"
    entity.entity_metadata["difficulty"] = "hard"
    entity.entity_metadata["solution_code"] = "my edited code"

    result = upsert_extension_record(
        db,
        _record(
            title="Two Sum Updated",
            url="https://leetcode.com/problems/two-sum/?envType=study-plan",
            difficulty="medium",
            tags=["Array"],
            solution_code="provider changed code",
            source_notes="Provider note changed.",
        ),
    )

    assert result == ("updated", "updated")
    assert entity.title == "My Two Sum"
    assert entity.tags == ["favorite"]
    assert entity.content == "My explanation"
    assert entity.entity_metadata["difficulty"] == "hard"
    assert entity.entity_metadata["solution_code"] == "my edited code"
    integration = entity.entity_metadata["integration"]
    assert integration["source_notes"] == "Provider note changed."
    assert integration["platform_tags"] == ["Array"]
    assert integration["url"].endswith("?envType=study-plan")


def test_recapture_updates_untouched_imported_code():
    db = _FakeDb()
    upsert_extension_record(db, _record())
    entity = db.entities[0]
    upsert_extension_record(db, _record(solution_code="new accepted code"))
    assert entity.entity_metadata["solution_code"] == "new accepted code"
