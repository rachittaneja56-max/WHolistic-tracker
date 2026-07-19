from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead


class SyllabusPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject_id: UUID
    topics: list[str] = Field(min_length=1, max_length=500)


class SyllabusPreviewRead(BaseModel):
    preview_token: str
    new_topics: list[str]
    duplicate_topics: list[str]
    requires_confirmation: bool = True


class SyllabusConfirmRequest(SyllabusPreviewRequest):
    preview_token: str = Field(min_length=32, max_length=128)
    confirmed: bool = False


class TopicAssessmentMapRequest(BaseModel):
    topic_id: UUID
    assessment_id: UUID


class PastPaperLogRequest(BaseModel):
    subject_id: UUID
    paper_label: str = Field(min_length=1, max_length=160)
    attempted_at: datetime | None = None
    score_percent: float | None = Field(default=None, ge=0, le=100)
    duration_minutes: int | None = Field(default=None, ge=0, le=1_440)
    notes: str | None = Field(default=None, max_length=2_000)


class LectureRecoveryRequest(BaseModel):
    subject_id: UUID
    lecture_title: str = Field(min_length=1, max_length=200)
    attended: bool
    occurred_at: datetime | None = None
    recovery_minutes: int | None = Field(default=None, ge=0, le=1_440)
    recovery_completed: bool = False


class RevisionPlanRequest(BaseModel):
    subject_id: UUID
    exam_weight: float = Field(ge=0, le=100)
    items: list["RevisionPlanItemInput"] = Field(default_factory=list, max_length=200)


class RevisionPlanItemInput(BaseModel):
    topic_id: UUID
    confidence: float = Field(ge=0, le=1)
    estimated_minutes: int = Field(ge=1, le=10_000)


class RevisionPriorityRead(BaseModel):
    topic: EntityRead
    priority_score: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    estimated_minutes: int = Field(ge=1)
    days_remaining: int


class RevisionPlanPreviewRead(BaseModel):
    subject_id: UUID
    exam_date: date
    items: list[RevisionPriorityRead]
    requires_confirmation: bool = True


class RevisionPlanConfirmRequest(BaseModel):
    subject_id: UUID
    items: list[RevisionPlanItemInput] = Field(default_factory=list, max_length=200)
    confirmed: bool = False
