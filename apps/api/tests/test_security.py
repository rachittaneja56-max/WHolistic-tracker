from fastapi.testclient import TestClient
from uuid import uuid4

from app.core.redaction import REDACTED, redact_text, redact_value
from app.main import app
from app.services.auth import AuthPrincipal


def test_recursive_redaction() -> None:
    value = {"nested": [{"api_key": "secret-value"}, {"url": "postgresql://owner:password@db/app"}], "authorization": "Bearer abc"}
    redacted = redact_value(value)
    assert redacted["nested"][0]["api_key"] == REDACTED
    assert "password" not in redacted["nested"][1]["url"]
    assert redacted["authorization"] == REDACTED
    assert "abc" not in redact_text("Bearer abc")
    assert "sk-abcdefghijklmnop1234" not in redact_text("api_key=sk-abcdefghijklmnop1234")
    assert "PRIVATE KEY" not in redact_text(
        "-----BEGIN PRIVATE KEY-----\\nsecret material\\n-----END PRIVATE KEY-----"
    )


def test_private_api_requires_bearer_token() -> None:
    client = TestClient(app)
    assert client.get("/entities").status_code == 401
    assert client.get("/health").status_code == 200


def test_normal_user_cannot_reach_admin_api(monkeypatch) -> None:
    principal = AuthPrincipal(user_id=uuid4(), session_id=uuid4(), email="user@example.com", role="user")
    monkeypatch.setattr("app.services.auth.authenticate_bearer", lambda _authorization: principal)
    client = TestClient(app)
    response = client.get("/admin/overview", headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 403
