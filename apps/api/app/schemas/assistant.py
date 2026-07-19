from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recall import RecallGradePreviewResponse, RecallGradeResponse

AssistantPayloadKind = Literal["answer", "questions", "proposal", "recall_due", "execution_result", "recall_result", "system_error"]


class AssistantThreadRead(BaseModel):
    id: UUID
    title: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AssistantMessagePayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    kind: AssistantPayloadKind | None = None
    questions: list[str] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)
    results: list[dict[str, Any]] = Field(default_factory=list)
    proposal_id: UUID | None = None
    proposal_status: str | None = None
    source_message_id: UUID | None = None
    grade: dict[str, Any] | None = None


class AssistantMessageRead(BaseModel):
    id: UUID
    thread_id: UUID
    role: Literal["user", "assistant"]
    content: str
    model_stage: str | None
    payload: AssistantMessagePayload = Field(default_factory=AssistantMessagePayload)
    created_at: datetime


class AssistantPageContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    route: str = Field(min_length=1, max_length=500)
    entity_id: UUID | None = None
    entity_type: str | None = Field(default=None, max_length=80)
    entity_title: str | None = Field(default=None, max_length=300)
    project_id: UUID | None = None
    milestone_id: UUID | None = None
    subject_id: UUID | None = None
    exam_id: UUID | None = None
    dsa_problem_id: UUID | None = None
    agenda_available_minutes: int | None = Field(default=None, ge=0, le=1440)


class AssistantTurnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    thread_id: UUID | None = None
    message: str = Field(min_length=1, max_length=12_000)
    current_path: str = Field(default="/", max_length=500)
    page_context: AssistantPageContext | None = None


class AssistantTurnRead(BaseModel):
    thread: AssistantThreadRead
    user_message: AssistantMessageRead
    assistant_message: AssistantMessageRead
    proposal_id: UUID | None = None


class AssistantThreadDetailRead(BaseModel):
    thread: AssistantThreadRead
    messages: list[AssistantMessageRead]


class AssistantProposalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actions: list[dict[str, Any]] = Field(min_length=1, max_length=25)


class AssistantExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(min_length=8, max_length=120)
    action_ids: list[str] | None = Field(default=None, max_length=25)


class AssistantExecutionRead(BaseModel):
    proposal_id: UUID
    status: Literal["executed"]
    results: list[dict[str, Any]]
    message: AssistantMessageRead


class AssistantRecallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity_id: UUID
    answer: str = Field(min_length=1, max_length=12_000)
    self_score: int | None = Field(default=None, ge=1, le=5)
    thread_id: UUID | None = None
    source_message_id: UUID | None = None


class AssistantRecallRead(BaseModel):
    grade: RecallGradeResponse
    message: AssistantMessageRead


class AssistantRecallPreviewRead(BaseModel):
    grade: RecallGradePreviewResponse
