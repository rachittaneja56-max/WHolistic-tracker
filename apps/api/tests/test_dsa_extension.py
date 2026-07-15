from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.integration_client import IntegrationClient
from app.schemas.dsa_extension import ExtensionImportBatchRequest, ExtensionImportRecord
from app.services.dsa_extension import create_pairing_code, exchange_pairing_code, hash_secret, revoke_extension_tokens, upsert_extension_record


class _Rows:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class _FakeDb:
    def __init__(self):
        self.entities = []
        self.info = {"user_id": uuid4()}

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


class _TenantAwareFakeDb(_FakeDb):
    def scalars(self, _query):
        user_id = self.info["user_id"]
        return _Rows([entity for entity in self.entities if entity.user_id == user_id])


def test_two_users_can_import_and_update_the_same_leetcode_slug_independently():
    db = _TenantAwareFakeDb()
    first_user = uuid4()
    second_user = uuid4()

    db.info["user_id"] = first_user
    assert upsert_extension_record(db, _record()) == ("imported", "created")
    db.info["user_id"] = second_user
    assert upsert_extension_record(db, _record()) == ("imported", "created")
    assert len(db.entities) == 2

    db.info["user_id"] = first_user
    upsert_extension_record(db, _record(solution_code="first user's update"))

    first = next(entity for entity in db.entities if entity.user_id == first_user)
    second = next(entity for entity in db.entities if entity.user_id == second_user)
    assert first.entity_metadata["solution_code"] == "first user's update"
    assert second.entity_metadata["solution_code"] == "return a + b"


class _MutationQuery:
    def __init__(self):
        self.criteria = []

    def filter(self, *criteria):
        self.criteria.extend(criteria)
        return self

    def update(self, _values):
        return 1


class _MutationDb:
    def __init__(self, user_id, pairing=None):
        self.info = {"user_id": user_id} if user_id is not None else {}
        self.query_result = _MutationQuery()
        self.pairing = pairing
        self.added = []

    def query(self, model):
        assert model is IntegrationClient
        return self.query_result

    def scalar(self, _query):
        return self.pairing

    def add(self, value):
        self.added.append(value)

    def commit(self):
        return None


def test_pairing_and_revocation_bulk_updates_include_current_user():
    user_id = uuid4()
    db = _MutationDb(user_id)

    create_pairing_code(db)
    revoke_extension_tokens(db)

    compiled = " ".join(str(item) for item in db.query_result.criteria)
    assert compiled.count("integration_clients.user_id") == 2
    assert db.added[0].user_id == user_id


def test_public_exchange_restores_pairing_owner_before_token_write():
    user_id = uuid4()
    pairing = IntegrationClient(
        id=uuid4(),
        user_id=user_id,
        kind="pairing_code",
        secret_hash=hash_secret("ABCD2345"),
        scope="dsa:import",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        client_metadata={},
    )
    db = _MutationDb(None, pairing=pairing)

    token = exchange_pairing_code(db, "ABCD2345", "Test extension")

    assert token.startswith("pdkg_dsa_")
    assert db.info["user_id"] == user_id
    assert db.added[0].user_id == user_id
    assert pairing.revoked_at is not None
