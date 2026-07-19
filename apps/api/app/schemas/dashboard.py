from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.entity import EntityRead
from app.schemas.project import ProjectTrackerItemRead
from app.schemas.session import SessionRead


class TodayDashboardTotalsRead(BaseModel):
    open_tasks: int = Field(default=0, ge=0)
    upcoming_exams: int = Field(default=0, ge=0)
    projects_needing_attention: int = Field(default=0, ge=0)
    due_recall: int = Field(default=0, ge=0)


class TodayDashboardResponse(BaseModel):
    totals: TodayDashboardTotalsRead = Field(default_factory=TodayDashboardTotalsRead)
    recent_entities: list[EntityRead] = Field(default_factory=list)
    recent_sessions: list[SessionRead] = Field(default_factory=list)
    open_tasks: list[EntityRead] = Field(default_factory=list)
    upcoming_subject_topics: list[EntityRead] = Field(default_factory=list)
    project_attention: list[ProjectTrackerItemRead] = Field(default_factory=list)
