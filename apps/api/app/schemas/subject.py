from __future__ import annotations

from pydantic import BaseModel, Field
from app.schemas.entity import EntityRead
from app.schemas.recall import RecallDueEntityRead
from app.schemas.session import SessionRead


class SubjectOverviewRead(BaseModel):
    subject: EntityRead
    topics: list[EntityRead] = Field(default_factory=list)
    linked_entities: dict[str, list[EntityRead]] = Field(default_factory=dict)
    due_reviews: list[RecallDueEntityRead] = Field(default_factory=list)
    recent_sessions: list[SessionRead] = Field(default_factory=list)
    weak_topics: list[EntityRead] = Field(default_factory=list)
