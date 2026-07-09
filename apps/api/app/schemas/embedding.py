from __future__ import annotations

from uuid import UUID
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead


class EntitySimilarityRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: EntityRead
    distance: float
    similarity: float


class EntityLinkCandidateRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    title: str | None
    type: str | None
    tags: list[str] = Field(default_factory=list)
    preview: str
    distance: float
    similarity: float


class EntityConnectionRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_id: UUID
    relation_type: str | None
    explanation: str | None
    status: str | None
    created_at: str | None
    direction: Literal["incoming", "outgoing"]
    entity_id: UUID
    entity_title: str | None
    entity_type: str | None
    entity_tags: list[str] = Field(default_factory=list)
    entity_preview: str


class RefreshAllEmbeddingsRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_entities: int = Field(ge=0)
    refreshed_count: int = Field(ge=0)
    failed_count: int = Field(ge=0)
    failed_entity_ids: list[UUID] = Field(default_factory=list)
