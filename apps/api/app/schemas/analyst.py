from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnalystTrendRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    evidence: str
    severity: Literal["low", "medium", "high"]


class AnalystGapRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gap: str
    evidence: str
    suggested_action: str
    related_entity_ids: list[UUID] = Field(default_factory=list)


class AnalystSolveRateRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    easy: int = Field(ge=0)
    medium: int = Field(ge=0)
    hard: int = Field(ge=0)


class AnalystLearningDebtRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    reason: str
    suggested_action: str


class AnalystWeeklyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str
    trends: list[AnalystTrendRead] = Field(default_factory=list)
    gaps: list[AnalystGapRead] = Field(default_factory=list)
    solve_rate: AnalystSolveRateRead
    learning_debt: list[AnalystLearningDebtRead] = Field(default_factory=list)
    next_week_focus: list[str] = Field(default_factory=list)
