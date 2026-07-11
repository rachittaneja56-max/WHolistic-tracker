from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class AiSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class AiStatusRead(BaseModel):
    enabled: bool
    provider: str = "openai"
    openai_configured: bool
    provider_ready: bool
    fast_model: str
    smart_model: str
    disabled_reason: str | None = None


class GithubStatusRead(BaseModel):
    enabled: bool
    webhook_secret_configured: bool
    access_token_configured: bool


class WebSearchStatusRead(BaseModel):
    enabled: bool
    provider: str | None
    api_key_configured: bool


class SettingsStatusRead(BaseModel):
    ai: AiStatusRead
    github: GithubStatusRead
    web_search: WebSearchStatusRead
