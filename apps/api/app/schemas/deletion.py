from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from app.schemas.entity import EntityRead


class EntityDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation_title: str | None = None


class EntityDeletionImpactRead(BaseModel):
    child_count: int
    link_count: int
    review_count: int
    comprehension_check_count: int
    session_count: int


class EntityDeletionResultRead(BaseModel):
    entity: EntityRead
    deleted_at: str
