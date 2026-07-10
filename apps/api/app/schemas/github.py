from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead


class GithubWebhookResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: bool
    stored: bool
    event: str
    action: str | None = None
    session_id: UUID | None = None
    project_id: UUID | None = None


class GithubFeedItemRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    entity_id: UUID | None
    action: str
    date: datetime | None
    repo_full_name: str | None = None
    repo_html_url: str | None = None
    title: str | None = None
    message: str | None = None
    github_url: str | None = None
    project_id: UUID | None = None
    project_title: str | None = None
    pr_number: int | None = None
    commit_count: int | None = None
    sender_login: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    draft_available: bool = False
    approved_til_entity_id: UUID | None = None
    approved_til_title: str | None = None


class GithubTilDraftRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: UUID
    source: str = "github_pr"
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)
    used_ai: bool = False
    meta: dict[str, Any] = Field(default_factory=dict)


class GithubApproveTilRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=240)
    content: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class GithubApproveTilResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: EntityRead
    link_id: UUID | None = None
    source_session_id: UUID
