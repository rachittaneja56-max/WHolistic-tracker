from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.link import LinkCreate, LinkRead, LinkUpdate

router = APIRouter(prefix="/links", tags=["links"])


def serialize_link(link: Link) -> LinkRead:
    return LinkRead.model_validate(
        {
            "id": link.id,
            "from_id": link.from_id,
            "to_id": link.to_id,
            "relation_type": link.relation_type,
            "explanation": link.explanation,
            "status": link.status,
            "created_at": link.created_at,
        }
    )


def get_link_or_404(db: Session, link_id: uuid.UUID) -> Link:
    link = db.get(Link, link_id)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    return link


def ensure_entity_exists(db: Session, entity_id: uuid.UUID) -> None:
    if db.get(Entity, entity_id) is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Entity {entity_id} does not exist")


@router.get("", response_model=list[LinkRead])
def list_links(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[LinkRead]:
    links = db.scalars(select(Link).order_by(Link.created_at.desc()).limit(limit)).all()
    return [serialize_link(link) for link in links]


@router.post("", response_model=LinkRead, status_code=status.HTTP_201_CREATED)
def create_link(payload: LinkCreate, db: Session = Depends(get_db)) -> LinkRead:
    ensure_entity_exists(db, payload.from_id)
    ensure_entity_exists(db, payload.to_id)

    link = Link(
        id=uuid.uuid4(),
        from_id=payload.from_id,
        to_id=payload.to_id,
        relation_type=payload.relation_type,
        explanation=payload.explanation.strip(),
        status=payload.status,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return serialize_link(link)


@router.patch("/{link_id}", response_model=LinkRead)
def update_link(link_id: uuid.UUID, payload: LinkUpdate, db: Session = Depends(get_db)) -> LinkRead:
    link = get_link_or_404(db, link_id)
    updates = payload.model_dump(exclude_unset=True)

    if "from_id" in updates and updates["from_id"] is not None:
        ensure_entity_exists(db, updates["from_id"])
    if "to_id" in updates and updates["to_id"] is not None:
        ensure_entity_exists(db, updates["to_id"])
    if "explanation" in updates and updates["explanation"] is not None:
        updates["explanation"] = updates["explanation"].strip()

    for field, value in updates.items():
        setattr(link, field, value)

    db.commit()
    db.refresh(link)
    return serialize_link(link)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(link_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    link = get_link_or_404(db, link_id)
    db.delete(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
