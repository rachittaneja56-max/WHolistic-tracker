from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.context import is_ai_excluded, serialize_entity_context, serialize_untrusted_context
from app.agents.utils.prompts import build_system_prompt
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.chat import GraphChatCitationRead, GraphChatResponse
from app.services.embeddings import generate_embedding

GRAPH_CHAT_SCHEMA = {
    "title": "graph_chat_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answer": {"type": "string", "minLength": 1, "maxLength": 2400},
        "citations": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "entity_id": {"type": "string", "minLength": 1, "maxLength": 80},
                    "title": {"type": "string", "minLength": 1, "maxLength": 200},
                    "reason_used": {"type": "string", "minLength": 1, "maxLength": 240},
                    "evidence_excerpt": {"type": "string", "minLength": 1, "maxLength": 400},
                },
                "required": ["entity_id", "title", "reason_used", "evidence_excerpt"],
            },
        },
        "missing": {"type": "boolean"},
    },
    "required": ["answer", "citations", "missing"],
}
TOKEN_PATTERN = re.compile(r"[a-z0-9_+#./-]+")
PRIMARY_LIMIT = 5
MAX_CONTEXT_ENTITIES = 10
MAX_CONTEXT_CHARS = 10_000


@dataclass(slots=True)
class RetrievedGraphEntity:
    entity: Entity
    reason: str
    distance: float | None = None


def tokenize(text: str) -> set[str]:
    return {token for token in TOKEN_PATTERN.findall(text.lower()) if len(token) >= 3}


def build_entity_search_text(entity: Entity) -> str:
    parts = [entity.title or "", entity.type or "", entity.content or "", " ".join(entity.tags or [])]
    return "\n".join(part for part in parts if part)


def entity_matches_question(entity: Entity, *, question_tokens: set[str], similarity: float) -> bool:
    if similarity >= 0.62:
        return True
    if not question_tokens:
        return similarity >= 0.55
    entity_tokens = tokenize(build_entity_search_text(entity))
    return bool(question_tokens & entity_tokens)


def get_primary_entities(question: str, db: Session) -> list[RetrievedGraphEntity]:
    question_embedding = generate_embedding(question)
    distance = Entity.embedding.cosine_distance(question_embedding).label("distance")
    rows = db.execute(
        select(Entity, distance)
        .where(
            or_(
                Entity.entity_metadata.is_(None),
                Entity.entity_metadata["ai_exclude"].astext.is_(None),
                Entity.entity_metadata["ai_exclude"].astext != "true",
            )
        )
        .where(Entity.embedding.is_not(None))
        .order_by(distance)
        .limit(PRIMARY_LIMIT)
    ).all()

    question_tokens = tokenize(question)
    primary_matches: list[RetrievedGraphEntity] = []

    for entity, distance_value in rows:
        similarity = 1.0 - float(distance_value)
        if not entity_matches_question(entity, question_tokens=question_tokens, similarity=similarity):
            continue
        primary_matches.append(
            RetrievedGraphEntity(
                entity=entity,
                reason=f"vector match {similarity:.2f}",
                distance=float(distance_value),
            )
        )

    return primary_matches


def expand_confirmed_neighbors(entity_ids: Iterable[UUID], db: Session) -> list[RetrievedGraphEntity]:
    entity_ids = list(entity_ids)
    if not entity_ids:
        return []

    links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "confirmed")
        .where(or_(Link.from_id.in_(entity_ids), Link.to_id.in_(entity_ids)))
        .order_by(Link.created_at.desc())
    ).all()

    results: list[RetrievedGraphEntity] = []
    for link in links:
        if link.from_entity is not None and link.from_id not in entity_ids:
            results.append(RetrievedGraphEntity(entity=link.from_entity, reason=f"1-hop confirmed link via {link.relation_type or 'confirmed'}"))
        if link.to_entity is not None and link.to_id not in entity_ids:
            results.append(RetrievedGraphEntity(entity=link.to_entity, reason=f"1-hop confirmed link via {link.relation_type or 'confirmed'}"))
    return results


def expand_hierarchy(primary_matches: list[RetrievedGraphEntity], db: Session) -> list[RetrievedGraphEntity]:
    entity_ids = [item.entity.id for item in primary_matches if item.entity.id is not None]
    parent_ids = [item.entity.parent_id for item in primary_matches if item.entity.parent_id is not None]
    results: list[RetrievedGraphEntity] = []

    if entity_ids:
        child_entities = db.scalars(select(Entity).where(Entity.parent_id.in_(entity_ids))).all()
        results.extend(RetrievedGraphEntity(entity=entity, reason="child hierarchy context") for entity in child_entities)

    if parent_ids:
        parent_entities = db.scalars(select(Entity).where(Entity.id.in_(parent_ids))).all()
        results.extend(RetrievedGraphEntity(entity=entity, reason="parent hierarchy context") for entity in parent_entities)

    return results


def dedupe_retrieved_entities(groups: Iterable[list[RetrievedGraphEntity]]) -> list[RetrievedGraphEntity]:
    seen_ids: set[UUID] = set()
    results: list[RetrievedGraphEntity] = []

    for group in groups:
        for item in group:
            if item.entity.id in seen_ids or item.entity.id is None or is_ai_excluded(item.entity):
                continue
            seen_ids.add(item.entity.id)
            results.append(item)
            if len(results) >= MAX_CONTEXT_ENTITIES:
                return results

    return results


def build_context_block(item: RetrievedGraphEntity) -> str:
    return serialize_entity_context(
        "rag",
        item.entity,
        provenance="retrieved_personal_graph_entity",
        content_chars=900,
        extra={"retrieval_reason": item.reason},
    )


def build_chat_context(question: str, retrieved_entities: list[RetrievedGraphEntity]) -> str:
    blocks: list[str] = [
        serialize_untrusted_context(
            "rag",
            provenance="user_question",
            data={"question": question},
            max_chars=4_500,
        )
    ]
    total_chars = len(blocks[0])

    for item in retrieved_entities:
        block = build_context_block(item)
        if total_chars + len(block) + 2 > MAX_CONTEXT_CHARS:
            break
        blocks.append(block)
        total_chars += len(block) + 2

    return "\n\n".join(blocks)


def canonical_evidence_excerpt(entity: Entity, requested_excerpt: object) -> str | None:
    requested = str(requested_excerpt or "").strip()
    if not requested:
        return None
    sources = [entity.content or "", entity.title or "", " ".join(entity.tags or [])]
    for source in sources:
        exact_index = source.casefold().find(requested.casefold())
        if exact_index >= 0:
            return source[exact_index : exact_index + len(requested)].strip()[:400]
        tokens = [re.escape(token) for token in re.split(r"\s+", requested) if token]
        if not tokens:
            continue
        match = re.search(r"\s+".join(tokens), source, flags=re.IGNORECASE)
        if match:
            return match.group(0).strip()[:400]
    return None


def run_graph_chat(question: str, *, db: Session, provider: OpenAIProvider) -> GraphChatResponse:
    cleaned_question = question.strip()
    if not cleaned_question:
        raise TypeError("Question is required")

    primary_matches = get_primary_entities(cleaned_question, db)
    if not primary_matches:
        return GraphChatResponse(answer="You have not written enough about this yet.", citations=[], missing=True)

    primary_ids = [item.entity.id for item in primary_matches if item.entity.id is not None]
    retrieved_entities = dedupe_retrieved_entities(
        [
            primary_matches,
            expand_confirmed_neighbors(primary_ids, db),
            expand_hierarchy(primary_matches, db),
        ]
    )

    if not retrieved_entities:
        return GraphChatResponse(answer="You have not written enough about this yet.", citations=[], missing=True)

    context = build_chat_context(cleaned_question, retrieved_entities)
    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("rag_chat.md")},
            {
                "role": "user",
                "content": (
                    "Answer the question using only this retrieved personal graph context. "
                    "If the context is insufficient, return missing=true and say the user has not written enough about it yet.\n\n"
                    f"{context}"
                ),
            },
        ],
        json_schema=GRAPH_CHAT_SCHEMA,
        temperature=0.1,
        max_tokens=1000,
        model=provider.smart_model,
    )

    retrieved_map = {str(item.entity.id): item.entity for item in retrieved_entities if item.entity.id is not None}
    citations: list[GraphChatCitationRead] = []
    seen_ids: set[str] = set()

    for citation in payload.get("citations", [])[:6]:
        entity_id = str(citation.get("entity_id", "")).strip()
        if not entity_id or entity_id not in retrieved_map or entity_id in seen_ids:
            continue
        entity = retrieved_map[entity_id]
        evidence_excerpt = canonical_evidence_excerpt(entity, citation.get("evidence_excerpt"))
        if evidence_excerpt is None:
            continue
        seen_ids.add(entity_id)
        citations.append(
            GraphChatCitationRead(
                entity_id=entity_id,
                title=str(citation.get("title") or entity.title or "Untitled entity")[:200],
                reason_used=str(citation.get("reason_used") or "Used as supporting context.").strip()[:240],
                evidence_excerpt=evidence_excerpt,
            )
        )

    missing = bool(payload.get("missing", False))
    answer = str(payload.get("answer", "You have not written enough about this yet.")).strip()[:2400]
    if missing and answer != "You have not written enough about this yet.":
        answer = f"{answer}\n\nYou have not written enough about this yet."

    if not citations and not missing:
        return GraphChatResponse(answer="You have not written enough about this yet.", citations=[], missing=True)

    return GraphChatResponse(answer=answer, citations=citations, missing=missing)
