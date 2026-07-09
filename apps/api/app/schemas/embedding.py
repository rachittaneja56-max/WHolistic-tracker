from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead


class EntitySimilarityRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: EntityRead
    distance: float
    similarity: float


class RefreshAllEmbeddingsRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_entities: int = Field(ge=0)
    refreshed_count: int = Field(ge=0)
    failed_count: int = Field(ge=0)
    failed_entity_ids: list[UUID] = Field(default_factory=list)
