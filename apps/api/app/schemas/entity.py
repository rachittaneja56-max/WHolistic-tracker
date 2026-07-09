from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

EntityType = Literal[
    "dsa_problem",
    "concept",
    "subject_topic",
    "til",
    "project",
    "milestone",
    "task",
    "note",
    "canvas",
    "idea",
]

ContentType = Literal["markdown", "blocks", "canvas_json", "code"]


class EntityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EntityType
    parent_id: UUID | None = None
    title: str = Field(min_length=1)
    content: str | None = ""
    content_type: ContentType = "markdown"
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EntityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EntityType | None = None
    parent_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1)
    content: str | None = None
    content_type: ContentType | None = None
    tags: list[str] | None = None
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)
    metadata: dict[str, Any] | None = None


class EntityRead(BaseModel):
    id: UUID
    type: str | None
    parent_id: UUID | None
    title: str | None
    content: str | None
    content_type: str | None
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = 1.0
    last_revisited_at: datetime | None
    created_at: datetime | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    has_embedding: bool = False
