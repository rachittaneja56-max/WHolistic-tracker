from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

RelationType = Literal["structural_analogy", "prerequisite", "used_in", "reminds_me_of"]
LinkStatus = Literal["agent_suggested", "confirmed", "rejected"]


class LinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_id: UUID
    to_id: UUID
    relation_type: RelationType
    explanation: str = Field(min_length=1)
    status: LinkStatus = "confirmed"


class LinkUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_id: UUID | None = None
    to_id: UUID | None = None
    relation_type: RelationType | None = None
    explanation: str | None = Field(default=None, min_length=1)
    status: LinkStatus | None = None


class LinkRead(BaseModel):
    id: UUID
    from_id: UUID | None
    to_id: UUID | None
    relation_type: str | None
    explanation: str | None
    status: str | None
    created_at: datetime | None
