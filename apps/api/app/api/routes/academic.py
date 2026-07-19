from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.schemas.academic import GradeScenarioRequest, GradeSummaryRead, IcsImportRequest, IcsImportResult, OccurrenceEditRequest, SemesterOverviewRead, WorkloadWeekRead
from app.schemas.entity import normalize_entity_metadata
from app.services.academic import assessment_rows, export_ics, grade_summary, occurrences_for_entity, parse_ics
from app.services.entity_visibility import active_entity_clause

router = APIRouter(prefix="/academic", tags=["academic"])


def course_tasks(db: Session, subject_ids: set[uuid.UUID]) -> list[Entity]:
    if not subject_ids: return []
    return list(db.scalars(select(Entity).where(Entity.type == "task").where(Entity.parent_id.in_(subject_ids)).where(active_entity_clause())).all())


def date_value(value: object) -> date | None:
    try: return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError: return None


@router.get("/semester/overview", response_model=SemesterOverviewRead)
def semester_overview(term: str | None = Query(default=None), include_archived: bool = Query(default=False), db: Session = Depends(get_db)) -> SemesterOverviewRead:
    subjects = list(db.scalars(select(Entity).where(Entity.type == "subject_topic").where(Entity.parent_id.is_(None)).where(active_entity_clause())).all())
    if term is None:
        active_terms = [str((item.entity_metadata or {}).get("term")) for item in subjects if (item.entity_metadata or {}).get("term") and (item.entity_metadata or {}).get("term_status", "active") == "active"]
        term = active_terms[0] if active_terms else None
    selected = [item for item in subjects if (term is None or (item.entity_metadata or {}).get("term") == term) and (include_archived or (item.entity_metadata or {}).get("term_status", "active") != "archived")]
    tasks = course_tasks(db, {item.id for item in selected})
    starts = [date_value((item.entity_metadata or {}).get("term_start_date")) for item in selected]
    ends = [date_value((item.entity_metadata or {}).get("term_end_date")) for item in selected]
    exam_starts = [date_value((item.entity_metadata or {}).get("exam_period_start")) for item in selected]
    exam_ends = [date_value((item.entity_metadata or {}).get("exam_period_end")) for item in selected]
    now = datetime.now(timezone.utc)
    upcoming = sorted([task for task in tasks if (task.entity_metadata or {}).get("academic_kind") in {"assignment", "exam"} and (date_value((task.entity_metadata or {}).get("due_at")) or date_value((task.entity_metadata or {}).get("start_at")) or date.max) >= now.date()], key=lambda item: str((item.entity_metadata or {}).get("due_at") or (item.entity_metadata or {}).get("start_at") or "9999"))
    weeks: list[WorkloadWeekRead] = []
    for index in range(8):
        week_start = now.date() - timedelta(days=now.weekday()) + timedelta(days=index * 7)
        week_end = week_start + timedelta(days=7)
        planned = completed = 0
        for task in tasks:
            metadata = task.entity_metadata or {}
            start_at = date_value(metadata.get("start_at"))
            if start_at and week_start <= start_at < week_end:
                planned += metadata.get("estimated_minutes", 0) if isinstance(metadata.get("estimated_minutes"), int) else 0
            if metadata.get("status") in {"done", "completed", "submitted"} and start_at and week_start <= start_at < week_end:
                completed += metadata.get("actual_minutes", 0) if isinstance(metadata.get("actual_minutes"), int) else 0
        weeks.append(WorkloadWeekRead(week_start=week_start, planned_minutes=planned, completed_minutes=completed))
    attention = [subject for subject in selected if any(task.parent_id == subject.id and ((task.entity_metadata or {}).get("status") == "blocked" or (task.entity_metadata or {}).get("due_at", "9999-12-31") < now.date().isoformat()) for task in tasks)]
    metadata = selected[0].entity_metadata or {} if selected else {}
    return SemesterOverviewRead(term=term, active=bool(selected) and any((item.entity_metadata or {}).get("term_status", "active") == "active" for item in selected), start_date=min((value for value in starts if value), default=None), end_date=max((value for value in ends if value), default=None), exam_period_start=min((value for value in exam_starts if value), default=None), exam_period_end=max((value for value in exam_ends if value), default=None), break_weeks=metadata.get("break_weeks", []) if isinstance(metadata.get("break_weeks", []), list) else [], courses=[serialize_entity(item) for item in selected], total_credits=sum(float((item.entity_metadata or {}).get("credits", 0) or 0) for item in selected), upcoming_assessments=[serialize_entity(item) for item in upcoming[:20]], workload=weeks, courses_needing_attention=[serialize_entity(item) for item in attention])


@router.get("/subjects/{subject_id}/grades", response_model=GradeSummaryRead)
def subject_grades(subject_id: uuid.UUID, target_grade: float | None = Query(default=None, ge=0, le=100), db: Session = Depends(get_db)) -> GradeSummaryRead:
    subject = db.get(Entity, subject_id)
    if subject is None or subject.type != "subject_topic": raise HTTPException(404, "Subject not found")
    return grade_summary(assessment_rows(course_tasks(db, {subject_id})), target_grade)


@router.post("/grades/scenario", response_model=GradeSummaryRead)
def calculate_grade_scenario(payload: GradeScenarioRequest) -> GradeSummaryRead:
    return grade_summary(payload.assessments, payload.target_grade)


@router.get("/calendar")
def academic_calendar(start_date: date, end_date: date, term: str | None = None, db: Session = Depends(get_db)):
    if end_date < start_date or (end_date - start_date).days > 62: raise HTTPException(400, "Calendar range must be between 0 and 62 days")
    subjects = list(db.scalars(select(Entity).where(Entity.type == "subject_topic").where(Entity.parent_id.is_(None)).where(active_entity_clause())).all())
    subject_ids = {item.id for item in subjects if term is None or (item.entity_metadata or {}).get("term") == term}
    range_start = datetime.combine(start_date, time.min, timezone.utc); range_end = datetime.combine(end_date, time.max, timezone.utc)
    events = [occurrence.model_dump(mode="json") for task in course_tasks(db, subject_ids) for occurrence in occurrences_for_entity(task, range_start, range_end)]
    return {"start_date": start_date, "end_date": end_date, "events": sorted(events, key=lambda item: item["start_at"])}


@router.patch("/occurrences/{entity_id}")
def edit_occurrence(entity_id: uuid.UUID, payload: OccurrenceEditRequest, db: Session = Depends(get_db)):
    entity = db.get(Entity, entity_id)
    if entity is None or entity.type != "task": raise HTTPException(404, "Scheduled item not found")
    metadata = dict(entity.entity_metadata or {})
    key = payload.occurrence_start.astimezone(timezone.utc).isoformat()
    if payload.scope == "one":
        overrides = dict(metadata.get("recurrence_overrides") or {})
        change = {name: value.isoformat() if isinstance(value, datetime) else value for name, value in payload.model_dump(exclude={"scope", "occurrence_start"}, exclude_none=True).items()}
        overrides[key] = {**dict(overrides.get(key) or {}), **change}; metadata["recurrence_overrides"] = overrides
    else:
        recurrence = dict(metadata.get("recurrence") or {})
        recurrence["until"] = (payload.occurrence_start.astimezone(timezone.utc).date() - timedelta(days=1)).isoformat()
        metadata["recurrence"] = recurrence
        clone_metadata = {**metadata, "recurrence": {k: v for k, v in recurrence.items() if k != "until"}, "recurrence_overrides": {}}
        clone_metadata["start_at"] = (payload.start_at or payload.occurrence_start).isoformat()
        if payload.end_at: clone_metadata["end_at"] = payload.end_at.isoformat()
        clone = Entity(id=uuid.uuid4(), type="task", parent_id=entity.parent_id, title=payload.title or entity.title, content=entity.content, content_type=entity.content_type, tags=entity.tags, confidence_score=entity.confidence_score, entity_metadata=normalize_entity_metadata("task", clone_metadata)); db.add(clone)
    entity.entity_metadata = normalize_entity_metadata("task", metadata); db.commit(); db.refresh(entity)
    return serialize_entity(entity)


@router.get("/ics/export")
def export_calendar(start_date: date, end_date: date, term: str | None = None, db: Session = Depends(get_db)) -> Response:
    payload = academic_calendar(start_date, end_date, term, db)
    from app.schemas.academic import AcademicOccurrenceRead
    ics = export_ics(AcademicOccurrenceRead.model_validate(event) for event in payload["events"])
    return Response(ics, media_type="text/calendar", headers={"Content-Disposition": "attachment; filename=academic-calendar.ics"})


@router.post("/ics/import", response_model=IcsImportResult, status_code=status.HTTP_201_CREATED)
def import_calendar(payload: IcsImportRequest, db: Session = Depends(get_db)) -> IcsImportResult:
    subject = db.get(Entity, payload.subject_id)
    if subject is None or subject.type != "subject_topic": raise HTTPException(404, "Subject not found")
    try: events = parse_ics(payload.ics)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
    existing = {str((item.entity_metadata or {}).get("ics_uid")) for item in course_tasks(db, {subject.id})}
    ids: list[uuid.UUID] = []; skipped = 0
    for event in events:
        uid = str(event["uid"])
        if uid in existing: skipped += 1; continue
        metadata = normalize_entity_metadata("task", {"academic_kind": "study_block", "status": "todo", "start_at": event["start"].isoformat(), "end_at": event["end"].isoformat() if event["end"] else None, "ics_uid": uid})
        row = Entity(id=uuid.uuid4(), type="task", parent_id=subject.id, title=str(event["title"]), content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata=metadata); db.add(row); ids.append(row.id)
    db.commit(); return IcsImportResult(imported=len(ids), skipped_duplicates=skipped, entity_ids=ids)