from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.schemas.common import DuplicateDetectorResponseRead
from app.agents.services.provider import AgentMessage, OpenAIProvider, get_ai_provider
from app.agents.utils.prompts import build_system_prompt
from app.models.entity import Entity

DUPLICATE_DETECTOR_SCHEMA = {
    "title": "duplicate_detector_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "target_entity_id": {"type": "string"},
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "entity_id": {"type": "string"},
                    "match_type": {
                        "type": "string",
                        "enum": ["duplicate", "same_pattern", "related_but_different", "no_match"],
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "explanation": {"type": "string", "minLength": 1, "maxLength": 280},
                },
                "required": ["entity_id", "match_type", "confidence", "explanation"],
            },
        },
    },
    "required": ["target_entity_id", "matches"],
}


def run_duplicate_detector(entity_id: UUID, db: Session, candidate_limit: int = 6, provider: OpenAIProvider | None = None) -> DuplicateDetectorResponseRead:
    target = db.get(Entity, entity_id)
    if target is None:
        raise ValueError("Entity not found")
    if target.type != "dsa_problem":
        raise TypeError("Duplicate detector currently supports only dsa_problem entities")
    if target.embedding is None:
        raise RuntimeError("Entity embedding is missing. Refresh the embedding before running duplicate detection.")

    candidates = load_duplicate_candidates(target, db=db, limit=candidate_limit)
    if not candidates:
        return DuplicateDetectorResponseRead(target_entity_id=target.id, matches=[])

    active_provider = provider or get_ai_provider()
    payload = active_provider.generate_json(
        messages=build_duplicate_detector_messages(target, candidates),
        json_schema=DUPLICATE_DETECTOR_SCHEMA,
        temperature=0.1,
        max_tokens=900,
        model=active_provider.smart_model,
    )

    candidate_map = {str(candidate.id): candidate for candidate in candidates}
    matches = []
    for raw_match in payload.get("matches", []):
        if not isinstance(raw_match, dict):
            continue
        raw_entity_id = str(raw_match.get("entity_id", "")).strip()
        candidate = candidate_map.get(raw_entity_id)
        if candidate is None:
            continue

        match_type = str(raw_match.get("match_type", "no_match"))
        confidence = float(raw_match.get("confidence", 0.0))
        explanation = str(raw_match.get("explanation", "")).strip() or "No explanation provided."

        matches.append(
            {
                "entity_id": candidate.id,
                "title": candidate.title,
                "type": candidate.type,
                "tags": candidate.tags or [],
                "match_type": match_type,
                "confidence": max(0.0, min(1.0, confidence)),
                "explanation": explanation,
            }
        )

    return DuplicateDetectorResponseRead(target_entity_id=target.id, matches=matches)


def load_duplicate_candidates(target: Entity, *, db: Session, limit: int) -> list[Entity]:
    distance = Entity.embedding.cosine_distance(target.embedding).label("distance")
    query = (
        select(Entity, distance)
        .where(Entity.embedding.is_not(None))
        .where(Entity.type == "dsa_problem")
        .where(Entity.id != target.id)
        .order_by(distance)
        .limit(max(limit, 1))
    )
    rows = db.execute(query).all()
    return [candidate for candidate, _ in rows]


def build_duplicate_detector_messages(target: Entity, candidates: list[Entity]) -> list[AgentMessage]:
    return [
        {"role": "system", "content": build_system_prompt("duplicate_detector.md")},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "target": serialize_entity_for_prompt(target),
                    "candidates": [serialize_entity_for_prompt(candidate) for candidate in candidates],
                },
                ensure_ascii=True,
                sort_keys=True,
            ),
        },
    ]


def serialize_entity_for_prompt(entity: Entity) -> dict[str, object]:
    return {
        "id": str(entity.id),
        "type": entity.type,
        "title": entity.title,
        "tags": entity.tags or [],
        "content": (entity.content or "").strip()[:1200],
        "metadata": entity.entity_metadata or {},
    }

