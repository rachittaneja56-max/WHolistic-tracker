from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WeeklyDigestRangeRead(BaseModel):
    start_date: date
    end_date: date


class WeeklyDigestConnectionRead(BaseModel):
    link_id: UUID
    from_title: str | None
    to_title: str | None
    explanation: str | None


class WeeklyDigestFadingTopicRead(BaseModel):
    entity_id: UUID
    title: str | None
    confidence_score: float = Field(ge=0.0, le=1.0)


class WeeklyDigestDeadlineRead(BaseModel):
    entity_id: UUID
    title: str | None
    date: date


class WeeklyDigestActionRead(BaseModel):
    label: str
    reason: str
    priority: str


class WeeklyDigestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    range: WeeklyDigestRangeRead
    summary: str
    wins: list[str] = Field(default_factory=list)
    needs_attention: list[str] = Field(default_factory=list)
    new_connections: list[WeeklyDigestConnectionRead] = Field(default_factory=list)
    fading_topics: list[WeeklyDigestFadingTopicRead] = Field(default_factory=list)
    upcoming_deadlines: list[WeeklyDigestDeadlineRead] = Field(default_factory=list)
    suggested_next_actions: list[WeeklyDigestActionRead] = Field(default_factory=list)


class TagTaxonomyItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag: str
    total_entity_count: int = Field(ge=0)
    entity_counts_by_type: dict[str, int] = Field(default_factory=dict)
    average_confidence_score: float = Field(ge=0.0, le=1.0)
    last_activity_at: datetime | None = None
    open_task_count: int = Field(ge=0)
    review_due_count: int = Field(ge=0)


class TagTaxonomyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: list[TagTaxonomyItemRead] = Field(default_factory=list)
