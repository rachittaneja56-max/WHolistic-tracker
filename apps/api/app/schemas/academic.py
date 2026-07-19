from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.entity import EntityRead


class AcademicOccurrenceRead(BaseModel):
    id: str
    entity_id: UUID
    subject_id: UUID | None = None
    title: str
    kind: str
    start_at: datetime
    end_at: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    cancelled: bool = False


class GradeAssessmentRead(BaseModel):
    entity_id: UUID
    title: str
    weight_percent: float | None = None
    points_earned: float | None = None
    points_possible: float | None = None


class GradeSummaryRead(BaseModel):
    current_weighted_grade: float | None = None
    grade_on_graded_work: float | None = None
    graded_weight: float = Field(ge=0)
    ungraded_weight: float = Field(ge=0)
    total_weight: float = Field(ge=0)
    target_grade: float | None = None
    required_score_on_remaining: float | None = None
    warnings: list[str] = Field(default_factory=list)
    assessments: list[GradeAssessmentRead] = Field(default_factory=list)


class WorkloadWeekRead(BaseModel):
    week_start: date
    planned_minutes: int = Field(ge=0)
    completed_minutes: int = Field(ge=0)


class SemesterOverviewRead(BaseModel):
    term: str | None = None
    active: bool
    start_date: date | None = None
    end_date: date | None = None
    exam_period_start: date | None = None
    exam_period_end: date | None = None
    break_weeks: list[dict[str, str]] = Field(default_factory=list)
    courses: list[EntityRead] = Field(default_factory=list)
    total_credits: float = Field(ge=0)
    upcoming_assessments: list[EntityRead] = Field(default_factory=list)
    workload: list[WorkloadWeekRead] = Field(default_factory=list)
    courses_needing_attention: list[EntityRead] = Field(default_factory=list)


class GradeScenarioRequest(BaseModel):
    target_grade: float = Field(ge=0, le=100)
    assessments: list[GradeAssessmentRead]


class OccurrenceEditRequest(BaseModel):
    scope: Literal["one", "future"]
    occurrence_start: datetime
    title: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    cancelled: bool | None = None


class IcsImportRequest(BaseModel):
    subject_id: UUID
    ics: str = Field(min_length=1, max_length=1_000_000)


class IcsImportResult(BaseModel):
    imported: int = Field(ge=0)
    skipped_duplicates: int = Field(ge=0)
    entity_ids: list[UUID] = Field(default_factory=list)