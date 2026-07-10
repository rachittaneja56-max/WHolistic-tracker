from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import AiAssistLevel, EntityRead

ComprehensionGrade = Literal["passed", "flagged"]
ComprehensionStatus = Literal["not_required", "generated", "answered"]


class ComprehensionCheckGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_entity_id: UUID
    diff_or_summary: str | None = Field(default=None, max_length=20000)


class ComprehensionCheckGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ComprehensionStatus
    check_id: UUID | None = None
    task_entity_id: UUID
    ai_assist_level: AiAssistLevel | None = None
    question: str | None = None
    expected_answer: str | None = None
    why_this_matters: str | None = None
    used_fallback: bool = False
    message: str | None = None


class ComprehensionCheckAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    your_answer: str = Field(min_length=1, max_length=12000)
    self_grade: ComprehensionGrade | None = None


class ComprehensionCheckAnswerResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    check_id: UUID
    entity_id: UUID | None
    ai_grade: ComprehensionGrade
    feedback: str
    follow_up: str
    answered_at: datetime
    used_fallback: bool = False
    updated_confidence_score: float = Field(ge=0.1, le=1.0)


class ComprehensionCheckRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    entity_id: UUID | None
    ai_assist_level: str | None
    question: str | None
    your_answer: str | None
    ai_grade: str | None
    created_at: datetime | None
    answered_at: datetime | None
    entity: EntityRead | None = None
    feedback: str | None = None
    follow_up: str | None = None
