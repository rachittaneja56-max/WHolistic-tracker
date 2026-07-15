from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead

RecallNextAction = Literal["review_again", "mark_revisited", "strengthen_note"]


class RecallDueEntityRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: EntityRead
    due_score: float = Field(ge=0.0)
    due_reasons: list[str] = Field(default_factory=list)
    days_since_review: int | None = Field(default=None, ge=0)
    days_until_exam: int | None = None


class RecallGradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1, max_length=12000)
    self_score: int | None = Field(default=None, ge=1, le=5)


class RecallGradeApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1, max_length=12000)
    confirmed_score: int = Field(ge=1, le=5)


class RecallGradePreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: UUID
    suggested_score: int = Field(ge=1, le=5)
    feedback: str = Field(min_length=1, max_length=600)
    missed_points: list[str] = Field(default_factory=list)
    next_action: RecallNextAction
    used_fallback: bool = False
    mutates_state: Literal[False] = False


class RecallGradeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: UUID
    recalled_score: int = Field(ge=1, le=5)
    feedback: str = Field(min_length=1, max_length=600)
    missed_points: list[str] = Field(default_factory=list)
    next_action: RecallNextAction
    reviewed_at: datetime
    updated_confidence_score: float = Field(ge=0.1, le=1.0)
    used_fallback: bool = False
