from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.comprehension import ComprehensionCheckRead
from app.schemas.entity import EntityRead
from app.schemas.link import LinkRead
from app.schemas.session import SessionRead

ProjectHealth = Literal["on_track", "at_risk", "stalled", "paused", "completed"]


class ProjectTrackerItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: EntityRead
    milestone_count: int = Field(ge=0)
    completed_milestone_count: int = Field(ge=0)
    task_count: int = Field(ge=0)
    open_task_count: int = Field(ge=0)
    completed_task_count: int = Field(ge=0)
    blocked_task_count: int = Field(ge=0)
    overdue_task_count: int = Field(ge=0)
    progress_percent: float = Field(ge=0, le=100)
    health: ProjectHealth
    health_reasons: list[str] = Field(default_factory=list)
    next_deadline: str | None = None
    current_milestone: EntityRead | None = None
    last_activity_at: datetime | None = None
    shipped_this_week: int = Field(ge=0)
    til_coverage_percent: float = Field(ge=0, le=100)
    comprehension_debt_count: int = Field(ge=0)


class ProjectWorkspaceRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: ProjectTrackerItemRead
    milestones: list[EntityRead] = Field(default_factory=list)
    tasks: list[EntityRead] = Field(default_factory=list)
    relationships: list[LinkRead] = Field(default_factory=list)
    activity: list[SessionRead] = Field(default_factory=list)
    knowledge: list[EntityRead] = Field(default_factory=list)
    comprehension_checks: list[ComprehensionCheckRead] = Field(default_factory=list)
