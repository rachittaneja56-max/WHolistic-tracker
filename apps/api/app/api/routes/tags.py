from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.services.weekly_digest import build_tag_taxonomy
from app.db.session import get_db
from app.models.entity import Entity
from app.schemas.entity import EntityRead
from app.schemas.weekly import TagTaxonomyItemRead, TagTaxonomyResponse

router = APIRouter(prefix="/tags", tags=["tags"])


def serialize_entity(entity: Entity) -> EntityRead:
    return EntityRead.model_validate(
        {
            "id": entity.id,
            "type": entity.type,
            "parent_id": entity.parent_id,
            "title": entity.title,
            "content": entity.content,
            "content_type": entity.content_type,
            "tags": entity.tags or [],
            "confidence_score": entity.confidence_score if entity.confidence_score is not None else 1.0,
            "last_revisited_at": entity.last_revisited_at,
            "created_at": entity.created_at,
            "metadata": entity.entity_metadata or {},
            "has_embedding": entity.embedding is not None,
        }
    )


@router.get("/taxonomy", response_model=TagTaxonomyResponse)
def get_tag_taxonomy(db: Session = Depends(get_db)) -> TagTaxonomyResponse:
    taxonomy = build_tag_taxonomy(db)
    items = [
        TagTaxonomyItemRead.model_validate(item)
        for _, item in sorted(taxonomy.items(), key=lambda pair: (-pair[1]["total_entity_count"], pair[0].lower()))
    ]
    return TagTaxonomyResponse(tags=items)


@router.get("/{tag}/entities", response_model=list[EntityRead])
def get_entities_for_tag(
    tag: str,
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[EntityRead]:
    entities = db.scalars(
        select(Entity)
        .where(Entity.tags.any(tag))
        .order_by(Entity.created_at.desc())
        .limit(limit)
    ).all()
    return [serialize_entity(entity) for entity in entities]
