from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CourseProjectAssociationRequest(BaseModel):
    project_id: UUID
    course_id: UUID
    semester: str = Field(min_length=1, max_length=80)


class ProjectDeadlineRequest(BaseModel):
    demo_at: datetime | None = None
    presentation_at: datetime | None = None


class DocumentationChecklistRequest(BaseModel):
    items: list["DocumentationChecklistItem"] = Field(default_factory=list, max_length=30)


class DocumentationChecklistItem(BaseModel):
    label: str = Field(min_length=1, max_length=160)
    completed: bool = False


class PortfolioDraftRead(BaseModel):
    summary: str
    resume_bullets: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    requires_confirmation: bool = True


class PortfolioSaveRequest(PortfolioDraftRead):
    confirmed: bool = False
