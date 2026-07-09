from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.graph import GraphEdgeRead, GraphNodeRead, GraphRead

router = APIRouter(tags=["graph"])


@router.get("/graph", response_model=GraphRead)
def get_graph(
    entity_type: str | None = Query(default=None, alias="type"),
    tag: str | None = Query(default=None),
    min_confidence: float | None = Query(default=None, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
) -> GraphRead:
    entity_query = select(Entity).order_by(Entity.created_at.asc())

    if entity_type:
        entity_query = entity_query.where(Entity.type == entity_type)
    if tag:
        entity_query = entity_query.where(Entity.tags.any(tag))
    if min_confidence is not None:
        entity_query = entity_query.where(func.coalesce(Entity.confidence_score, 1.0) >= min_confidence)

    entities = db.scalars(entity_query).all()
    if not entities:
        return GraphRead(nodes=[], edges=[])

    entity_ids = [entity.id for entity in entities]
    edges = db.scalars(
        select(Link)
        .where(Link.status == "confirmed")
        .where(Link.from_id.in_(entity_ids))
        .where(Link.to_id.in_(entity_ids))
        .order_by(Link.created_at.asc())
    ).all()

    return GraphRead(
        nodes=[
            GraphNodeRead(
                id=entity.id,
                title=entity.title,
                type=entity.type,
                tags=entity.tags or [],
                confidence_score=entity.confidence_score if entity.confidence_score is not None else 1.0,
                created_at=entity.created_at,
                last_revisited_at=entity.last_revisited_at,
            )
            for entity in entities
        ],
        edges=[
            GraphEdgeRead(
                id=edge.id,
                from_id=edge.from_id,
                to_id=edge.to_id,
                relation_type=edge.relation_type,
                explanation=edge.explanation,
                status=edge.status,
            )
            for edge in edges
        ],
    )
