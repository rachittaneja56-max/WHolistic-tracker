from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AiProviderName = Literal["openai", "gemini", "mistral"]
AiModelMode = Literal["auto", "fast", "smart"]
GithubCredentialName = Literal["access_token", "webhook_secret"]
ThemePreference = Literal["system", "light", "dark"]


class AiModelUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fast_model: str = Field(min_length=1, max_length=120)
    smart_model: str = Field(min_length=1, max_length=120)


class AiSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    provider: AiProviderName | None = None
    model_mode: AiModelMode | None = None
    models: dict[AiProviderName, AiModelUpdate] | None = None


class AiCredentialUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=1, max_length=1000)


class GithubSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class GithubCredentialUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: str = Field(min_length=1, max_length=1000)


class WebSearchSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class WebSearchCredentialUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=1, max_length=1000)


class AiProviderStatusRead(BaseModel):
    configured: bool
    fast_model: str
    smart_model: str


class AiStatusRead(BaseModel):
    enabled: bool
    provider: AiProviderName = "openai"
    model_mode: AiModelMode = "auto"
    openai_configured: bool
    providers: dict[AiProviderName, AiProviderStatusRead] = Field(default_factory=dict)
    provider_ready: bool
    fast_model: str
    smart_model: str
    disabled_reason: str | None = None


class GithubStatusRead(BaseModel):
    enabled: bool
    webhook_secret_configured: bool
    access_token_configured: bool
    ready: bool = False
    disabled_reason: str | None = None
    webhook_url: str = ""
    webhook_events: list[str] = Field(default_factory=lambda: ["Pull requests", "Pushes", "Workflow runs", "Check runs"])


class WebSearchStatusRead(BaseModel):
    enabled: bool
    provider: str | None
    api_key_configured: bool


class AiEgressDisclosureRead(BaseModel):
    provider: AiProviderName = "openai"
    destination: str = "api.openai.com"
    data_categories: list[str] = Field(
        default_factory=lambda: [
            "user questions and learning answers",
            "task-specific titles, content, and code excerpts",
            "allowlisted metadata",
            "feature-specific GitHub, LeetCode, or web-result excerpts",
        ]
    )
    ai_exclude_supported: bool = True
    review_before_write: bool = True


class SettingsStatusRead(BaseModel):
    ai: AiStatusRead
    github: GithubStatusRead
    web_search: WebSearchStatusRead
    ai_egress: AiEgressDisclosureRead = Field(default_factory=AiEgressDisclosureRead)


class PreferencesRead(BaseModel):
    model_config = ConfigDict(extra="forbid")
    theme: ThemePreference = "system"
    onboarding_completed: bool = False
    learning_focuses: list[str] = Field(default_factory=list, max_length=12)
    library_saved_views: list["LibrarySavedView"] = Field(default_factory=list, max_length=20)
    library_pinned_entity_ids: list[str] = Field(default_factory=list, max_length=50)


class LibrarySavedView(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    query: dict[str, str | float | None] = Field(default_factory=dict)


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    theme: ThemePreference | None = None
    onboarding_completed: bool | None = None
    learning_focuses: list[str] | None = Field(default=None, max_length=12)
    library_saved_views: list[LibrarySavedView] | None = Field(default=None, max_length=20)
    library_pinned_entity_ids: list[str] | None = Field(default=None, max_length=50)
