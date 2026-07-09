from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.entity import EntityRead
from app.schemas.session import SessionRead


class TodayDashboardResponse(BaseModel):
    recent_entities: list[EntityRead] = Field(default_factory=list)
    recent_sessions: list[SessionRead] = Field(default_factory=list)
    open_tasks: list[EntityRead] = Field(default_factory=list)
    upcoming_subject_topics: list[EntityRead] = Field(default_factory=list)
