from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DailyGuidanceActionKind = Literal[
    "start_recall",
    "open_task",
    "open_project",
    "study_subject",
    "review_connection",
    "open_comprehension",
]


class DailyGuidanceActionRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=240)
    action_kind: DailyGuidanceActionKind
    entity_id: UUID | None = None
    priority: Literal["low", "medium", "high"]


class DailyGuidanceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    summary: str = Field(min_length=1, max_length=600)
    actions: list[DailyGuidanceActionRead] = Field(default_factory=list)
