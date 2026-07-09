from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

RelationType = Literal["structural_analogy", "prerequisite", "used_in", "reminds_me_of"]
LinkStatus = Literal["agent_suggested", "confirmed", "rejected"]


class LinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_id: UUID
    to_id: UUID
    relation_type: RelationType
    explanation: str = Field(min_length=1)
    status: LinkStatus = "confirmed"

    @field_validator("explanation")
    @classmethod
    def validate_explanation(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Explanation is required")
        return stripped

    @model_validator(mode="after")
    def validate_distinct_entities(self) -> "LinkCreate":
        if self.from_id == self.to_id:
            raise ValueError("from_id and to_id cannot be the same")
        return self


class LinkUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_id: UUID | None = None
    to_id: UUID | None = None
    relation_type: RelationType | None = None
    explanation: str | None = Field(default=None, min_length=1)
    status: LinkStatus | None = None

    @field_validator("explanation")
    @classmethod
    def validate_optional_explanation(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Explanation is required")
        return stripped

    @model_validator(mode="after")
    def validate_distinct_entities(self) -> "LinkUpdate":
        if self.from_id is not None and self.to_id is not None and self.from_id == self.to_id:
            raise ValueError("from_id and to_id cannot be the same")
        return self


class LinkRead(BaseModel):
    id: UUID
    from_id: UUID | None
    to_id: UUID | None
    relation_type: str | None
    explanation: str | None
    status: str | None
    created_at: datetime | None
