from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.entity import EntityRead
from app.schemas.session import SessionRead


class DsaAttemptCreate(BaseModel):
    """A deliberate-practice attempt; no solution text is generated or inferred."""

    model_config = ConfigDict(extra="forbid")

    outcome: Literal["solved", "partial", "stuck"]
    time_taken_minutes: int = Field(ge=0, le=1_440)
    hint_count: int = Field(default=0, ge=0, le=100)
    language: str | None = Field(default=None, max_length=60)
    time_complexity: str | None = Field(default=None, max_length=120)
    space_complexity: str | None = Field(default=None, max_length=120)
    patterns: list[str] = Field(default_factory=list, max_length=12)
    mistake_classification: str | None = Field(default=None, max_length=160)
    key_invariant: str | None = Field(default=None, max_length=1_000)
    recognition_cue: str | None = Field(default=None, max_length=1_000)
    solve_again_without_notes: bool = False
    recall_score: int | None = Field(default=None, ge=1, le=5)


class DsaAttemptRead(SessionRead):
    outcome: str
    time_taken_minutes: int = Field(ge=0)
    hint_count: int = Field(ge=0)


class DsaPatternMasteryRead(BaseModel):
    pattern: str
    attempts: int = Field(ge=0)
    solved: int = Field(ge=0)
    solve_rate: float = Field(ge=0, le=1)
    average_minutes: float | None = Field(default=None, ge=0)
    average_hints: float | None = Field(default=None, ge=0)
    mastery_score: float = Field(ge=0, le=1)
    due_for_review: int = Field(ge=0)


class DsaWeeklyTarget(BaseModel):
    pattern: str = Field(min_length=1, max_length=80)
    difficulty: Literal["easy", "medium", "hard"]
    target: int = Field(ge=1, le=100)


class DsaWeeklyTargetsRequest(BaseModel):
    targets: list[DsaWeeklyTarget] = Field(default_factory=list, max_length=30)


class DsaSimulationCreate(BaseModel):
    kind: Literal["interview", "contest"]
    title: str = Field(min_length=1, max_length=160)
    scheduled_at: datetime | None = None
    duration_minutes: int = Field(ge=15, le=600)
    problem_ids: list[UUID] = Field(default_factory=list, max_length=12)


class DsaPracticeOverviewRead(BaseModel):
    problem: EntityRead
    attempts: list[DsaAttemptRead] = Field(default_factory=list)
    prompt_fields: list[str] = Field(default_factory=lambda: ["key_invariant", "main_mistake", "recognition_cue"])
