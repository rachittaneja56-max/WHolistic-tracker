from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

JsonSchema = dict[str, Any]

DuplicateMatchType = Literal["duplicate", "same_pattern", "related_but_different", "no_match"]
DeepConnectionRelationType = Literal["structural_analogy", "prerequisite", "used_in", "reminds_me_of", "none"]


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


class DuplicateDetectorMatchRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: UUID
    title: str | None
    type: str | None
    tags: list[str] = Field(default_factory=list)
    match_type: DuplicateMatchType
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str


class DuplicateDetectorResponseRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_entity_id: UUID
    matches: list[DuplicateDetectorMatchRead] = Field(default_factory=list)


class DeepConnectionSuggestionRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_id: UUID
    from_id: UUID
    to_id: UUID
    from_title: str | None
    to_title: str | None
    relation_type: Literal["structural_analogy", "prerequisite", "used_in", "reminds_me_of"]
    explanation: str
    confidence: float = Field(ge=0.0, le=1.0)


class DeepConnectionsRunResponseRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_pairs_considered: int = Field(ge=0)
    suggestions_created: int = Field(ge=0)
    suggestions: list[DeepConnectionSuggestionRead] = Field(default_factory=list)
