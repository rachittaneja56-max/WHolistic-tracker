from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GraphChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=4000)


class GraphChatCitationRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_id: UUID
    title: str = Field(min_length=1, max_length=200)
    reason_used: str = Field(min_length=1, max_length=240)
    evidence_excerpt: str = Field(min_length=1, max_length=400)


class GraphChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(min_length=1, max_length=2400)
    citations: list[GraphChatCitationRead] = Field(default_factory=list)
    missing: bool = False
