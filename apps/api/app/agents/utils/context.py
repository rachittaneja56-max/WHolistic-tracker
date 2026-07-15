from __future__ import annotations

import json
import logging
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from app.core.redaction import redact_value

logger = logging.getLogger(__name__)

FEATURE_TOKEN_BUDGETS = {
    "assistant": 3_000,
    "comprehension": 2_500,
    "deep_connections": 3_000,
    "duplicate_detector": 2_000,
    "idea_validator": 2_500,
    "pr_to_til": 3_000,
    "rag": 2_500,
    "recall": 2_000,
    "weekly": 3_000,
}
APPROXIMATE_CHARS_PER_TOKEN = 4
FIELD_BUDGETS = {
    "answer": 5_000,
    "content": 5_000,
    "diff_or_summary": 8_000,
    "feedback": 600,
    "question": 4_000,
    "reason": 500,
    "source_notes": 2_000,
    "solution_code": 4_000,
    "title": 300,
    "url": 500,
}
METADATA_ALLOWLISTS = {
    "assistant": {"status", "priority", "due_at", "exam_date", "difficulty", "ai_assist_level", "solution_code"},
    "comprehension": {"status", "priority", "due_at", "ai_assist_level"},
    "deep_connections": {"status", "difficulty", "ai_assist_level", "solution_code"},
    "duplicate_detector": {"status", "difficulty", "ai_assist_level", "solution_code"},
    "idea_validator": {"status", "priority", "repo_url"},
    "rag": {"status", "difficulty", "exam_date", "ai_assist_level"},
    "recall": {"difficulty", "exam_date", "ai_assist_level", "solution_code"},
    "weekly": {"status", "priority", "due_at", "exam_date", "difficulty"},
}
MAX_LIST_ITEMS = 24
MAX_DEPTH = 5


def sanitize_untrusted_text(value: object, *, max_chars: int = 4_000) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    cleaned = "".join(
        character
        for character in text
        if character in {"\n", "\t"} or unicodedata.category(character) not in {"Cc", "Cf", "Cs", "Co", "Cn"}
    )
    return str(redact_value(cleaned)).strip()[:max_chars]


def is_ai_excluded(entity_or_metadata: object) -> bool:
    metadata = getattr(entity_or_metadata, "entity_metadata", entity_or_metadata)
    return isinstance(metadata, Mapping) and metadata.get("ai_exclude") is True


def allowlisted_metadata(feature: str, metadata: object) -> dict[str, Any]:
    if not isinstance(metadata, Mapping):
        return {}
    allowed = METADATA_ALLOWLISTS.get(feature, set())
    return {
        str(key): value
        for key, value in metadata.items()
        if str(key) in allowed and str(key) != "ai_exclude"
    }


def _sanitize_value(value: object, *, field: str, depth: int = 0) -> object:
    if depth >= MAX_DEPTH:
        return "[depth limit]"
    if isinstance(value, Mapping):
        result: dict[str, object] = {}
        for raw_key, raw_value in list(value.items())[:MAX_LIST_ITEMS]:
            key = sanitize_untrusted_text(raw_key, max_chars=80)
            if key:
                result[key] = _sanitize_value(raw_value, field=key, depth=depth + 1)
        return result
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [
            _sanitize_value(item, field=field, depth=depth + 1)
            for item in list(value)[:MAX_LIST_ITEMS]
        ]
    if isinstance(value, str):
        return sanitize_untrusted_text(value, max_chars=FIELD_BUDGETS.get(field, 2_000))
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return sanitize_untrusted_text(value, max_chars=FIELD_BUDGETS.get(field, 2_000))


def _apply_feature_policy(feature: str, value: object) -> object:
    if isinstance(value, Mapping):
        metadata = value.get("metadata")
        if isinstance(metadata, Mapping) and metadata.get("ai_exclude") is True:
            return {"excluded_from_ai": True}
        return {
            str(key): (
                allowlisted_metadata(feature, child)
                if str(key) == "metadata"
                else _apply_feature_policy(feature, child)
            )
            for key, child in value.items()
        }
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_apply_feature_policy(feature, child) for child in value]
    return value


def _contains_excluded_marker(value: object) -> bool:
    if isinstance(value, Mapping):
        return value.get("excluded_from_ai") is True or any(
            _contains_excluded_marker(child) for child in value.values()
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(_contains_excluded_marker(child) for child in value)
    return False


def serialize_untrusted_context(
    feature: str,
    *,
    provenance: str,
    data: Mapping[str, object],
    max_chars: int | None = None,
) -> str:
    policy_scoped = _apply_feature_policy(feature, data)
    if _contains_excluded_marker(policy_scoped):
        logger.info(
            "AI context security decision",
            extra={"feature": feature, "decision": "ai_exclude_applied"},
        )
    sanitized = _sanitize_value(redact_value(policy_scoped), field="context")
    encoded = json.dumps(sanitized, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    budget = max_chars or (
        FEATURE_TOKEN_BUDGETS.get(feature, 2_000) * APPROXIMATE_CHARS_PER_TOKEN
    )
    if len(encoded) > budget:
        logger.info(
            "AI context security decision",
            extra={"feature": feature, "decision": "context_budget_truncated"},
        )
        encoded = json.dumps(
            {"truncated": True, "payload_excerpt": encoded[: max(0, budget - 80)]},
            ensure_ascii=True,
            separators=(",", ":"),
        )
    safe_feature = sanitize_untrusted_text(feature, max_chars=40)
    safe_provenance = sanitize_untrusted_text(provenance, max_chars=120)
    return (
        f"<UNTRUSTED_DATA feature={safe_feature!r} provenance={safe_provenance!r}>\n"
        f"{encoded}\n"
        "</UNTRUSTED_DATA>"
    )


def entity_prompt_data(
    feature: str,
    entity: object,
    *,
    content_chars: int = 4_000,
    extra: Mapping[str, object] | None = None,
) -> dict[str, object]:
    if is_ai_excluded(entity):
        raise ValueError("Entity is excluded from AI processing")
    data: dict[str, object] = {
        "entity_id": str(getattr(entity, "id", "")),
        "title": sanitize_untrusted_text(getattr(entity, "title", ""), max_chars=300),
        "type": sanitize_untrusted_text(getattr(entity, "type", ""), max_chars=80),
        "tags": list(getattr(entity, "tags", None) or [])[:20],
        "content": sanitize_untrusted_text(getattr(entity, "content", ""), max_chars=content_chars),
        "metadata": allowlisted_metadata(feature, getattr(entity, "entity_metadata", None)),
    }
    if extra:
        data.update(extra)
    return data


def serialize_entity_context(
    feature: str,
    entity: object,
    *,
    provenance: str = "personal_graph_entity",
    content_chars: int = 4_000,
    extra: Mapping[str, object] | None = None,
) -> str:
    return serialize_untrusted_context(
        feature,
        provenance=provenance,
        data=entity_prompt_data(feature, entity, content_chars=content_chars, extra=extra),
    )
