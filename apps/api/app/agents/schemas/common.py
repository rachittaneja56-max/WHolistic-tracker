from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

JsonSchema = dict[str, Any]


class AgentStatusRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ai_enabled: bool
    provider_name: str = "openai"
    provider_ready: bool
    api_key_configured: bool
    fast_model: str
    smart_model: str
    disabled_reason: str | None = None


class AgentTestJsonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(
        default="Return a concise JSON object confirming that structured output is working for this personal knowledge graph.",
        min_length=1,
        max_length=1500,
    )
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    max_tokens: int = Field(default=300, ge=64, le=1200)


class AgentTestJsonResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = "openai"
    model: str
    mode: Literal["json"] = "json"
    output: dict[str, Any] = Field(default_factory=dict)
