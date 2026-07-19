from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.services.recall import get_due_recall_items
from app.api.routes.entities import serialize_entity
from app.api.routes.sessions import serialize_session
from app.db.session import get_db
from app.models.entity import Entity
from app.models.review import Review
from app.models.session import ActivitySession
from app.schemas.entity import normalize_entity_metadata
from app.schemas.workflows import DsaAttemptCreate, DsaAttemptRead, DsaPracticeOverviewRead, DsaSimulationCreate, DsaWeeklyTargetsRequest
from app.services.auth import require_owner_mutation
from app.services.confidence import apply_recall_result
from app.services.dsa_practice import build_pattern_mastery
from app.services.entity_visibility import is_entity_deleted

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _problem(db: Session, problem_id: uuid.UUID) -> Entity:
    problem = db.get(Entity, problem_id)
    if problem is None or is_entity_deleted(problem) or problem.type != "dsa_problem":
        raise HTTPException(status_code=404, detail="DSA problem not found")
    return problem


def _attempt_read(row: ActivitySession) -> DsaAttemptRead:
    meta = row.meta or {}
    return DsaAttemptRead(**serialize_session(row).model_dump(), outcome=str(meta.get("outcome", "stuck")), time_taken_minutes=int(meta.get("time_taken_minutes", 0)), hint_count=int(meta.get("hint_count", 0)))


@router.get("/dsa/problems/{problem_id}", response_model=DsaPracticeOverviewRead)
def dsa_practice_overview(problem_id: uuid.UUID, db: Session = Depends(get_db)) -> DsaPracticeOverviewRead:
    problem = _problem(db, problem_id)
    attempts = db.scalars(select(ActivitySession).where(ActivitySession.entity_id == problem.id, ActivitySession.action == "dsa_attempt").order_by(ActivitySession.date.desc())).all()
    return DsaPracticeOverviewRead(problem=serialize_entity(problem), attempts=[_attempt_read(row) for row in attempts])


@router.post("/dsa/problems/{problem_id}/attempts", response_model=DsaAttemptRead, status_code=status.HTTP_201_CREATED)
def record_dsa_attempt(problem_id: uuid.UUID, payload: DsaAttemptCreate, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> DsaAttemptRead:
    problem = _problem(db, problem_id)
    if payload.outcome == "solved" and (not payload.key_invariant or not payload.mistake_classification or not payload.recognition_cue):
        raise HTTPException(400, "Solved attempts require key_invariant, mistake_classification, and recognition_cue.")
    patterns = sorted({item.strip().lower() for item in payload.patterns if item.strip()})
    now = datetime.now(timezone.utc)
    attempt = ActivitySession(id=uuid.uuid4(), entity_id=problem.id, action="dsa_attempt", date=now, meta={
        "workflow": "dsa_deliberate_practice", **payload.model_dump(), "patterns": patterns,
    })
    metadata = dict(problem.entity_metadata or {})
    metadata.update({"patterns": patterns or metadata.get("patterns", []), "language": payload.language or metadata.get("language"), "time_complexity": payload.time_complexity or metadata.get("time_complexity"), "space_complexity": payload.space_complexity or metadata.get("space_complexity"), "last_mistake_classification": payload.mistake_classification, "key_invariant": payload.key_invariant, "recognition_cue": payload.recognition_cue, "recall_enabled": True})
    if payload.outcome == "solved":
        metadata["status"] = "solved"
    if payload.solve_again_without_notes:
        metadata["status"] = "review"
        metadata["review_date"] = (now.date() + timedelta(days=2)).isoformat()
    problem.entity_metadata = normalize_entity_metadata("dsa_problem", metadata)
    if payload.recall_score is not None:
        apply_recall_result(problem, payload.recall_score, now)
        db.add(Review(id=uuid.uuid4(), entity_id=problem.id, recalled_score=payload.recall_score, reviewed_at=now))
    db.add(attempt)
    db.commit(); db.refresh(attempt)
    return _attempt_read(attempt)


@router.get("/dsa/pattern-mastery")
def dsa_pattern_mastery(db: Session = Depends(get_db)):
    attempts = db.scalars(select(ActivitySession).where(ActivitySession.action == "dsa_attempt")).all()
    due_ids = {item.entity.id for item in get_due_recall_items(db, limit=1_000_000) if item.entity.type == "dsa_problem"}
    return build_pattern_mastery(attempts, due_problem_ids=due_ids)


@router.put("/dsa/weekly-targets")
def save_dsa_weekly_targets(payload: DsaWeeklyTargetsRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    # Targets are an explicit, reviewable user preference stored on a small shared settings entity.
    settings = db.scalar(select(Entity).where(Entity.type == "note", Entity.title == "DSA weekly targets", Entity.parent_id.is_(None)))
    if settings is None:
        settings = Entity(id=uuid.uuid4(), type="note", title="DSA weekly targets", content="", content_type="markdown", tags=["dsa"], confidence_score=1, entity_metadata={"workflow": "dsa_weekly_targets", "recall_enabled": False})
        db.add(settings)
    metadata = dict(settings.entity_metadata or {}); metadata["targets"] = [item.model_dump() for item in payload.targets]; settings.entity_metadata = metadata
    db.commit()
    return {"targets": metadata["targets"]}


@router.post("/dsa/simulations", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_dsa_simulation(payload: DsaSimulationCreate, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> dict:
    for problem_id in payload.problem_ids:
        _problem(db, problem_id)
    session = ActivitySession(id=uuid.uuid4(), entity_id=payload.problem_ids[0] if payload.problem_ids else None, action="dsa_simulation", date=payload.scheduled_at or datetime.now(timezone.utc), meta={"workflow": "dsa_simulation", **payload.model_dump(mode="json"), "status": "planned"})
    db.add(session); db.commit(); db.refresh(session)
    return serialize_session(session).model_dump()
