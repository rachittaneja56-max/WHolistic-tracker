from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.recall import get_due_recall_items
from app.api.routes.entities import serialize_entity
from app.api.routes.sessions import serialize_session
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession
from app.schemas.recall import RecallDueEntityRead
from app.schemas.subject import SubjectOverviewRead
from app.services.entity_visibility import active_entity_clause, is_entity_deleted

router = APIRouter(prefix="/subjects", tags=["subjects"])
LINKED_TYPES = {"note", "til", "dsa_problem", "concept", "task"}


@router.get("/{subject_id}/overview", response_model=SubjectOverviewRead)
def get_subject_overview(subject_id: uuid.UUID, db: Session = Depends(get_db)) -> SubjectOverviewRead:
    subject = db.get(Entity, subject_id)
    if subject is None or is_entity_deleted(subject) or subject.type != "subject_topic" or subject.parent_id is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    topics = db.scalars(
        select(Entity)
        .where(Entity.type == "subject_topic")
        .where(Entity.parent_id == subject.id)
        .where(active_entity_clause())
        .order_by(Entity.created_at.asc())
    ).all()
    subtree_ids = {subject.id, *[topic.id for topic in topics]}

    links = db.scalars(
        select(Link)
        .options(joinedload(Link.from_entity), joinedload(Link.to_entity))
        .where(Link.status == "confirmed")
        .where(or_(Link.from_id.in_(subtree_ids), Link.to_id.in_(subtree_ids)))
        .order_by(Link.created_at.desc())
    ).all()
    linked_entities: dict[str, list] = {key: [] for key in sorted(LINKED_TYPES)}
    seen: set[uuid.UUID] = set()
    for link in links:
        for candidate in (link.from_entity, link.to_entity):
            if candidate is None or candidate.id in subtree_ids or candidate.id in seen or is_entity_deleted(candidate):
                continue
            if candidate.type in LINKED_TYPES:
                linked_entities[candidate.type].append(serialize_entity(candidate))
                seen.add(candidate.id)

    due_reviews = []
    for item in get_due_recall_items(db, limit=500):
        if item.entity.id not in subtree_ids:
            continue
        due_reviews.append(
            RecallDueEntityRead(
                entity=serialize_entity(item.entity),
                due_score=item.due_score,
                due_reasons=item.due_reasons,
                days_since_review=item.days_since_review,
                days_until_exam=item.days_until_exam,
            )
        )

    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.entity_id.in_(subtree_ids))
        .order_by(ActivitySession.date.desc())
        .limit(50)
    ).all()

    metadata = subject.entity_metadata or {}
    target = float(metadata.get("target_confidence", 0.8)) if isinstance(metadata.get("target_confidence", 0.8), (int, float)) else 0.8
    weak_topics = sorted(
        [topic for topic in topics if (topic.confidence_score if topic.confidence_score is not None else 1.0) < target],
        key=lambda topic: topic.confidence_score if topic.confidence_score is not None else 1.0,
    )

    return SubjectOverviewRead(
        subject=serialize_entity(subject),
        topics=[serialize_entity(topic) for topic in topics],
        linked_entities=linked_entities,
        due_reviews=due_reviews,
        recent_sessions=[serialize_session(row) for row in sessions],
        weak_topics=[serialize_entity(topic) for topic in weak_topics],
    )
