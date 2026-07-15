from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.exceptions import ModelResponseError
from app.services import runtime_settings


class _Result:
    def __init__(self, value=1):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _AccountingDb:
    def __init__(self, result=1):
        self.result = result
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return _Result(self.result)


class _Transaction:
    def __init__(self, db):
        self.db = db
        self.exit_type = None

    def __enter__(self):
        return self.db

    def __exit__(self, exc_type, _exc, _traceback):
        self.exit_type = exc_type
        return False


class _SessionFactory:
    def __init__(self, db):
        self.transaction = _Transaction(db)
        self.begin_calls = 0

    def begin(self):
        self.begin_calls += 1
        return self.transaction


class _BusinessSession:
    def __init__(self, user_id):
        self.info = {"user_id": user_id}

    def execute(self, *_args, **_kwargs):
        raise AssertionError("AI accounting must not use the business session")

    def commit(self):
        raise AssertionError("AI accounting must not commit the business session")


def test_ai_quota_charge_is_atomic_and_uses_an_independent_transaction(monkeypatch):
    accounting_db = _AccountingDb(result=1)
    factory = _SessionFactory(accounting_db)
    monkeypatch.setattr(runtime_settings, "SessionLocal", factory)
    user_id = uuid4()

    runtime_settings.consume_ai_request(_BusinessSession(user_id))

    assert factory.begin_calls == 1
    assert factory.transaction.exit_type is None
    assert len(accounting_db.calls) == 1
    sql, params = accounting_db.calls[0]
    assert "ON CONFLICT (user_id, date) DO UPDATE" in sql
    assert "usage_daily.ai_requests <" in sql
    assert "RETURNING ai_requests" in sql
    assert params == {"user_id": user_id}


def test_ai_quota_rejection_does_not_charge_past_the_limit(monkeypatch):
    accounting_db = _AccountingDb(result=None)
    factory = _SessionFactory(accounting_db)
    monkeypatch.setattr(runtime_settings, "SessionLocal", factory)

    with pytest.raises(ValueError, match="quota exceeded"):
        runtime_settings.consume_ai_request(uuid4())

    assert factory.transaction.exit_type is ValueError


def test_ai_result_accounting_is_an_independent_upsert(monkeypatch):
    accounting_db = _AccountingDb()
    factory = _SessionFactory(accounting_db)
    monkeypatch.setattr(runtime_settings, "SessionLocal", factory)
    user_id = uuid4()

    runtime_settings.record_ai_result(
        _BusinessSession(user_id),
        prompt_tokens=7,
        completion_tokens=4,
        error=True,
    )

    sql, params = accounting_db.calls[0]
    assert "INSERT INTO usage_daily" in sql
    assert "ON CONFLICT (user_id, date) DO UPDATE" in sql
    assert params == {
        "user_id": user_id,
        "prompt_tokens": 7,
        "completion_tokens": 4,
        "errors": 1,
    }
    assert factory.transaction.exit_type is None


def test_provider_failure_is_charged_and_error_accounted(monkeypatch):
    events = SimpleNamespace(charges=0, errors=[], usages=[])

    def fail_request(*_args):
        raise ModelResponseError("provider failed")

    monkeypatch.setattr("app.agents.services.provider._send", fail_request)
    provider = OpenAIProvider(
        api_key="test",
        fast_model="fast",
        smart_model="smart",
        before_request=lambda: setattr(events, "charges", events.charges + 1),
        on_usage=lambda usage: events.usages.append(usage),
        on_error=lambda category: events.errors.append(category),
    )

    with pytest.raises(ModelResponseError):
        provider.generate_text([{"role": "user", "content": "hello"}])

    assert events.charges == 1
    assert events.errors == ["ModelResponseError"]
    assert events.usages == []
