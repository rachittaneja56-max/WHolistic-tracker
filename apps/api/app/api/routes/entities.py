from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession
from app.schemas.entity import EntityCreate, EntityRead, EntityUpdate

router = APIRouter(prefix="/entities", tags=["entities"])


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
        }
    )


def get_entity_or_404(db: Session, entity_id: uuid.UUID) -> Entity:
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    return entity


@router.get("", response_model=list[EntityRead])
def list_entities(
    entity_type: str | None = Query(default=None, alias="type"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[EntityRead]:
    query = select(Entity).order_by(Entity.created_at.desc()).limit(limit)
    if entity_type:
        query = query.where(Entity.type == entity_type)

    entities = db.scalars(query).all()
    return [serialize_entity(entity) for entity in entities]


@router.post("", response_model=EntityRead, status_code=status.HTTP_201_CREATED)
def create_entity(payload: EntityCreate, db: Session = Depends(get_db)) -> EntityRead:
    if payload.parent_id is not None and db.get(Entity, payload.parent_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent entity does not exist")

    entity = Entity(
        id=uuid.uuid4(),
        type=payload.type,
        parent_id=payload.parent_id,
        title=payload.title,
        content=payload.content,
        content_type=payload.content_type,
        tags=payload.tags,
        confidence_score=payload.confidence_score,
        entity_metadata=payload.metadata,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return serialize_entity(entity)


@router.get("/{entity_id}", response_model=EntityRead)
def get_entity(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> EntityRead:
    entity = get_entity_or_404(db, entity_id)
    return serialize_entity(entity)


@router.patch("/{entity_id}", response_model=EntityRead)
def update_entity(entity_id: uuid.UUID, payload: EntityUpdate, db: Session = Depends(get_db)) -> EntityRead:
    entity = get_entity_or_404(db, entity_id)
    updates = payload.model_dump(exclude_unset=True)

    if "parent_id" in updates and updates["parent_id"] is not None:
        if updates["parent_id"] == entity.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Entity cannot be its own parent")
        if db.get(Entity, updates["parent_id"]) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent entity does not exist")

    if "metadata" in updates:
        entity.entity_metadata = updates.pop("metadata")

    for field, value in updates.items():
        setattr(entity, field, value)

    db.commit()
    db.refresh(entity)
    return serialize_entity(entity)


@router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entity(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    entity = get_entity_or_404(db, entity_id)

    for child in db.scalars(select(Entity).where(Entity.parent_id == entity.id)).all():
        child.parent_id = None

    db.execute(delete(Link).where((Link.from_id == entity.id) | (Link.to_id == entity.id)))
    db.execute(delete(ActivitySession).where(ActivitySession.entity_id == entity.id))
    db.execute(delete(Review).where(Review.entity_id == entity.id))
    db.execute(delete(ComprehensionCheck).where(ComprehensionCheck.entity_id == entity.id))
    db.delete(entity)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
