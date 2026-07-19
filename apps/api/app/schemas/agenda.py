from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


AgendaKind = Literal["task", "assignment", "exam", "study", "lecture", "lab", "tutorial", "office_hours", "study_block", "recall", "comprehension", "project"]
AgendaDestination = Literal["entity", "project", "subject", "recall", "comprehension"]
AgendaAction = Literal["complete", "snooze", "reschedule", "mark_blocked", "cancel", "open", "start"]
AgendaFilter = Literal["coursework", "projects", "dsa", "revision"]


class AgendaContextRead(BaseModel):
    id: UUID | None = None
    type: str | None = None
    title: str | None = None


class AgendaItemRead(BaseModel):
    id: str
    kind: AgendaKind
    source_entity_id: UUID | None = None
    source_type: str
    context: AgendaContextRead | None = None
    title: str
    description: str | None = None
    start_at: datetime | None = None
    deadline: datetime | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    urgency: Literal["overdue", "today", "upcoming", "unscheduled"] = "unscheduled"
    recommendation_reason: str
    status: str
    destination: AgendaDestination
    destination_id: UUID | None = None
    allowed_actions: list[AgendaAction] = Field(default_factory=list)
    filters: list[AgendaFilter] = Field(default_factory=list)


class AgendaPreviewRead(BaseModel):
    total: int = Field(ge=0)
    items: list[AgendaItemRead] = Field(default_factory=list)


class AgendaTotalsRead(BaseModel):
    total_items: int = Field(ge=0)
    overdue_items: int = Field(ge=0)
    scheduled_items: int = Field(ge=0)
    unscheduled_items: int = Field(ge=0)
    recall_items: int = Field(ge=0)
    comprehension_items: int = Field(ge=0)
    planned_minutes: int = Field(ge=0)


class AgendaCapacityRead(BaseModel):
    available_minutes: int | None = Field(default=None, ge=0)
    scheduled_minutes: int = Field(ge=0)
    is_over_capacity: bool = False


class TodayAgendaResponse(BaseModel):
    start_date: date
    end_date: date
    totals: AgendaTotalsRead
    capacity: AgendaCapacityRead
    recommended: AgendaItemRead | None = None
    overdue: AgendaPreviewRead
    today: AgendaPreviewRead
    upcoming: AgendaPreviewRead
    unscheduled: AgendaPreviewRead
    recall: AgendaPreviewRead
    comprehension: AgendaPreviewRead
