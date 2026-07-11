from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=1024)


class AuthSessionRead(BaseModel):
    authenticated: bool
    owner: str | None = None
    configured: bool = True
