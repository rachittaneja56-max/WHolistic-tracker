from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Platform = Literal["leetcode", "codeforces", "codechef"]


class DsaConnection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: Platform
    username: str = Field(min_length=1, max_length=120)
    profile_url: str | None = Field(default=None, max_length=500)
    enabled: bool = True

    @field_validator("username", "profile_url", mode="before")
    @classmethod
    def strip_values(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class DsaConnectionsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connections: list[DsaConnection] = Field(default_factory=list, max_length=3)


class DsaConnectionStatus(DsaConnection):
    last_synced_at: str | None = None
    last_error: str | None = None


class DsaIntegrationStatusRead(BaseModel):
    connections: list[DsaConnectionStatus]
    configured_platforms: list[Platform]


class DsaPlatformSyncResult(BaseModel):
    platform: Platform
    status: Literal["synced", "skipped", "failed"]
    imported_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    message: str | None = None


class DsaSyncResponse(BaseModel):
    results: list[DsaPlatformSyncResult]
    total_imported: int
    total_updated: int
    total_skipped: int
