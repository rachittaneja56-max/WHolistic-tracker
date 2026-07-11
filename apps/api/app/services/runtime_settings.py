from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.app_setting import AppSetting
from app.schemas.settings import AiStatusRead, GithubStatusRead, SettingsStatusRead, WebSearchStatusRead

AI_SETTING_KEY = "ai"


def get_ai_enabled(db: Session) -> bool:
    row = db.get(AppSetting, AI_SETTING_KEY)
    if row is None:
        row = AppSetting(key=AI_SETTING_KEY, value={"enabled": bool(settings.ai_enabled)})
        db.add(row)
        db.commit()
        db.refresh(row)
    return bool((row.value or {}).get("enabled", False))


def set_ai_enabled(db: Session, enabled: bool) -> bool:
    row = db.get(AppSetting, AI_SETTING_KEY)
    if row is None:
        row = AppSetting(key=AI_SETTING_KEY, value={"enabled": enabled})
        db.add(row)
    else:
        row.value = {"enabled": enabled}
        row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return enabled


def get_settings_status(db: Session) -> SettingsStatusRead:
    enabled = get_ai_enabled(db)
    configured = bool((settings.openai_api_key or "").strip())
    ready = enabled and configured
    reason = None if ready else ("AI is disabled" if not enabled else "OpenAI is not configured on the server")
    return SettingsStatusRead(
        ai=AiStatusRead(enabled=enabled, openai_configured=configured, provider_ready=ready, fast_model=settings.openai_model_fast, smart_model=settings.openai_model_smart, disabled_reason=reason),
        github=GithubStatusRead(enabled=settings.github_integration_enabled, webhook_secret_configured=bool((settings.github_webhook_secret or "").strip()), access_token_configured=bool((settings.github_access_token or "").strip())),
        web_search=WebSearchStatusRead(enabled=settings.web_search_enabled, provider=settings.web_search_provider if settings.web_search_enabled else None, api_key_configured=bool((settings.tavily_api_key or "").strip())),
    )
