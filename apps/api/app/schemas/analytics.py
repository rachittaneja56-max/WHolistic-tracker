from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HeatmapRangeRead(BaseModel):
    start_date: date
    end_date: date


class HeatmapDayRead(BaseModel):
    date: date
    created_entities: int = Field(ge=0)
    revisited_entities: int = Field(ge=0)
    reviews: int = Field(ge=0)
    pr_opened: int = Field(ge=0)
    pr_merged: int = Field(ge=0)
    pushes: int = Field(ge=0)
    tils_created: int = Field(ge=0)


class HeatmapResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    range: HeatmapRangeRead
    days: list[HeatmapDayRead] = Field(default_factory=list)


class LearningVsShippingDayRead(BaseModel):
    date: date
    shipping_count: int = Field(ge=0)
    learning_count: int = Field(ge=0)


class LearningVsShippingSummaryRead(BaseModel):
    shipped_without_learning_days: int = Field(ge=0)
    learning_after_shipping_days: int = Field(ge=0)
    shipping_days: int = Field(ge=0)
    learning_days: int = Field(ge=0)


class LearningVsShippingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    range: HeatmapRangeRead
    summary: LearningVsShippingSummaryRead
    days: list[LearningVsShippingDayRead] = Field(default_factory=list)


class GithubCiStatusItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: UUID | None = None
    project_title: str | None = None
    repo: str
    latest_status: str
    latest_conclusion: str | None = None
    workflow_name: str
    url: str | None = None
    updated_at: datetime | None = None


class GithubCiStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[GithubCiStatusItemRead] = Field(default_factory=list)
