from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Literal

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.app_setting import AppSetting
from app.schemas.settings import (
    AiCredentialUpdate,
    AiProviderName,
    AiProviderStatusRead,
    AiSettingUpdate,
    AiStatusRead,
    GithubCredentialName,
    GithubStatusRead,
    SettingsStatusRead,
    WebSearchStatusRead,
)

AI_SETTING_KEY = "ai"
GITHUB_SETTING_KEY = "github"
WEB_SEARCH_SETTING_KEY = "web_search"
PROVIDERS = ("openai", "gemini", "mistral")
GITHUB_WEBHOOK_EVENTS = ["Pull requests", "Pushes", "Workflow runs", "Check runs"]


def _ai_defaults() -> dict:
    return {
        "enabled": bool(settings.ai_enabled),
        "provider": "openai",
        "model_mode": "auto",
        "models": {provider: {"fast_model": getattr(settings, f"{provider}_model_fast"), "smart_model": getattr(settings, f"{provider}_model_smart")} for provider in PROVIDERS},
        "keys": {},
    }


def _github_defaults() -> dict:
    return {"enabled": bool(settings.github_integration_enabled), "webhook_id": secrets.token_urlsafe(18), "keys": {}}


def _web_search_defaults() -> dict:
    return {"enabled": False, "provider": "tavily", "keys": {}}


def _row(db: Session, key: str, defaults: dict) -> AppSetting:
    user_id = db.info.get("user_id")
    if user_id is None:
        raise ValueError("User context is required for private settings.")
    row = db.get(AppSetting, (user_id, key))
    if row is None:
        row = AppSetting(user_id=user_id, key=key, value=defaults)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _merged_value(db: Session, key: str, defaults: dict) -> dict:
    value = defaults
    saved = _row(db, key, defaults).value or {}
    for field in ("enabled", "provider", "model_mode"):
        if field in saved:
            value[field] = saved[field]
    if "webhook_id" in defaults and saved.get("webhook_id"):
        value["webhook_id"] = saved["webhook_id"]
    if "models" in defaults:
        value["models"].update(saved.get("models") or {})
    value["keys"].update(saved.get("keys") or {})
    return value


def _save(db: Session, key: str, value: dict) -> None:
    defaults = {AI_SETTING_KEY: _ai_defaults, GITHUB_SETTING_KEY: _github_defaults, WEB_SEARCH_SETTING_KEY: _web_search_defaults}[key]()
    row = _row(db, key, defaults)
    row.value = value
    row.updated_at = datetime.now(timezone.utc)
    db.commit()


def _fernet() -> Fernet:
    secret = (settings.app_encryption_secret or "").strip()
    if not secret:
        raise ValueError("APP_ENCRYPTION_SECRET is required to store credentials.")
    key = base64.urlsafe_b64encode(hashlib.sha256(("personal-dev-kg:settings:" + secret).encode()).digest())
    return Fernet(key)


def _get_credential(value: dict, name: str) -> str:
    encrypted = value["keys"].get(name)
    if encrypted:
        try:
            return _fernet().decrypt(encrypted.encode()).decode()
        except (InvalidToken, ValueError):
            return ""
    return ""


def _set_credential(db: Session, key: str, value: dict, name: str, secret: str) -> None:
    value["keys"][name] = _fernet().encrypt(secret.strip().encode()).decode()
    _save(db, key, value)


def _remove_credential(db: Session, key: str, value: dict, name: str) -> None:
    value["keys"].pop(name, None)
    _save(db, key, value)


def _ai_value(db: Session) -> dict:
    return _merged_value(db, AI_SETTING_KEY, _ai_defaults())


def _github_value(db: Session) -> dict:
    return _merged_value(db, GITHUB_SETTING_KEY, _github_defaults())


def _web_search_value(db: Session) -> dict:
    return _merged_value(db, WEB_SEARCH_SETTING_KEY, _web_search_defaults())


def get_ai_api_key(db: Session, provider: AiProviderName) -> str:
    return _get_credential(_ai_value(db), provider)


def update_ai_settings(db: Session, payload: AiSettingUpdate) -> None:
    value = _ai_value(db)
    if payload.enabled is not None:
        value["enabled"] = payload.enabled
    if payload.provider is not None:
        value["provider"] = payload.provider
    if payload.model_mode is not None:
        value["model_mode"] = payload.model_mode
    if payload.models:
        for provider, models in payload.models.items():
            value["models"][provider] = {"fast_model": models.fast_model.strip(), "smart_model": models.smart_model.strip()}
    _save(db, AI_SETTING_KEY, value)


def set_ai_credential(db: Session, provider: AiProviderName, api_key: str) -> None:
    _set_credential(db, AI_SETTING_KEY, _ai_value(db), provider, api_key)


def remove_ai_credential(db: Session, provider: AiProviderName) -> None:
    _remove_credential(db, AI_SETTING_KEY, _ai_value(db), provider)


def get_github_enabled(db: Session) -> bool:
    return bool(_github_value(db)["enabled"])


def get_github_credential(db: Session, name: GithubCredentialName) -> str:
    return _get_credential(_github_value(db), name)


def get_web_search_credential(db: Session) -> str:
    return _get_credential(_web_search_value(db), "api_key")


def update_web_search_enabled(db: Session, enabled: bool) -> None:
    value = _web_search_value(db)
    value["enabled"] = enabled
    _save(db, WEB_SEARCH_SETTING_KEY, value)


def set_web_search_credential(db: Session, api_key: str) -> None:
    _set_credential(db, WEB_SEARCH_SETTING_KEY, _web_search_value(db), "api_key", api_key)


def remove_web_search_credential(db: Session) -> None:
    _remove_credential(db, WEB_SEARCH_SETTING_KEY, _web_search_value(db), "api_key")


def consume_ai_request(db: Session) -> None:
    user_id = db.info.get("user_id")
    if user_id is None:
        raise ValueError("User context is required for AI requests")
    used = db.execute(text("SELECT COALESCE((SELECT ai_requests FROM usage_daily WHERE user_id = :user_id AND date = current_date), 0)"), {"user_id": user_id}).scalar_one()
    limit = db.execute(text("SELECT COALESCE((SELECT max_ai_requests_per_day FROM user_quotas WHERE user_id = :user_id), 200)"), {"user_id": user_id}).scalar_one()
    if used >= limit:
        raise ValueError("Daily AI request quota exceeded")
    db.execute(text("INSERT INTO usage_daily (id, user_id, date, ai_requests) VALUES (gen_random_uuid(), :user_id, current_date, 1) ON CONFLICT (user_id, date) DO UPDATE SET ai_requests = usage_daily.ai_requests + 1"), {"user_id": user_id})
    db.commit()


def update_github_enabled(db: Session, enabled: bool) -> None:
    value = _github_value(db)
    value["enabled"] = enabled
    _save(db, GITHUB_SETTING_KEY, value)


def set_github_credential(db: Session, name: GithubCredentialName, value: str) -> None:
    _set_credential(db, GITHUB_SETTING_KEY, _github_value(db), name, value)


def remove_github_credential(db: Session, name: GithubCredentialName) -> None:
    _remove_credential(db, GITHUB_SETTING_KEY, _github_value(db), name)


def get_github_webhook_url(db: Session) -> str:
    origin = (settings.api_public_origin or f"http://localhost:{settings.api_port}").rstrip("/")
    return f"{origin}/webhooks/github/{_github_value(db)['webhook_id']}"


def get_settings_status(db: Session) -> SettingsStatusRead:
    ai = _ai_value(db)
    active = ai["provider"]
    providers = {provider: AiProviderStatusRead(configured=bool(get_ai_api_key(db, provider)), **ai["models"][provider]) for provider in PROVIDERS}
    enabled = bool(ai["enabled"])
    ready = enabled and providers[active].configured
    reason = None if ready else ("AI is disabled" if not enabled else f"{active.title()} is not configured")
    selected = providers[active]

    github = _github_value(db)
    github_enabled = bool(github["enabled"])
    webhook_configured = bool(get_github_credential(db, "webhook_secret"))
    token_configured = bool(get_github_credential(db, "access_token"))
    github_ready = github_enabled and webhook_configured
    github_reason = None if github_ready else ("GitHub integration is disabled" if not github_enabled else "A webhook secret is required")

    return SettingsStatusRead(
        ai=AiStatusRead(enabled=enabled, provider=active, model_mode=ai["model_mode"], openai_configured=providers["openai"].configured, providers=providers, provider_ready=ready, fast_model=selected.fast_model, smart_model=selected.smart_model, disabled_reason=reason),
        github=GithubStatusRead(enabled=github_enabled, webhook_secret_configured=webhook_configured, access_token_configured=token_configured, ready=github_ready, disabled_reason=github_reason, webhook_url=get_github_webhook_url(db), webhook_events=GITHUB_WEBHOOK_EVENTS),
        web_search=WebSearchStatusRead(enabled=bool(_web_search_value(db)["enabled"]), provider="tavily", api_key_configured=bool(get_web_search_credential(db))),
    )


def get_ai_enabled(db: Session) -> bool:
    return bool(_ai_value(db)["enabled"])


def set_ai_enabled(db: Session, enabled: bool) -> bool:
    update_ai_settings(db, AiSettingUpdate(enabled=enabled))
    return enabled
