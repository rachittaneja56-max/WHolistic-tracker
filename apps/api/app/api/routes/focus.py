from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.focus import DailyPlanProposalRead, DailyPlanRead, DailyPlanRequest, FocusReflectionEntityRequest, FocusReflectionRequest, FocusSessionRead, FocusStartRequest, FocusTransitionRequest, StudyBlockInput, StudyBlockRead
from app.services.entity_visibility import is_entity_deleted
from app.services.task_statuses import is_terminal_task_status

router = APIRouter(tags=["focus"])
FOCUS = "focus_session"
STUDY = "study_planned"

def now() -> datetime: return datetime.now(timezone.utc)
def parse(value: object) -> datetime | None:
    try:
        item = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return item.replace(tzinfo=timezone.utc) if item.tzinfo is None else item.astimezone(timezone.utc)
    except (TypeError, ValueError): return None

def elapsed(meta: dict, current: datetime) -> int:
    seconds = int(meta.get("elapsed_seconds", 0) or 0)
    if meta.get("status") == "running" and (started := parse(meta.get("started_at"))): seconds += max(0, int((current - started).total_seconds()))
    return max(0, ceil(seconds / 60))
def freeze(meta: dict, current: datetime) -> None:
    meta["elapsed_seconds"] = elapsed(meta, current) * 60

def entity_or_404(db: Session, entity_id: uuid.UUID) -> Entity:
    row = db.get(Entity, entity_id)
    if row is None or is_entity_deleted(row): raise HTTPException(404, "Focus work item was not found")
    return row

def active(db: Session) -> ActivitySession | None:
    rows = db.scalars(select(ActivitySession).where(ActivitySession.action == FOCUS).order_by(ActivitySession.date.desc())).all()
    return next((row for row in rows if (row.meta or {}).get("status") in {"running", "paused"}), None)
def read_focus(row: ActivitySession, entity: Entity | None = None, current: datetime | None = None) -> FocusSessionRead:
    meta, at = row.meta or {}, current or now()
    reflection = meta.get("reflection") if isinstance(meta.get("reflection"), dict) else None
    return FocusSessionRead(id=row.id, entity_id=row.entity_id, entity_title=entity.title if entity else meta.get("entity_title"), entity_type=entity.type if entity else meta.get("entity_type"), planned_minutes=int(meta.get("planned_minutes", 0)), actual_minutes=elapsed(meta, at), status=meta.get("status", "cancelled"), started_at=parse(meta.get("started_at")) or row.date or at, paused_at=parse(meta.get("paused_at")), completed_at=parse(meta.get("completed_at")), cancelled_at=parse(meta.get("cancelled_at")), interruption_count=int(meta.get("interruption_count", 0) or 0), source=str(meta.get("source", "unknown")), reflection=FocusReflectionRequest.model_validate(reflection) if reflection else None, reflection_entity_id=uuid.UUID(meta["reflection_entity_id"]) if isinstance(meta.get("reflection_entity_id"), str) else None)
def subject_for(db: Session, entity: Entity) -> Entity | None:
    seen: set[uuid.UUID] = set(); current = entity
    while current.id not in seen:
        seen.add(current.id)
        if current.type == "subject_topic" and current.parent_id is None: return current
        if current.parent_id is None: return None
        parent = db.get(Entity, current.parent_id)
        if parent is None or is_entity_deleted(parent): return None
        current = parent
    return None
def aggregate(db: Session, entity: Entity, minutes: int) -> None:
    if entity.type == "task":
        meta = dict(entity.entity_metadata or {}); meta["actual_minutes"] = int(meta.get("actual_minutes", 0) or 0) + minutes; entity.entity_metadata = meta
    if subject := subject_for(db, entity):
        meta = dict(subject.entity_metadata or {}); meta["study_actual_minutes"] = int(meta.get("study_actual_minutes", 0) or 0) + minutes; subject.entity_metadata = meta

@router.get("/focus-sessions/active", response_model=FocusSessionRead | None)
def get_active(db: Session = Depends(get_db)) -> FocusSessionRead | None:
    row = active(db); return read_focus(row, db.get(Entity, row.entity_id)) if row else None
@router.post("/focus-sessions", response_model=FocusSessionRead, status_code=status.HTTP_201_CREATED)
def start(payload: FocusStartRequest, db: Session = Depends(get_db)) -> FocusSessionRead:
    if active(db): raise HTTPException(409, "Finish, pause, or cancel the active focus session before starting another.")
    entity = entity_or_404(db, payload.entity_id); at = now()
    row = ActivitySession(id=uuid.uuid4(), entity_id=entity.id, action=FOCUS, date=at, meta={"status":"running", "planned_minutes":payload.planned_minutes, "elapsed_seconds":0, "started_at":at.isoformat(), "source":payload.source, "interruption_count":0, "entity_title":entity.title, "entity_type":entity.type, "planned_session_id":str(payload.planned_session_id) if payload.planned_session_id else None})
    db.add(row); db.commit(); db.refresh(row); return read_focus(row, entity, at)
@router.post("/focus-sessions/{session_id}/{action}", response_model=FocusSessionRead)
def transition(session_id: uuid.UUID, action: str, payload: FocusTransitionRequest | None = None, db: Session = Depends(get_db)) -> FocusSessionRead:
    row = db.get(ActivitySession, session_id)
    if row is None or row.action != FOCUS: raise HTTPException(404, "Focus session not found")
    meta, at, state = dict(row.meta or {}), now(), (row.meta or {}).get("status")
    if action == "pause" and state == "running": freeze(meta, at); meta.update(status="paused", paused_at=at.isoformat())
    elif action == "resume" and state == "paused": meta.update(status="running", started_at=at.isoformat(), paused_at=None)
    elif action in {"complete", "cancel"} and state in {"running", "paused"}:
        freeze(meta, at); meta["actual_minutes"] = elapsed(meta, at); meta["status"] = "completed" if action == "complete" else "cancelled"; meta[f"{meta['status']}_at"] = at.isoformat()
        if action == "complete": aggregate(db, entity_or_404(db, row.entity_id), elapsed(meta, at))
    else: raise HTTPException(409, "This transition is not available for the current focus state.")
    if payload and payload.interruption_count is not None: meta["interruption_count"] = payload.interruption_count
    row.meta = meta; db.commit(); db.refresh(row); return read_focus(row, db.get(Entity, row.entity_id), at)
@router.put("/focus-sessions/{session_id}/reflection", response_model=FocusSessionRead)
def reflection(session_id: uuid.UUID, payload: FocusReflectionRequest, db: Session = Depends(get_db)) -> FocusSessionRead:
    row = db.get(ActivitySession, session_id)
    if row is None or row.action != FOCUS: raise HTTPException(404, "Focus session not found")
    if (row.meta or {}).get("status") != "completed": raise HTTPException(409, "Complete the session before reflecting.")
    meta = dict(row.meta or {}); meta["reflection"] = payload.model_dump(); row.meta = meta; db.commit(); db.refresh(row); return read_focus(row, db.get(Entity, row.entity_id))
@router.post("/focus-sessions/{session_id}/reflection-entity", response_model=FocusSessionRead)
def retain_reflection(session_id: uuid.UUID, payload: FocusReflectionEntityRequest, db: Session = Depends(get_db)) -> FocusSessionRead:
    if not payload.confirm: raise HTTPException(400, "Explicit confirmation is required before creating knowledge.")
    row = db.get(ActivitySession, session_id); meta = dict(row.meta or {}) if row else {}
    if row is None or row.action != FOCUS: raise HTTPException(404, "Focus session not found")
    if meta.get("status") != "completed" or not isinstance(meta.get("reflection"), dict): raise HTTPException(409, "Save a completion reflection first.")
    if meta.get("reflection_entity_id"): raise HTTPException(409, "This reflection is already retained.")
    refl = meta["reflection"]; content = "\n\n".join(f"## {label}\n{refl.get(key, '').strip()}" for label, key in (("Accomplished","accomplished"),("Remaining","remaining"),("Learned","learned")) if str(refl.get(key, "")).strip())
    item = Entity(id=uuid.uuid4(), type=payload.entity_type, title=payload.title.strip(), content=content, content_type="markdown", tags=[], confidence_score=1, entity_metadata={"source":"focus_reflection", "focus_session_id":str(row.id), "source_entity_id":str(row.entity_id)})
    db.add(item); db.flush(); meta["reflection_entity_id"] = str(item.id); row.meta = meta; db.commit(); db.refresh(row); return read_focus(row, db.get(Entity, row.entity_id))

def blocks(db: Session, day: date) -> list[ActivitySession]:
    start = datetime.combine(day, time.min, tzinfo=timezone.utc); end = start + timedelta(days=1)
    rows = db.scalars(select(ActivitySession).where(ActivitySession.action == STUDY, ActivitySession.date >= start, ActivitySession.date < end).order_by(ActivitySession.date)).all()
    return [row for row in rows if (row.meta or {}).get("status", "planned") == "planned"]
def read_block(row: ActivitySession) -> StudyBlockRead:
    meta = row.meta or {}; return StudyBlockRead(id=row.id, entity_id=row.entity_id, planned_minutes=int(meta.get("planned_minutes", meta.get("duration_minutes", 0))), start_at=row.date, source=str(meta.get("source", "daily_plan")), status=meta.get("status", "planned"))
def plan(db: Session, day: date, available: int) -> DailyPlanProposalRead:
    existing = blocks(db, day); scheduled = sum(read_block(row).planned_minutes for row in existing)
    tasks = [row for row in db.scalars(select(Entity).where(Entity.type == "task")).all() if not is_terminal_task_status(str((row.entity_metadata or {}).get("status", "backlog")))]
    tasks.sort(key=lambda row: ({"urgent":0,"high":1,"medium":2,"low":3}.get(str((row.entity_metadata or {}).get("priority","medium")),2), str((row.entity_metadata or {}).get("due_at", "9999")), (row.title or "").lower()))
    remaining, cursor, proposed = max(0, available-scheduled), datetime.combine(day, time(9), tzinfo=timezone.utc)+timedelta(minutes=scheduled), []
    for item in tasks:
        if not remaining: break
        estimate = (item.entity_metadata or {}).get("estimated_minutes", 25); duration = min(remaining, estimate if isinstance(estimate, int) and estimate > 0 else 25)
        proposed.append(StudyBlockInput(entity_id=item.id, planned_minutes=duration, start_at=cursor, source="daily_plan")); cursor += timedelta(minutes=duration); remaining -= duration
    workload = sum(int((item.entity_metadata or {}).get("estimated_minutes", 25) or 25) for item in tasks) + scheduled
    return DailyPlanProposalRead(day=day, available_minutes=available, already_scheduled_minutes=scheduled, remaining_minutes=max(0, available-scheduled), workload_minutes=workload, is_over_capacity=scheduled>available, blocks=proposed)
@router.post("/daily-plan/propose", response_model=DailyPlanProposalRead)
def propose(payload: DailyPlanRequest, db: Session = Depends(get_db)) -> DailyPlanProposalRead: return plan(db, payload.day or now().date(), payload.available_minutes)
@router.post("/daily-plan/confirm", response_model=DailyPlanRead)
def confirm(payload: DailyPlanRequest, db: Session = Depends(get_db)) -> DailyPlanRead:
    day = payload.day or now().date()
    for block in payload.blocks: entity_or_404(db, block.entity_id)
    db.add(ActivitySession(id=uuid.uuid4(), entity_id=None, action="daily_plan", date=datetime.combine(day,time.min,tzinfo=timezone.utc), meta={"available_minutes":payload.available_minutes,"source":"daily_plan"}))
    for block in payload.blocks: db.add(ActivitySession(id=uuid.uuid4(), entity_id=block.entity_id, action=STUDY, date=block.start_at, meta={"planned_minutes":block.planned_minutes,"duration_minutes":block.planned_minutes,"source":block.source,"status":"planned"}))
    db.commit(); value = plan(db, day, payload.available_minutes); return DailyPlanRead(**value.model_dump(exclude={"blocks"}), blocks=[read_block(row) for row in blocks(db, day)])
@router.post("/study-blocks/{session_id}/{action}", response_model=StudyBlockRead)
def study_block(session_id: uuid.UUID, action: str, payload: StudyBlockInput | None = None, db: Session = Depends(get_db)) -> StudyBlockRead:
    row = db.get(ActivitySession, session_id)
    if row is None or row.action != STUDY: raise HTTPException(404, "Study block not found")
    meta = dict(row.meta or {})
    if action == "cancel": meta.update(status="cancelled", cancelled_at=now().isoformat())
    elif action == "reschedule" and payload:
        entity_or_404(db, payload.entity_id); row.entity_id, row.date = payload.entity_id, payload.start_at; meta.update(status="planned", planned_minutes=payload.planned_minutes, duration_minutes=payload.planned_minutes, source=payload.source)
    else: raise HTTPException(400, "Reschedule details are required")
    row.meta = meta; db.commit(); db.refresh(row); return read_block(row)
