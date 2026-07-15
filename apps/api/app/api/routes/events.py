from __future__ import annotations

import math
import re
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, model_validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.product_event import ProductEvent
from app.services.auth import require_authenticated_owner

router = APIRouter(prefix="/events", tags=["events"])

EventName = Literal[
    "signup_activated",
    "first_capture",
    "extension_operation_failed",
    "extension_import_completed",
    "ai_proposal_accepted",
    "prompt_injection_signal",
    "core_web_vital",
]
Primitive = str | StrictBool | StrictInt | StrictFloat
EVENT_KEYS = {
    "signup_activated": {"method"},
    "first_capture": {"item_type", "source"},
    "extension_operation_failed": {"operation", "category", "retryable", "extension_version"},
    "extension_import_completed": {"imported_count", "failed_count", "extension_version"},
    "ai_proposal_accepted": {"action_count", "feature"},
    "prompt_injection_signal": {"source_category", "decision", "feature"},
    "core_web_vital": {"metric", "value", "rating", "surface"},
}
EVENT_REQUIRED_KEYS = {
    "signup_activated": {"method"},
    "first_capture": {"item_type", "source"},
    "extension_operation_failed": {"operation", "category"},
    "extension_import_completed": {"imported_count", "failed_count"},
    "ai_proposal_accepted": {"action_count", "feature"},
    "prompt_injection_signal": {"source_category", "decision", "feature"},
    "core_web_vital": {"metric", "value", "rating", "surface"},
}
ENUM_VALUES = {
    "method": {"email", "github"},
    "item_type": {"note", "practice_problem", "assignment", "project", "subject", "idea"},
    "source": {"web", "extension", "import"},
    "operation": {"user_status", "current_question", "question_list", "submissions", "notes", "backend_import"},
    "category": {"auth", "http", "rate_limit", "schema", "network", "backend", "unknown"},
    "feature": {"assistant", "recall", "comprehension", "rag", "idea", "github"},
    "source_category": {"title", "note", "metadata", "code", "github", "web", "recall", "comprehension"},
    "decision": {"blocked", "sanitized", "citation_rejected"},
    "metric": {"LCP", "INP", "CLS"},
    "rating": {"good", "needs-improvement", "poor"},
    "surface": {"landing", "auth", "home", "learn", "projects", "library", "ai_coach", "settings"},
}
VERSION_PATTERN = re.compile(r"^[0-9]+(?:\.[0-9]+){0,3}(?:-[a-z0-9.-]+)?$", re.I)


class ProductEventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_name: EventName
    properties: dict[str, Primitive] = Field(default_factory=dict, max_length=8)

    @model_validator(mode="after")
    def validate_privacy_safe_properties(self):
        allowed = EVENT_KEYS[self.event_name]
        extras = set(self.properties) - allowed
        if extras:
            raise ValueError(f"Unsupported properties for {self.event_name}: {', '.join(sorted(extras))}")
        missing = EVENT_REQUIRED_KEYS[self.event_name] - set(self.properties)
        if missing:
            raise ValueError(f"Missing properties for {self.event_name}: {', '.join(sorted(missing))}")
        for key, value in self.properties.items():
            if isinstance(value, str):
                if len(value) > 80 or any(character in value for character in "\r\n\t"):
                    raise ValueError(f"{key} must be a short category value")
                if key == "extension_version":
                    if VERSION_PATTERN.fullmatch(value) is None:
                        raise ValueError("extension_version must be a semantic version")
                elif key in ENUM_VALUES and value not in ENUM_VALUES[key]:
                    raise ValueError(f"Unsupported {key} category")
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                if not math.isfinite(float(value)) or abs(float(value)) > 1_000_000_000:
                    raise ValueError(f"{key} is outside the accepted aggregate range")
        return self


class ProductEventAccepted(BaseModel):
    accepted: Literal[True] = True


@router.post("", response_model=ProductEventAccepted, status_code=status.HTTP_202_ACCEPTED)
def record_product_event(
    payload: ProductEventCreate,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_authenticated_owner),
) -> ProductEventAccepted:
    db.add(
        ProductEvent(
            id=uuid4(),
            event_name=payload.event_name,
            properties=dict(payload.properties),
        )
    )
    db.commit()
    return ProductEventAccepted()
