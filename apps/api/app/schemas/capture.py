from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead


class CliCaptureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=12000)
    type: str = Field(pattern="^(til|note|task|idea)$")
    project: str | None = Field(default=None, max_length=240)
    tags: list[str] = Field(default_factory=list)
    repo_url: str | None = Field(default=None, max_length=500)


class CliCaptureResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity: EntityRead
    linked_project_id: str | None = None
    link_created: bool = False
