from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.activity import record_session
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession
from app.schemas.link import LinkCreate, LinkRead, LinkUpdate, ReviewInboxLinkRead
from app.services.auth import require_owner_mutation

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


def get_entity_or_400(db: Session, entity_id: uuid.UUID) -> Entity:
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Entity {entity_id} does not exist")
    return entity


def load_agent_confidence_map(db: Session) -> dict[str, float]:
    confidence_by_link_id: dict[str, float] = {}
    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action == "agent_suggested_link")
        .order_by(ActivitySession.date.desc())
        .limit(500)
    ).all()

    for session_row in sessions:
        meta = session_row.meta or {}
        link_id = meta.get("link_id")
        confidence = meta.get("confidence")
        if not isinstance(link_id, str) or link_id in confidence_by_link_id:
            continue
        if isinstance(confidence, (int, float)):
            confidence_by_link_id[link_id] = float(confidence)

    return confidence_by_link_id


def serialize_review_inbox_link(link: Link, confidence_by_link_id: dict[str, float]) -> ReviewInboxLinkRead:
    if link.from_id is None or link.to_id is None:
        raise ValueError("Review inbox links require both from_id and to_id")

    return ReviewInboxLinkRead(
        id=link.id,
        from_id=link.from_id,
        to_id=link.to_id,
        from_title=link.from_entity.title if link.from_entity else None,
        to_title=link.to_entity.title if link.to_entity else None,
        from_type=link.from_entity.type if link.from_entity else None,
        to_type=link.to_entity.type if link.to_entity else None,
        relation_type=link.relation_type,
        explanation=link.explanation,
        status=link.status,
        confidence=confidence_by_link_id.get(str(link.id)),
        created_at=link.created_at,
    )


@router.get("", response_model=list[LinkRead])
def list_links(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[LinkRead]:
    links = db.scalars(select(Link).order_by(Link.created_at.desc()).limit(limit)).all()
    return [serialize_link(link) for link in links]


@router.get("/review-inbox", response_model=list[ReviewInboxLinkRead])
def get_review_inbox(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)) -> list[ReviewInboxLinkRead]:
    links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "agent_suggested")
        .order_by(Link.created_at.desc())
        .limit(limit)
    ).all()
    confidence_by_link_id = load_agent_confidence_map(db)
    return [serialize_review_inbox_link(link, confidence_by_link_id) for link in links if link.from_id and link.to_id]


@router.post("", response_model=LinkRead, status_code=status.HTTP_201_CREATED)
def create_link(payload: LinkCreate, db: Session = Depends(get_db)) -> LinkRead:
    from_entity = get_entity_or_400(db, payload.from_id)
    to_entity = get_entity_or_400(db, payload.to_id)

    if payload.from_id == payload.to_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_id and to_id cannot be the same")

    link = Link(
        id=uuid.uuid4(),
        from_id=payload.from_id,
        to_id=payload.to_id,
        relation_type=payload.relation_type,
        explanation=payload.explanation,
        status=payload.status,
    )
    db.add(link)

    if payload.status == "confirmed":
        record_session(
            db,
            entity_id=from_entity.id,
            action="linked",
            meta={
                "entity_title": from_entity.title,
                "entity_type": from_entity.type,
                "linked_entity_id": str(to_entity.id),
                "linked_entity_title": to_entity.title,
                "linked_entity_type": to_entity.type,
                "relation_type": link.relation_type,
                "link_status": link.status,
            },
        )

    db.commit()
    db.refresh(link)
    return serialize_link(link)


@router.post("/{link_id}/confirm", response_model=LinkRead)
def confirm_link(link_id: uuid.UUID, db: Session = Depends(get_db)) -> LinkRead:
    link = get_link_or_404(db, link_id)
    if link.from_id is None or link.to_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link is missing entity references")

    previous_status = link.status
    link.status = "confirmed"
    from_entity = get_entity_or_400(db, link.from_id)
    to_entity = get_entity_or_400(db, link.to_id)

    if previous_status != "confirmed":
        record_session(
            db,
            entity_id=from_entity.id,
            action="linked",
            meta={
                "entity_title": from_entity.title,
                "entity_type": from_entity.type,
                "linked_entity_id": str(to_entity.id),
                "linked_entity_title": to_entity.title,
                "linked_entity_type": to_entity.type,
                "relation_type": link.relation_type,
                "link_status": link.status,
                "source": "review_inbox_confirm",
            },
        )

    db.commit()
    db.refresh(link)
    return serialize_link(link)


@router.post("/{link_id}/reject", response_model=LinkRead)
def reject_link(link_id: uuid.UUID, db: Session = Depends(get_db)) -> LinkRead:
    link = get_link_or_404(db, link_id)
    link.status = "rejected"
    db.commit()
    db.refresh(link)
    return serialize_link(link)


@router.patch("/{link_id}", response_model=LinkRead)
def update_link(link_id: uuid.UUID, payload: LinkUpdate, db: Session = Depends(get_db)) -> LinkRead:
    link = get_link_or_404(db, link_id)
    updates = payload.model_dump(exclude_unset=True)

    if "from_id" in updates and updates["from_id"] is not None:
        get_entity_or_400(db, updates["from_id"])
    if "to_id" in updates and updates["to_id"] is not None:
        get_entity_or_400(db, updates["to_id"])

    next_from_id = updates.get("from_id", link.from_id)
    next_to_id = updates.get("to_id", link.to_id)
    if next_from_id is not None and next_to_id is not None and next_from_id == next_to_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from_id and to_id cannot be the same")

    for field, value in updates.items():
        setattr(link, field, value)

    db.commit()
    db.refresh(link)
    return serialize_link(link)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(link_id: uuid.UUID, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> Response:
    link = get_link_or_404(db, link_id)
    db.delete(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
