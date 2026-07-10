from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DailyGuidanceActionRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=240)
    entity_id: UUID | None = None
    priority: Literal["low", "medium", "high"]


class DailyGuidanceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    summary: str = Field(min_length=1, max_length=600)
    actions: list[DailyGuidanceActionRead] = Field(default_factory=list)
