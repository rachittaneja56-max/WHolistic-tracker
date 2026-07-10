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


def get_recommended_content_type_for_entity_type(entity_type: EntityType | None) -> ContentType | None:
    if entity_type == "note":
        return "blocks"
    if entity_type == "canvas":
        return "canvas_json"
    return None


class EntityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EntityType = Field(description="Shared entity category stored in the single entities table.")
    parent_id: UUID | None = Field(default=None, description="Hierarchy only. Graph relationships still belong in links.")
    title: str = Field(min_length=1, description="Human-readable title for the entity.")
    content: str | None = Field(
        default="",
        description="Text content for markdown/code or serialized JSON string for BlockNote/Excalidraw content.",
    )
    content_type: ContentType = Field(
        default="markdown",
        description="One of markdown, blocks, canvas_json, or code.",
    )
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EntityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EntityType | None = None
    parent_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1)
    content: str | None = Field(
        default=None,
        description="Supports full replacement of markdown, code, BlockNote JSON, or Excalidraw JSON content.",
    )
    content_type: ContentType | None = Field(default=None, description="One of markdown, blocks, canvas_json, or code.")
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
