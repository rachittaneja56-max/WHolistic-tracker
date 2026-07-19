from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

SessionAction = Literal[
    "created",
    "revisited",
    "linked",
    "pr_opened",
    "pr_merged",
    "push",
    "study_planned",
    "study_completed",
    "work_started",
    "work_logged",
    "deployed",
    "milestone_completed",
    "project_shipped",
    "focus_session",
    "daily_plan",
]


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: UUID | None = None
    action: SessionAction
    date: datetime | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class SessionRead(BaseModel):
    id: UUID
    entity_id: UUID | None
    action: str | None
    date: datetime | None
    meta: dict[str, Any] = Field(default_factory=dict)
