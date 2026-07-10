from __future__ import annotations

from collections import Counter
import json
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.services.provider import OpenAIProvider
from app.agents.services.web_search import get_web_search_provider
from app.agents.utils.prompts import build_system_prompt
from app.api.routes.entities import serialize_entity
from app.models.entity import Entity
from app.schemas.idea import IdeaValidationResponse
from app.services.embeddings import generate_embedding

IDEA_VALIDATION_SCHEMA = {
    "title": "idea_validation_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "idea_summary": {"type": "string", "minLength": 1, "maxLength": 300},
        "your_existing_strengths": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "entity_id": {"type": "string"},
                    "reason": {"type": "string", "minLength": 1, "maxLength": 220},
                },
                "required": ["entity_id", "reason"],
            },
        },
        "missing_prerequisites": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "topic": {"type": "string", "minLength": 1, "maxLength": 120},
                    "why_needed": {"type": "string", "minLength": 1, "maxLength": 220},
                },
                "required": ["topic", "why_needed"],
            },
        },
        "suggested_mvp": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "milestone": {"type": "string", "minLength": 1, "maxLength": 120},
                    "tasks": {
                        "type": "array",
                        "items": {"type": "string", "minLength": 1, "maxLength": 120},
                        "maxItems": 8,
                    },
                },
                "required": ["milestone", "tasks"],
            },
        },
        "risk_notes": {
            "type": "array",
            "items": {"type": "string", "minLength": 1, "maxLength": 220},
            "maxItems": 8,
        },
    },
    "required": ["idea_summary", "your_existing_strengths", "missing_prerequisites", "suggested_mvp", "risk_notes"],
}
TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9_+-]{2,}")



def validate_idea(idea: str, *, db: Session, provider: OpenAIProvider | None) -> IdeaValidationResponse:
    cleaned_idea = idea.strip()
    if not cleaned_idea:
        raise ValueError("Idea is required")

    graph_candidates = load_graph_candidates(cleaned_idea, db=db, limit=8)
    candidate_map = {str(entity.id): entity for entity, _ in graph_candidates}
    graph_context = [serialize_candidate(entity, distance) for entity, distance in graph_candidates]
    tag_context = build_tag_context(cleaned_idea, db=db)
    related_projects = [item for item in graph_context if item["type"] == "project"]
    related_concepts = [item for item in graph_context if item["type"] in {"concept", "subject_topic", "til", "note"}]

    web_provider, web_note = get_web_search_provider()
    similar_products = []
    if web_provider is not None:
        try:
            similar_products = web_provider.search(cleaned_idea, limit=5)
            if not similar_products:
                web_note = "Web search is configured, but no similar products were returned for this idea."
        except RuntimeError as exc:
            web_note = str(exc)
            similar_products = []

    if provider is None:
        return build_fallback_validation(
            cleaned_idea,
            graph_candidates=graph_candidates,
            tag_context=tag_context,
            similar_products=similar_products,
            web_note=web_note,
        )

    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("idea_validator.md")},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "idea": cleaned_idea,
                        "graph_candidates": graph_context,
                        "related_projects": related_projects,
                        "related_concepts": related_concepts,
                        "matching_tags": tag_context,
                        "similar_products": similar_products,
                        "web_search_note": web_note,
                    },
                    ensure_ascii=True,
                    sort_keys=True,
                ),
            },
        ],
        json_schema=IDEA_VALIDATION_SCHEMA,
        temperature=0.2,
        max_tokens=1200,
        model=provider.smart_model,
    )

    strengths = []
    for item in payload.get("your_existing_strengths", []):
        if not isinstance(item, dict):
            continue
        entity_id = str(item.get("entity_id", "")).strip()
        entity = candidate_map.get(entity_id)
        if entity is None:
            continue
        strengths.append(
            {
                "entity_id": entity.id,
                "title": entity.title,
                "reason": str(item.get("reason", "Relevant prior work.")).strip()[:220],
            }
        )

    return IdeaValidationResponse(
        idea_summary=str(payload.get("idea_summary", cleaned_idea[:160])).strip()[:300],
        similar_products=similar_products,
        your_existing_strengths=strengths,
        missing_prerequisites=[
            {
                "topic": str(item.get("topic", "Unknown topic")).strip()[:120],
                "why_needed": str(item.get("why_needed", "Relevant prerequisite.")).strip()[:220],
            }
            for item in payload.get("missing_prerequisites", [])
            if isinstance(item, dict) and str(item.get("topic", "")).strip()
        ],
        suggested_mvp=[
            {
                "milestone": str(item.get("milestone", "Untitled milestone")).strip()[:120],
                "tasks": [str(task).strip()[:120] for task in item.get("tasks", []) if str(task).strip()][:8],
            }
            for item in payload.get("suggested_mvp", [])
            if isinstance(item, dict) and str(item.get("milestone", "")).strip()
        ],
        risk_notes=[str(note).strip()[:220] for note in payload.get("risk_notes", []) if str(note).strip()][:8],
        web_search_configured=web_provider is not None,
        web_search_note=web_note,
        graph_candidates_considered=len(graph_candidates),
        metadata={
            "matching_tags": tag_context,
            "related_project_ids": [item["id"] for item in related_projects],
            "related_concept_ids": [item["id"] for item in related_concepts],
        },
    )



def load_graph_candidates(idea: str, *, db: Session, limit: int) -> list[tuple[Entity, float]]:
    vector = generate_embedding(idea)
    distance = Entity.embedding.cosine_distance(vector).label("distance")
    rows = db.execute(
        select(Entity, distance)
        .where(Entity.embedding.is_not(None))
        .order_by(distance)
        .limit(limit)
    ).all()
    return [(entity, float(distance_value)) for entity, distance_value in rows]



def build_tag_context(idea: str, *, db: Session) -> list[dict[str, object]]:
    tokens = [token.lower() for token in TOKEN_PATTERN.findall(idea.lower())]
    token_counts = Counter(tokens)
    if not token_counts:
        return []

    entities = db.scalars(select(Entity).where(Entity.tags.is_not(None)).limit(400)).all()
    matches: list[dict[str, object]] = []
    for entity in entities:
        tags = [tag.strip() for tag in (entity.tags or []) if tag and tag.strip()]
        overlap = [tag for tag in tags if tag.lower() in token_counts]
        if overlap:
            matches.append(
                {
                    "entity_id": str(entity.id),
                    "title": entity.title,
                    "type": entity.type,
                    "tags": overlap,
                }
            )
    return matches[:12]



def serialize_candidate(entity: Entity, distance: float) -> dict[str, object]:
    metadata = entity.entity_metadata or {}
    return {
        "id": str(entity.id),
        "type": entity.type,
        "title": entity.title,
        "tags": entity.tags or [],
        "similarity": round(1.0 - distance, 4),
        "preview": (entity.content or "").strip()[:240],
        "metadata": metadata,
    }



def build_fallback_validation(
    idea: str,
    *,
    graph_candidates: list[tuple[Entity, float]],
    tag_context: list[dict[str, object]],
    similar_products: list[dict[str, object]],
    web_note: str | None,
) -> IdeaValidationResponse:
    strengths = []
    for entity, distance in graph_candidates[:4]:
        strengths.append(
            {
                "entity_id": entity.id,
                "title": entity.title,
                "reason": f"Topical similarity {1.0 - distance:.2f} from your existing graph.",
            }
        )

    missing_prereqs = []
    if not any(entity.type in {"project", "task"} for entity, _ in graph_candidates):
        missing_prereqs.append({"topic": "Delivery plan", "why_needed": "Your graph does not show closely related project execution notes yet."})
    if not any(entity.type in {"concept", "subject_topic", "note"} for entity, _ in graph_candidates):
        missing_prereqs.append({"topic": "Core technical notes", "why_needed": "You do not yet have closely related concept coverage in your graph."})

    tag_hints = []
    seen_tags: set[str] = set()
    for item in tag_context:
        for tag in item.get("tags", []):
            if isinstance(tag, str) and tag not in seen_tags:
                seen_tags.add(tag)
                tag_hints.append(tag)

    return IdeaValidationResponse(
        idea_summary=idea.strip()[:300],
        similar_products=similar_products,
        your_existing_strengths=strengths,
        missing_prerequisites=missing_prereqs,
        suggested_mvp=[
            {"milestone": "Clarify scope", "tasks": ["Define the user problem", "List the smallest useful feature set"]},
            {"milestone": "Build first slice", "tasks": ["Implement one end-to-end workflow", "Capture one success metric"]},
        ],
        risk_notes=[
            "This validation used deterministic fallback because AI reasoning was unavailable.",
            "Treat the graph matches as topical clues, not proof that the idea is already well-covered.",
        ],
        web_search_configured=bool(similar_products),
        web_search_note=web_note,
        graph_candidates_considered=len(graph_candidates),
        metadata={"matching_tags": tag_hints[:8]},
    )



def build_idea_entity_content(raw_idea: str, validation: IdeaValidationResponse) -> str:
    lines = [
        f"# {validation.idea_summary}",
        "",
        "## Raw idea",
        raw_idea.strip(),
        "",
        "## Suggested MVP",
    ]
    for milestone in validation.suggested_mvp:
        lines.append(f"### {milestone.milestone}")
        for task in milestone.tasks:
            lines.append(f"- {task}")
        lines.append("")

    lines.append("## Risks")
    for note in validation.risk_notes:
        lines.append(f"- {note}")

    if validation.missing_prerequisites:
        lines.append("")
        lines.append("## Missing prerequisites")
        for item in validation.missing_prerequisites:
            lines.append(f"- **{item.topic}**: {item.why_needed}")

    return "\n".join(lines).strip()
