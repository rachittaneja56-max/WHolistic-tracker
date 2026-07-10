from __future__ import annotations

import itertools
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.activity import record_session
from app.agents.schemas.common import DeepConnectionsRunResponseRead, DeepConnectionSuggestionRead
from app.agents.services.provider import AgentMessage, OpenAIProvider, get_ai_provider
from app.agents.utils.prompts import build_system_prompt
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession

DEEP_CONNECTION_SCHEMA = {
    "title": "deep_connection_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "from_id": {"type": "string"},
                    "to_id": {"type": "string"},
                    "relation_type": {
                        "type": "string",
                        "enum": ["structural_analogy", "prerequisite", "used_in", "reminds_me_of", "none"],
                    },
                    "explanation": {"type": "string", "minLength": 1, "maxLength": 280},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["from_id", "to_id", "relation_type", "explanation", "confidence"],
            },
        },
    },
    "required": ["suggestions"],
}


def run_deep_connection_agent(
    db: Session,
    batch_limit: int = 8,
    provider: OpenAIProvider | None = None,
) -> DeepConnectionsRunResponseRead:
    active_provider = provider or get_ai_provider()
    candidate_pairs = build_candidate_pairs(db=db, batch_limit=batch_limit)
    if not candidate_pairs:
        return DeepConnectionsRunResponseRead(candidate_pairs_considered=0, suggestions_created=0, suggestions=[])

    created_suggestions: list[DeepConnectionSuggestionRead] = []
    reserved_pairs: set[tuple[str, str]] = set()

    for pair in candidate_pairs:
        from_entity = pair["from"]
        to_entity = pair["to"]
        reasons = pair["reasons"]

        payload = active_provider.generate_json(
            messages=build_deep_connection_messages(from_entity, to_entity, reasons),
            json_schema=DEEP_CONNECTION_SCHEMA,
            temperature=0.1,
            max_tokens=700,
            model=active_provider.smart_model,
        )

        for raw_suggestion in payload.get("suggestions", []):
            if not isinstance(raw_suggestion, dict):
                continue

            relation_type = str(raw_suggestion.get("relation_type", "none"))
            if relation_type == "none":
                continue

            try:
                from_id = UUID(str(raw_suggestion.get("from_id", "")).strip())
                to_id = UUID(str(raw_suggestion.get("to_id", "")).strip())
            except ValueError:
                continue

            if canonical_pair(from_id, to_id) != canonical_pair(from_entity.id, to_entity.id):
                continue

            pair_key = canonical_pair(from_id, to_id)
            if pair_key in reserved_pairs:
                continue

            explanation = str(raw_suggestion.get("explanation", "")).strip()
            if not explanation:
                continue

            confidence = max(0.0, min(1.0, float(raw_suggestion.get("confidence", 0.0))))

            link = Link(
                id=uuid.uuid4(),
                from_id=from_id,
                to_id=to_id,
                relation_type=relation_type,
                explanation=explanation,
                status="agent_suggested",
            )
            db.add(link)
            db.flush()
            record_session(
                db,
                entity_id=from_id,
                action="agent_suggested_link",
                meta={
                    "link_id": str(link.id),
                    "from_id": str(from_id),
                    "to_id": str(to_id),
                    "relation_type": relation_type,
                    "confidence": confidence,
                    "candidate_reasons": reasons,
                },
            )
            reserved_pairs.add(pair_key)
            created_suggestions.append(
                DeepConnectionSuggestionRead(
                    link_id=link.id,
                    from_id=from_id,
                    to_id=to_id,
                    from_title=from_entity.title,
                    to_title=to_entity.title,
                    relation_type=relation_type,
                    explanation=explanation,
                    confidence=confidence,
                )
            )

    db.commit()
    return DeepConnectionsRunResponseRead(
        candidate_pairs_considered=len(candidate_pairs),
        suggestions_created=len(created_suggestions),
        suggestions=created_suggestions,
    )


def build_candidate_pairs(db: Session, batch_limit: int) -> list[dict[str, object]]:
    all_entities = db.scalars(select(Entity).order_by(Entity.created_at.desc()).limit(60)).all()
    entity_by_id = {entity.id: entity for entity in all_entities}
    linked_pairs = load_existing_pairs(db)

    pair_reasons: dict[tuple[str, str], set[str]] = defaultdict(set)

    recent_entities_with_embeddings = [entity for entity in all_entities if entity.embedding is not None][:20]
    for entity in recent_entities_with_embeddings:
        similar_rows = db.execute(
            select(Entity, Entity.embedding.cosine_distance(entity.embedding).label("distance"))
            .where(Entity.embedding.is_not(None))
            .where(Entity.id != entity.id)
            .order_by("distance")
            .limit(4)
        ).all()
        for candidate, _distance in similar_rows:
            pair_key = canonical_pair(entity.id, candidate.id)
            pair_reasons[pair_key].add("embedding_similarity")
            entity_by_id.setdefault(candidate.id, candidate)

    tag_entities = [entity for entity in all_entities if entity.tags]
    for left, right in itertools.combinations(tag_entities, 2):
        shared_tags = sorted(set(left.tags or []) & set(right.tags or []))
        if shared_tags:
            pair_reasons[canonical_pair(left.id, right.id)].add(f"shared_tags:{', '.join(shared_tags[:3])}")

    recent_session_entities: list[UUID] = []
    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.entity_id.is_not(None))
        .order_by(ActivitySession.date.desc())
        .limit(30)
    ).all()
    for session_row in sessions:
        if session_row.entity_id and session_row.entity_id not in recent_session_entities:
            recent_session_entities.append(session_row.entity_id)

    for left_id, right_id in zip(recent_session_entities, recent_session_entities[1:]):
        if left_id == right_id:
            continue
        pair_reasons[canonical_pair(left_id, right_id)].add("recent_activity")

    scored_pairs: list[tuple[tuple[str, str], set[str], datetime]] = []
    fallback_time = datetime.min.replace(tzinfo=timezone.utc)
    for pair_key, reasons in pair_reasons.items():
        if pair_key in linked_pairs:
            continue
        left_entity = entity_by_id.get(UUID(pair_key[0]))
        right_entity = entity_by_id.get(UUID(pair_key[1]))
        if left_entity is None or right_entity is None:
            continue
        recency = max(left_entity.created_at or fallback_time, right_entity.created_at or fallback_time)
        scored_pairs.append((pair_key, reasons, recency))

    scored_pairs.sort(key=lambda item: (len(item[1]), item[2]), reverse=True)

    selected_pairs: list[dict[str, object]] = []
    for pair_key, reasons, _ in scored_pairs[: max(batch_limit, 1)]:
        left_entity = entity_by_id[UUID(pair_key[0])]
        right_entity = entity_by_id[UUID(pair_key[1])]
        selected_pairs.append(
            {
                "from": left_entity,
                "to": right_entity,
                "reasons": sorted(reasons),
            }
        )

    return selected_pairs


def load_existing_pairs(db: Session) -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    for link in db.scalars(select(Link).where(Link.from_id.is_not(None), Link.to_id.is_not(None))).all():
        if link.from_id and link.to_id:
            pairs.add(canonical_pair(link.from_id, link.to_id))
    return pairs


def build_deep_connection_messages(from_entity: Entity, to_entity: Entity, reasons: list[str]) -> list[AgentMessage]:
    return [
        {"role": "system", "content": build_system_prompt("deep_connection_agent.md")},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "candidate_reasons": reasons,
                    "entity_a": serialize_entity_for_prompt(from_entity),
                    "entity_b": serialize_entity_for_prompt(to_entity),
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
        "created_at": entity.created_at.isoformat() if entity.created_at else None,
    }


def canonical_pair(left_id: UUID, right_id: UUID) -> tuple[str, str]:
    left = str(left_id)
    right = str(right_id)
    return (left, right) if left < right else (right, left)
