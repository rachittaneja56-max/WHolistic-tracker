from __future__ import annotations

from datetime import date, datetime
from math import isfinite
import re
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
ACADEMIC_KIND_VALUES = {"assignment", "exam", "revision", "reading", "project"}
SUBJECT_TEXT_FIELDS = ("course_code", "term", "instructor", "location")
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


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


def _optional_number(
    metadata: dict[str, Any],
    key: str,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> int | float | None:
    if key not in metadata or metadata[key] is None:
        return None
    value = metadata[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'metadata.{key} must be a number')
    numeric_value = float(value)
    if not isfinite(numeric_value):
        raise ValueError(f'metadata.{key} must be a finite number')
    if minimum is not None and numeric_value < minimum:
        raise ValueError(f'metadata.{key} must be at least {minimum:g}')
    if maximum is not None and numeric_value > maximum:
        raise ValueError(f'metadata.{key} must be at most {maximum:g}')
    return value


def _normalize_optional_text(metadata: dict[str, Any], key: str) -> None:
    if key not in metadata or metadata[key] is None:
        return
    value = metadata[key]
    if not isinstance(value, str):
        raise ValueError(f'metadata.{key} must be a string')
    metadata[key] = value.strip()


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
    for key in SUBJECT_TEXT_FIELDS:
        _normalize_optional_text(normalized, key)
    color = normalized.get('color')
    if color not in (None, ''):
        if not isinstance(color, str) or HEX_COLOR_PATTERN.fullmatch(color.strip()) is None:
            raise ValueError('metadata.color must be a hex color in #RRGGBB format')
        normalized['color'] = color.strip().lower()
    credits = _optional_number(normalized, 'credits', minimum=0)
    if credits is not None:
        normalized['credits'] = credits

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


def normalize_task_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    normalized = dict(metadata or {})
    academic_kind = normalized.get('academic_kind')
    if academic_kind is not None and academic_kind not in ACADEMIC_KIND_VALUES:
        raise ValueError(
            'metadata.academic_kind must be assignment, exam, revision, reading, or project'
        )

    due_at = normalized.get('due_at')
    if due_at not in (None, ''):
        if not isinstance(due_at, str):
            raise ValueError('metadata.due_at must be an ISO date or datetime')
        due_at = due_at.strip()
        try:
            datetime.fromisoformat(due_at.replace('Z', '+00:00'))
        except ValueError as exc:
            raise ValueError('metadata.due_at must be an ISO date or datetime') from exc
        normalized['due_at'] = due_at

    estimated_minutes = normalized.get('estimated_minutes')
    if estimated_minutes is not None:
        if isinstance(estimated_minutes, bool) or not isinstance(estimated_minutes, int) or estimated_minutes < 0:
            raise ValueError('metadata.estimated_minutes must be a non-negative integer')

    _normalize_optional_text(normalized, 'recurrence')
    for key in ('points_earned', 'points_possible'):
        value = _optional_number(normalized, key, minimum=0)
        if value is not None:
            normalized[key] = value
    weight = _optional_number(normalized, 'weight_percent', minimum=0, maximum=100)
    if weight is not None:
        normalized['weight_percent'] = weight
    return normalized


def normalize_entity_metadata(entity_type: EntityType | None, metadata: dict[str, Any] | None) -> dict[str, Any]:
    if entity_type == "subject_topic":
        normalized = normalize_subject_metadata(metadata)
    elif entity_type == "task":
        normalized = normalize_task_metadata(metadata)
    else:
        normalized = dict(metadata or {})
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
