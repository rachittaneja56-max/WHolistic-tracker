from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GraphNodeRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    title: str | None
    type: str | None
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = 1.0
    created_at: datetime | None
    last_revisited_at: datetime | None


class GraphEdgeRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    from_id: UUID | None
    to_id: UUID | None
    relation_type: str | None
    explanation: str | None
    status: str | None


class GraphRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[GraphNodeRead] = Field(default_factory=list)
    edges: list[GraphEdgeRead] = Field(default_factory=list)


class DecayConfidenceJobRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    processed_count: int = Field(ge=0)
    updated_count: int = Field(ge=0)
    run_at: datetime
    half_life_days: float = Field(gt=0)
    minimum_confidence: float = Field(ge=0.0, le=1.0)
