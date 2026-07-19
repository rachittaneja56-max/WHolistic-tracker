from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession
from app.schemas.entity import normalize_entity_metadata
from app.schemas.subject_workflows import LectureRecoveryRequest, PastPaperLogRequest, RevisionPlanConfirmRequest, RevisionPlanPreviewRead, RevisionPlanRequest, RevisionPriorityRead, SyllabusConfirmRequest, SyllabusPreviewRead, SyllabusPreviewRequest, TopicAssessmentMapRequest
from app.services.auth import require_owner_mutation
from app.services.entity_visibility import is_entity_deleted
from app.services.subject_workflows import revision_priority, split_syllabus_topics, syllabus_preview_token

router = APIRouter(prefix="/subject-workflows", tags=["subject-workflows"])


def _subject(db: Session, subject_id: uuid.UUID) -> Entity:
    item = db.get(Entity, subject_id)
    if item is None or is_entity_deleted(item) or item.type != "subject_topic" or item.parent_id is not None:
        raise HTTPException(404, "Subject not found")
    return item


def _topics(db: Session, subject: Entity) -> list[Entity]:
    return list(db.scalars(select(Entity).where(Entity.type == "subject_topic", Entity.parent_id == subject.id).order_by(Entity.title)).all())


@router.post("/syllabus/preview", response_model=SyllabusPreviewRead)
def preview_syllabus(payload: SyllabusPreviewRequest, db: Session = Depends(get_db)) -> SyllabusPreviewRead:
    subject = _subject(db, payload.subject_id)
    new, duplicates = split_syllabus_topics(payload.topics, [item.title or "" for item in _topics(db, subject)])
    return SyllabusPreviewRead(preview_token=syllabus_preview_token(subject.id, payload.topics), new_topics=new, duplicate_topics=duplicates)


@router.post("/syllabus/confirm", response_model=list, status_code=status.HTTP_201_CREATED)
def confirm_syllabus(payload: SyllabusConfirmRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> list:
    subject = _subject(db, payload.subject_id)
    if not payload.confirmed:
        raise HTTPException(400, "Explicit confirmation is required before importing syllabus topics.")
    if payload.preview_token != syllabus_preview_token(subject.id, payload.topics):
        raise HTTPException(409, "Syllabus preview is stale; preview the import again.")
    new, _ = split_syllabus_topics(payload.topics, [item.title or "" for item in _topics(db, subject)])
    created = [Entity(id=uuid.uuid4(), type="subject_topic", parent_id=subject.id, title=title, content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata=normalize_entity_metadata("subject_topic", {"status": "active", "recall_enabled": True, "source": "syllabus_import"})) for title in new]
    db.add_all(created); db.commit()
    return [serialize_entity(item) for item in created]


@router.post("/topic-assessments", status_code=status.HTTP_201_CREATED)
def map_topic_to_assessment(payload: TopicAssessmentMapRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    topic, assessment = db.get(Entity, payload.topic_id), db.get(Entity, payload.assessment_id)
    if topic is None or topic.type != "subject_topic" or assessment is None or assessment.type != "task":
        raise HTTPException(400, "A subject topic and assessment task are required.")
    existing = db.scalar(select(Link).where(or_(and_(Link.from_id == topic.id, Link.to_id == assessment.id), and_(Link.from_id == assessment.id, Link.to_id == topic.id))))
    if existing: raise HTTPException(409, "These items are already mapped.")
    link = Link(id=uuid.uuid4(), from_id=topic.id, to_id=assessment.id, relation_type="evidence_for", explanation="Topic is assessed by this assessment.", status="confirmed")
    db.add(link); db.commit()
    return {"link_id": str(link.id), "topic_id": str(topic.id), "assessment_id": str(assessment.id)}


@router.post("/past-papers", status_code=status.HTTP_201_CREATED)
def log_past_paper(payload: PastPaperLogRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    subject = _subject(db, payload.subject_id)
    row = ActivitySession(id=uuid.uuid4(), entity_id=subject.id, action="past_paper", date=payload.attempted_at or datetime.now(timezone.utc), meta={"workflow": "past_paper", **payload.model_dump(mode="json")})
    db.add(row); db.commit(); return {"session_id": str(row.id)}


@router.post("/lectures", status_code=status.HTTP_201_CREATED)
def log_lecture(payload: LectureRecoveryRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    subject = _subject(db, payload.subject_id)
    row = ActivitySession(id=uuid.uuid4(), entity_id=subject.id, action="lecture_attendance", date=payload.occurred_at or datetime.now(timezone.utc), meta={"workflow": "lecture_recovery", **payload.model_dump(mode="json")})
    db.add(row); db.commit(); return {"session_id": str(row.id), "recovery_required": not payload.attended and not payload.recovery_completed}


def _preview_revision(payload: RevisionPlanRequest, db: Session) -> RevisionPlanPreviewRead:
    subject = _subject(db, payload.subject_id); raw = (subject.entity_metadata or {}).get("exam_date")
    try: exam_date = date.fromisoformat(str(raw))
    except ValueError as exc: raise HTTPException(400, "Subject needs an exam_date before revision planning.") from exc
    days = (exam_date - datetime.now(timezone.utc).date()).days
    topics = {item.id: item for item in _topics(db, subject)}
    rows: list[RevisionPriorityRead] = []
    for item in payload.items:
        topic = topics.get(item.topic_id)
        if topic is None: raise HTTPException(400, "Every revision item must be a topic in this subject.")
        rows.append(RevisionPriorityRead(topic=serialize_entity(topic), priority_score=revision_priority(exam_weight=payload.exam_weight, confidence=item.confidence, days_remaining=days, estimated_minutes=item.estimated_minutes), confidence=item.confidence, estimated_minutes=item.estimated_minutes, days_remaining=days))
    return RevisionPlanPreviewRead(subject_id=subject.id, exam_date=exam_date, items=sorted(rows, key=lambda row: (-row.priority_score, row.topic.title or "")))


@router.post("/revision-plan/preview", response_model=RevisionPlanPreviewRead)
def preview_revision_plan(payload: RevisionPlanRequest, db: Session = Depends(get_db)) -> RevisionPlanPreviewRead:
    return _preview_revision(payload, db)


@router.post("/revision-plan/confirm", response_model=RevisionPlanPreviewRead)
def confirm_revision_plan(payload: RevisionPlanConfirmRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> RevisionPlanPreviewRead:
    if not payload.confirmed: raise HTTPException(400, "Explicit confirmation is required before saving a revision plan.")
    subject = _subject(db, payload.subject_id); exam_weight = float((subject.entity_metadata or {}).get("exam_weightage", 100) or 100)
    preview = _preview_revision(RevisionPlanRequest(subject_id=subject.id, exam_weight=exam_weight, items=payload.items), db)
    metadata = dict(subject.entity_metadata or {}); metadata["revision_plan"] = {"confirmed_at": datetime.now(timezone.utc).isoformat(), "items": [{"topic_id": str(item.topic.id), "priority_score": item.priority_score, "estimated_minutes": item.estimated_minutes} for item in preview.items]}; subject.entity_metadata = normalize_entity_metadata("subject_topic", metadata)
    db.commit(); return preview
