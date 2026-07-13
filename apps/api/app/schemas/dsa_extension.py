from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.entity import EntityRead


class ExtensionPairingCodeRead(BaseModel):
    code: str
    expires_at: datetime


class ExtensionExchangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=6, max_length=16)
    extension_name: str | None = Field(default=None, max_length=120)


class ExtensionTokenRead(BaseModel):
    token: str
    scope: Literal["dsa:import"] = "dsa:import"


class ExtensionPairingStatusRead(BaseModel):
    paired: bool
    last_used_at: datetime | None = None
    imported_problem_count: int = 0


class ExtensionImportRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: Literal["leetcode"]
    external_problem_id: str = Field(min_length=1, max_length=180, pattern=r"^[a-z0-9][a-z0-9-]*$")
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(max_length=500)
    difficulty: Literal["easy", "medium", "hard"] | None = None
    tags: list[str] = Field(default_factory=list, max_length=50)
    accepted: bool = True
    language: str | None = Field(default=None, max_length=80)
    solution_code: str | None = Field(default=None, max_length=200_000)
    source_notes: str | None = Field(default=None, max_length=100_000)
    first_solved_at: datetime | None = None
    last_submitted_at: datetime | None = None
    source_updated_at: datetime | None = None
    tracker_notes: str | None = Field(default=None, max_length=100_000)
    tracker_tags: list[str] | None = Field(default=None, max_length=50)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "https" or parsed.hostname not in {"leetcode.com", "www.leetcode.com"} or not parsed.path.startswith("/problems/"):
            raise ValueError("url must be an HTTPS LeetCode problem URL")
        return value

    @field_validator("tags", "tracker_tags")
    @classmethod
    def clean_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if any(len(item) > 80 for item in cleaned):
            raise ValueError("tags must be at most 80 characters")
        return cleaned

    @model_validator(mode="after")
    def url_matches_problem(self):
        parsed = urlparse(self.url)
        if parsed.path.rstrip("/") != f"/problems/{self.external_problem_id}":
            raise ValueError("url problem slug must match external_problem_id")
        return self


class ExtensionImportBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: list[ExtensionImportRecord] = Field(min_length=1, max_length=20)


class ExtensionImportItemResult(BaseModel):
    external_problem_id: str
    status: Literal["imported", "updated", "skipped", "failed"]
    reason: Literal["created", "updated", "unchanged", "invalid_record", "conflict"]


class ExtensionImportBatchRead(BaseModel):
    imported: int
    updated: int
    skipped: int
    failed: int
    results: list[ExtensionImportItemResult]


class DsaProblemStatsRead(BaseModel):
    solved: int
    this_week: int
    review_due: int
    platforms: int


class DsaProblemPageRead(BaseModel):
    items: list[EntityRead]
    total: int
    limit: int
    offset: int
    stats: DsaProblemStatsRead
