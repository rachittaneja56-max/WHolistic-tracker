from fastapi.testclient import TestClient
from pwdlib import PasswordHash

from app.core.config import settings
from app.core.redaction import REDACTED, redact_text, redact_value
from app.main import app


def test_recursive_redaction() -> None:
    value = {"nested": [{"api_key": "secret-value"}, {"url": "postgresql://owner:password@db/app"}], "authorization": "Bearer abc"}
    redacted = redact_value(value)
    assert redacted["nested"][0]["api_key"] == REDACTED
    assert "password" not in redacted["nested"][1]["url"]
    assert redacted["authorization"] == REDACTED
    assert "abc" not in redact_text("Bearer abc")


def test_auth_login_session_logout(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_admin_password_hash", PasswordHash.recommended().hash("correct horse"))
    monkeypatch.setattr(settings, "app_session_secret", "test-session-secret-with-enough-entropy")
    monkeypatch.setattr(settings, "frontend_origin", "http://localhost:5173")
    client = TestClient(app)

    anonymous = client.get("/auth/session")
    assert anonymous.status_code == 200
    assert anonymous.headers["cache-control"] == "no-store"
    assert anonymous.json()["authenticated"] is False

    denied = client.post("/auth/login", json={"password": "wrong"}, headers={"Origin": "http://localhost:5173"})
    assert denied.status_code == 401

    logged_in = client.post("/auth/login", json={"password": "correct horse"}, headers={"Origin": "http://localhost:5173"})
    assert logged_in.status_code == 200
    assert logged_in.json()["authenticated"] is True
    assert "httponly" in logged_in.headers["set-cookie"].lower()

    session = client.get("/auth/session")
    assert session.json()["authenticated"] is True

    logged_out = client.post("/auth/logout", headers={"Origin": "http://localhost:5173"})
    assert logged_out.status_code == 200
    assert logged_out.json()["authenticated"] is False


def test_auth_rejects_untrusted_origin(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_admin_password_hash", PasswordHash.recommended().hash("owner-password"))
    monkeypatch.setattr(settings, "app_session_secret", "test-session-secret")
    client = TestClient(app)
    response = client.post("/auth/login", json={"password": "owner-password"}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
