from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead


class SimilarProductRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    url: str | None = None
    note: str


class ExistingStrengthRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: UUID
    title: str | None
    reason: str


class MissingPrerequisiteRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str
    why_needed: str


class SuggestedMvpMilestoneRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    milestone: str
    tasks: list[str] = Field(default_factory=list)


class IdeaValidationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idea: str = Field(min_length=1, max_length=12000)


class IdeaValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idea_summary: str
    similar_products: list[SimilarProductRead] = Field(default_factory=list)
    your_existing_strengths: list[ExistingStrengthRead] = Field(default_factory=list)
    missing_prerequisites: list[MissingPrerequisiteRead] = Field(default_factory=list)
    suggested_mvp: list[SuggestedMvpMilestoneRead] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    web_search_configured: bool = False
    web_search_note: str | None = None
    graph_candidates_considered: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class IdeaApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idea: str = Field(min_length=1, max_length=12000)
    validation: IdeaValidationResponse
    title: str | None = Field(default=None, min_length=1, max_length=240)
    tags: list[str] = Field(default_factory=list)


class IdeaApproveResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: EntityRead


class IdeaProjectDraftRequest(IdeaApproveRequest):
    """Explicitly approved conversion of a validation result into a project hierarchy."""


class IdeaProjectDraftResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idea: EntityRead
    project: EntityRead
    milestones: list[EntityRead] = Field(default_factory=list)
    tasks: list[EntityRead] = Field(default_factory=list)
