from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AiAssistLevel = Literal["handwritten", "ai-scaffolded", "ai-generated", "ai-paired"]
EntityType = Literal[
    "dsa_problem",
    "concept",
    "subject_topic",
    "til",
    "project",
    "milestone",
    "task",
    "note",
    "canvas",
    "idea",
]

ContentType = Literal["markdown", "blocks", "canvas_json", "code"]


AI_ASSIST_LEVEL_VALUES: tuple[AiAssistLevel, ...] = (
    "handwritten",
    "ai-scaffolded",
    "ai-generated",
    "ai-paired",
)


def get_recommended_content_type_for_entity_type(entity_type: EntityType | None) -> ContentType | None:
    if entity_type == "note":
        return "blocks"
    if entity_type == "canvas":
        return "canvas_json"
    return None


def validate_ai_assist_level(value: object) -> AiAssistLevel | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if normalized in AI_ASSIST_LEVEL_VALUES:
        return normalized  # type: ignore[return-value]
    raise ValueError(
        "metadata.ai_assist_level must be one of handwritten, ai-scaffolded, ai-generated, or ai-paired"
    )


def _subject_number(metadata: dict[str, Any], key: str, default: float, minimum: float, maximum: float) -> float:
    value = metadata.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= float(value) <= maximum:
        raise ValueError(f"metadata.{key} must be between {minimum:g} and {maximum:g}")
    return float(value)


def normalize_subject_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    normalized = dict(metadata or {})
    status_value = normalized.get("status", "active")
    priority_value = normalized.get("priority", "medium")
    if status_value not in {"active", "paused", "completed"}:
        raise ValueError("metadata.status must be active, paused, or completed for subject topics")
    if priority_value not in {"low", "medium", "high"}:
        raise ValueError("metadata.priority must be low, medium, or high")
    exam_date = normalized.get("exam_date")
    if exam_date not in (None, ""):
        if not isinstance(exam_date, str):
            raise ValueError("metadata.exam_date must use YYYY-MM-DD")
        try:
            date.fromisoformat(exam_date)
        except ValueError as exc:
            raise ValueError("metadata.exam_date must use YYYY-MM-DD") from exc
    syllabus_units = normalized.get("syllabus_units", [])
    if not isinstance(syllabus_units, list) or not all(isinstance(item, str) for item in syllabus_units):
        raise ValueError("metadata.syllabus_units must be a list of strings")
    sessions = normalized.get("study_sessions_planned", 0)
    if isinstance(sessions, bool) or not isinstance(sessions, int) or sessions < 0:
        raise ValueError("metadata.study_sessions_planned must be a non-negative integer")
    normalized.update(
        status=status_value,
        priority=priority_value,
        syllabus_units=[item.strip() for item in syllabus_units if item.strip()],
        progress_percent=int(_subject_number(normalized, "progress_percent", 0, 0, 100)),
        target_confidence=_subject_number(normalized, "target_confidence", 0.8, 0, 1),
        study_sessions_planned=sessions,
    )
    if "exam_weightage" in normalized:
        normalized["exam_weightage"] = _subject_number(normalized, "exam_weightage", 0, 0, 100)
    return normalized


def normalize_entity_metadata(entity_type: EntityType | None, metadata: dict[str, Any] | None) -> dict[str, Any]:
    normalized = normalize_subject_metadata(metadata) if entity_type == "subject_topic" else dict(metadata or {})
    ai_assist_level = normalized.get("ai_assist_level")

    if entity_type == "task":
        normalized["ai_assist_level"] = "handwritten" if ai_assist_level is None else validate_ai_assist_level(ai_assist_level)
    elif ai_assist_level is not None:
        normalized["ai_assist_level"] = validate_ai_assist_level(ai_assist_level)

    return normalized


class EntityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EntityType = Field(description="Shared entity category stored in the single entities table.")
    parent_id: UUID | None = Field(default=None, description="Hierarchy only. Graph relationships still belong in links.")
    title: str = Field(min_length=1, description="Human-readable title for the entity.")
    content: str | None = Field(
        default="",
        description="Text content for markdown/code or serialized JSON string for BlockNote/Excalidraw content.",
    )
    content_type: ContentType = Field(
        default="markdown",
        description="One of markdown, blocks, canvas_json, or code.",
    )
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EntityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: EntityType | None = None
    parent_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1)
    content: str | None = Field(
        default=None,
        description="Supports full replacement of markdown, code, BlockNote JSON, or Excalidraw JSON content.",
    )
    content_type: ContentType | None = Field(default=None, description="One of markdown, blocks, canvas_json, or code.")
    tags: list[str] | None = None
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)
    metadata: dict[str, Any] | None = None


class EntityRead(BaseModel):
    id: UUID
    type: str | None
    parent_id: UUID | None
    title: str | None
    content: str | None
    content_type: str | None
    tags: list[str] = Field(default_factory=list)
    confidence_score: float = 1.0
    last_revisited_at: datetime | None
    created_at: datetime | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    has_embedding: bool = False
