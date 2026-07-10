from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.activity import record_session
from app.db.session import get_db
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession
from app.schemas.embedding import EntityConnectionRead, EntityLinkCandidateRead, EntitySimilarityRead, RefreshAllEmbeddingsRead
from app.schemas.entity import EntityCreate, EntityRead, EntityUpdate, normalize_entity_metadata
from app.services.confidence import mark_entity_revisited
from app.services.embeddings import get_similar_entities, update_entity_embedding

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/entities", tags=["entities"])
EMBEDDING_RELEVANT_FIELDS = {"title", "content", "tags", "type", "metadata"}
PREVIEW_LENGTH = 180
WHITESPACE_PATTERN = re.compile(r"\s+")



def build_content_preview(content: str | None) -> str:
    cleaned = WHITESPACE_PATTERN.sub(" ", (content or "").strip())
    if not cleaned:
        return "No content preview available."
    if len(cleaned) <= PREVIEW_LENGTH:
        return cleaned
    return f"{cleaned[: PREVIEW_LENGTH - 3].rstrip()}..."



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



def serialize_connection(link: Link, current_entity_id: uuid.UUID) -> EntityConnectionRead | None:
    is_outgoing = link.from_id == current_entity_id
    connected_entity = link.to_entity if is_outgoing else link.from_entity
    if connected_entity is None or connected_entity.id is None:
        return None

    return EntityConnectionRead(
        link_id=link.id,
        relation_type=link.relation_type,
        explanation=link.explanation,
        status=link.status,
        created_at=link.created_at.isoformat() if link.created_at else None,
        direction="outgoing" if is_outgoing else "incoming",
        entity_id=connected_entity.id,
        entity_title=connected_entity.title,
        entity_type=connected_entity.type,
        entity_tags=connected_entity.tags or [],
        entity_preview=build_content_preview(connected_entity.content),
    )



def get_entity_or_404(db: Session, entity_id: uuid.UUID) -> Entity:
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    return entity



def apply_entity_filters(
    query,
    *,
    entity_type: str | None = None,
    parent_id: uuid.UUID | None = None,
    tag: str | None = None,
    metadata_status: str | None = None,
):
    if entity_type:
        query = query.where(Entity.type == entity_type)
    if parent_id is not None:
        query = query.where(Entity.parent_id == parent_id)
    if tag:
        query = query.where(Entity.tags.any(tag))
    if metadata_status:
        query = query.where(Entity.entity_metadata.contains({"status": metadata_status}))
    return query



def merge_metadata(current_metadata: dict[str, Any] | None, incoming_metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if incoming_metadata is None:
        return current_metadata
    return {**(current_metadata or {}), **incoming_metadata}



def try_refresh_entity_embedding(entity_id: uuid.UUID) -> Entity | None:
    try:
        return update_entity_embedding(entity_id)
    except Exception:
        logger.exception("Unable to refresh embedding for entity %s", entity_id)
        return None



def get_linked_entity_ids(db: Session, entity_id: uuid.UUID) -> set[uuid.UUID]:
    links = db.scalars(select(Link).where(or_(Link.from_id == entity_id, Link.to_id == entity_id))).all()
    linked_entity_ids: set[uuid.UUID] = {entity_id}

    for link in links:
        counterpart_id = link.to_id if link.from_id == entity_id else link.from_id
        if counterpart_id is not None:
            linked_entity_ids.add(counterpart_id)

    return linked_entity_ids


@router.get("", response_model=list[EntityRead])
def list_entities(
    entity_type: str | None = Query(default=None, alias="type"),
    parent_id: uuid.UUID | None = Query(default=None),
    tag: str | None = Query(default=None),
    metadata_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[EntityRead]:
    query = select(Entity).order_by(Entity.created_at.desc())
    query = apply_entity_filters(
        query,
        entity_type=entity_type,
        parent_id=parent_id,
        tag=tag,
        metadata_status=metadata_status,
    ).limit(limit)

    entities = db.scalars(query).all()
    return [serialize_entity(entity) for entity in entities]


@router.post("", response_model=EntityRead, status_code=status.HTTP_201_CREATED)
def create_entity(payload: EntityCreate, db: Session = Depends(get_db)) -> EntityRead:
    if payload.parent_id is not None and db.get(Entity, payload.parent_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent entity does not exist")

    try:
        normalized_metadata = normalize_entity_metadata(payload.type, payload.metadata)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    entity = Entity(
        id=uuid.uuid4(),
        type=payload.type,
        parent_id=payload.parent_id,
        title=payload.title.strip(),
        content=payload.content,
        content_type=payload.content_type,
        tags=payload.tags,
        confidence_score=payload.confidence_score,
        entity_metadata=normalized_metadata,
    )
    db.add(entity)
    record_session(
        db,
        entity_id=entity.id,
        action="created",
        meta={
            "entity_title": entity.title,
            "entity_type": entity.type,
        },
    )
    db.commit()
    db.refresh(entity)

    refreshed_entity = try_refresh_entity_embedding(entity.id)
    return serialize_entity(refreshed_entity or entity)


@router.post("/embedding/refresh-all", response_model=RefreshAllEmbeddingsRead)
def refresh_all_entity_embeddings(db: Session = Depends(get_db)) -> RefreshAllEmbeddingsRead:
    entity_ids = db.scalars(select(Entity.id).order_by(Entity.created_at.asc())).all()

    refreshed_count = 0
    failed_entity_ids: list[uuid.UUID] = []

    for entity_id in entity_ids:
        refreshed_entity = try_refresh_entity_embedding(entity_id)
        if refreshed_entity is None:
            failed_entity_ids.append(entity_id)
        else:
            refreshed_count += 1

    return RefreshAllEmbeddingsRead(
        total_entities=len(entity_ids),
        refreshed_count=refreshed_count,
        failed_count=len(failed_entity_ids),
        failed_entity_ids=failed_entity_ids,
    )


@router.get("/{entity_id}/link-candidates", response_model=list[EntityLinkCandidateRead])
def list_link_candidates(
    entity_id: uuid.UUID,
    limit: int = Query(default=8, ge=1, le=25),
    db: Session = Depends(get_db),
) -> list[EntityLinkCandidateRead]:
    get_entity_or_404(db, entity_id)
    excluded_entity_ids = get_linked_entity_ids(db, entity_id)

    try:
        candidates = get_similar_entities(entity_id, db=db, limit=limit, excluded_entity_ids=excluded_entity_ids)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Entity embedding is missing. Refresh the embedding before viewing link candidates.",
        ) from exc

    return [
        EntityLinkCandidateRead(
            id=candidate.id,
            title=candidate.title,
            type=candidate.type,
            tags=candidate.tags or [],
            preview=build_content_preview(candidate.content),
            distance=distance,
            similarity=1.0 - distance,
        )
        for candidate, distance in candidates
    ]


@router.get("/{entity_id}/connections", response_model=list[EntityConnectionRead])
def list_entity_connections(
    entity_id: uuid.UUID,
    status_filter: str | None = Query(default="confirmed", alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[EntityConnectionRead]:
    get_entity_or_404(db, entity_id)

    query = (
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(or_(Link.from_id == entity_id, Link.to_id == entity_id))
        .order_by(Link.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        query = query.where(Link.status == status_filter)

    links = db.scalars(query).all()
    results: list[EntityConnectionRead] = []
    for link in links:
        serialized = serialize_connection(link, entity_id)
        if serialized is not None:
            results.append(serialized)
    return results


@router.get("/{entity_id}/children", response_model=list[EntityRead])
def list_child_entities(
    entity_id: uuid.UUID,
    entity_type: str | None = Query(default=None, alias="type"),
    tag: str | None = Query(default=None),
    metadata_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[EntityRead]:
    get_entity_or_404(db, entity_id)

    query = select(Entity).where(Entity.parent_id == entity_id).order_by(Entity.created_at.asc())
    query = apply_entity_filters(query, entity_type=entity_type, tag=tag, metadata_status=metadata_status).limit(limit)

    children = db.scalars(query).all()
    return [serialize_entity(entity) for entity in children]


@router.post("/{entity_id}/embedding/refresh", response_model=EntityRead)
def refresh_entity_embedding_route(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> EntityRead:
    get_entity_or_404(db, entity_id)

    try:
        entity = update_entity_embedding(entity_id, db=db)
    except Exception as exc:
        logger.exception("Unable to refresh embedding for entity %s", entity_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to refresh embedding") from exc

    return serialize_entity(entity)


@router.post("/{entity_id}/revisit", response_model=EntityRead)
def revisit_entity(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> EntityRead:
    entity = get_entity_or_404(db, entity_id)
    mark_entity_revisited(entity)
    record_session(
        db,
        entity_id=entity.id,
        action="revisited",
        meta={
            "entity_title": entity.title,
            "entity_type": entity.type,
            "source": "graph_revisit",
        },
    )
    db.commit()
    db.refresh(entity)
    return serialize_entity(entity)


@router.get("/{entity_id}/similar", response_model=list[EntitySimilarityRead])
def list_similar_entities(
    entity_id: uuid.UUID,
    limit: int = Query(default=5, ge=1, le=25),
    db: Session = Depends(get_db),
) -> list[EntitySimilarityRead]:
    get_entity_or_404(db, entity_id)

    try:
        similar_entities = get_similar_entities(entity_id, db=db, limit=limit)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Entity embedding is missing. Refresh the embedding before searching for similar entities.",
        ) from exc

    return [
        EntitySimilarityRead(
            entity=serialize_entity(entity),
            distance=distance,
            similarity=1.0 - distance,
        )
        for entity, distance in similar_entities
    ]


@router.get("/{entity_id}", response_model=EntityRead)
def get_entity(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> EntityRead:
    entity = get_entity_or_404(db, entity_id)
    return serialize_entity(entity)


@router.patch("/{entity_id}", response_model=EntityRead)
def update_entity(entity_id: uuid.UUID, payload: EntityUpdate, db: Session = Depends(get_db)) -> EntityRead:
    entity = get_entity_or_404(db, entity_id)
    updates = payload.model_dump(exclude_unset=True)
    should_refresh_embedding = any(field in EMBEDDING_RELEVANT_FIELDS for field in updates)

    if "parent_id" in updates and updates["parent_id"] is not None:
        if updates["parent_id"] == entity.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Entity cannot be its own parent")
        if db.get(Entity, updates["parent_id"]) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent entity does not exist")

    previous_status = (entity.entity_metadata or {}).get("status")
    next_entity_type = updates.get("type", entity.type)

    if "metadata" in updates:
        merged_metadata = merge_metadata(entity.entity_metadata, updates.pop("metadata"))
        try:
            entity.entity_metadata = normalize_entity_metadata(next_entity_type, merged_metadata)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    elif "type" in updates:
        try:
            entity.entity_metadata = normalize_entity_metadata(next_entity_type, entity.entity_metadata)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if "title" in updates and updates["title"] is not None:
        updates["title"] = updates["title"].strip()

    for field, value in updates.items():
        setattr(entity, field, value)

    new_status = (entity.entity_metadata or {}).get("status")
    if previous_status != new_status:
        record_session(
            db,
            entity_id=entity.id,
            action="revisited",
            meta={
                "entity_title": entity.title,
                "entity_type": entity.type,
                "previous_status": previous_status,
                "next_status": new_status,
            },
        )

    db.commit()
    db.refresh(entity)

    if should_refresh_embedding:
        refreshed_entity = try_refresh_entity_embedding(entity.id)
        if refreshed_entity is not None:
            entity = refreshed_entity

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
