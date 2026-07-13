from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from app.schemas.entity import EntityRead
from app.schemas.recall import RecallDueEntityRead
from app.schemas.session import SessionRead


class SubjectSummaryRead(BaseModel):
    topic_count: int = Field(ge=0)
    completed_topic_count: int = Field(ge=0)
    open_task_count: int = Field(ge=0)
    overdue_task_count: int = Field(ge=0)
    due_review_count: int = Field(ge=0)
    progress_percent: float = Field(ge=0, le=100)
    mastery_score: float = Field(ge=0, le=1)
    grade_percent: float | None = Field(default=None, ge=0)
    next_deadline: str | None = None
    planned_minutes_7d: int = Field(ge=0)
    studied_minutes_7d: int = Field(ge=0)
    last_studied_at: datetime | None = None


class SubjectTrackerItemRead(SubjectSummaryRead):
    subject: EntityRead


class SubjectOverviewRead(BaseModel):
    subject: EntityRead
    topics: list[EntityRead] = Field(default_factory=list)
    academic_tasks: list[EntityRead] = Field(default_factory=list)
    summary: SubjectSummaryRead
    linked_entities: dict[str, list[EntityRead]] = Field(default_factory=dict)
    due_reviews: list[RecallDueEntityRead] = Field(default_factory=list)
    recent_sessions: list[SessionRead] = Field(default_factory=list)
    weak_topics: list[EntityRead] = Field(default_factory=list)
