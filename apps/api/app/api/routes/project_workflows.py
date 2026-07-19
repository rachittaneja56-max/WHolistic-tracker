from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession
from app.schemas.entity import normalize_entity_metadata
from app.schemas.project_workflows import CourseProjectAssociationRequest, DocumentationChecklistRequest, PortfolioDraftRead, PortfolioSaveRequest, ProjectDeadlineRequest
from app.services.auth import require_owner_mutation
from app.services.entity_visibility import is_entity_deleted
from app.services.project_portfolio import portfolio_draft

router = APIRouter(prefix="/project-workflows", tags=["project-workflows"])


def _project(db: Session, project_id: uuid.UUID) -> Entity:
    project = db.get(Entity, project_id)
    if project is None or is_entity_deleted(project) or project.type != "project": raise HTTPException(404, "Project not found")
    return project


def _project_tasks(db: Session, project: Entity) -> list[Entity]:
    milestones = list(db.scalars(select(Entity).where(Entity.type == "milestone", Entity.parent_id == project.id)).all())
    return list(db.scalars(select(Entity).where(Entity.type == "task", Entity.parent_id.in_({project.id, *[item.id for item in milestones]}))).all())


def _project_sessions(db: Session, project: Entity, tasks: list[Entity]) -> list[ActivitySession]:
    ids = {project.id, *[item.id for item in tasks]}
    return list(db.scalars(select(ActivitySession).where(ActivitySession.entity_id.in_(ids))).all())


@router.post("/associations")
def associate_course(payload: CourseProjectAssociationRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    project = _project(db, payload.project_id); course = db.get(Entity, payload.course_id)
    if course is None or course.type != "subject_topic" or course.parent_id is not None: raise HTTPException(400, "Course must be a top-level subject.")
    existing = db.scalar(select(Link).where(or_(and_(Link.from_id == course.id, Link.to_id == project.id), and_(Link.from_id == project.id, Link.to_id == course.id))))
    if existing is None: db.add(Link(id=uuid.uuid4(), from_id=course.id, to_id=project.id, relation_type="implements", explanation="Course-associated project.", status="confirmed"))
    meta = dict(project.entity_metadata or {}); meta.update(course_id=str(course.id), semester=payload.semester.strip()); project.entity_metadata = normalize_entity_metadata("project", meta)
    db.commit(); return {"project_id": str(project.id), "course_id": str(course.id), "semester": meta["semester"]}


@router.put("/{project_id}/deadlines")
def update_project_deadlines(project_id: uuid.UUID, payload: ProjectDeadlineRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    project = _project(db, project_id); meta = dict(project.entity_metadata or {})
    meta.update({key: value.isoformat() if value else None for key, value in payload.model_dump().items()}); project.entity_metadata = normalize_entity_metadata("project", meta)
    db.commit(); return {"demo_at": meta.get("demo_at"), "presentation_at": meta.get("presentation_at")}


@router.put("/{project_id}/documentation-checklist")
def update_documentation_checklist(project_id: uuid.UUID, payload: DocumentationChecklistRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)):
    project = _project(db, project_id); meta = dict(project.entity_metadata or {}); meta["documentation_checklist"] = [item.model_dump() for item in payload.items]; project.entity_metadata = normalize_entity_metadata("project", meta)
    db.commit(); return {"items": meta["documentation_checklist"]}


@router.get("/{project_id}/focus-evidence")
def focus_evidence(project_id: uuid.UUID, db: Session = Depends(get_db)):
    project = _project(db, project_id); tasks = _project_tasks(db, project)
    rows = [row for row in _project_sessions(db, project, tasks) if row.action == "focus_session" and (row.meta or {}).get("status") == "completed"]
    return [{"session_id": str(row.id), "entity_id": str(row.entity_id) if row.entity_id else None, "actual_minutes": (row.meta or {}).get("actual_minutes", 0), "completed_at": (row.meta or {}).get("completed_at")} for row in rows]


def _draft(db: Session, project: Entity) -> PortfolioDraftRead:
    summary, bullets, evidence = portfolio_draft(project, _project_tasks(db, project), _project_sessions(db, project, _project_tasks(db, project)))
    return PortfolioDraftRead(summary=summary, resume_bullets=bullets, evidence=evidence)


@router.post("/{project_id}/portfolio-draft", response_model=PortfolioDraftRead)
def generate_portfolio_draft(project_id: uuid.UUID, db: Session = Depends(get_db)) -> PortfolioDraftRead:
    return _draft(db, _project(db, project_id))


@router.post("/{project_id}/portfolio-save", response_model=PortfolioDraftRead)
def save_portfolio_draft(project_id: uuid.UUID, payload: PortfolioSaveRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> PortfolioDraftRead:
    if not payload.confirmed: raise HTTPException(400, "Explicit review and confirmation are required before saving portfolio text.")
    project = _project(db, project_id); authoritative = _draft(db, project)
    if payload.summary != authoritative.summary or payload.resume_bullets != authoritative.resume_bullets or payload.evidence != authoritative.evidence:
        raise HTTPException(409, "Draft evidence changed; review the current grounded draft before saving.")
    meta = dict(project.entity_metadata or {}); meta["portfolio_summary"] = payload.summary; meta["resume_bullet_drafts"] = payload.resume_bullets; meta["portfolio_evidence"] = payload.evidence; project.entity_metadata = normalize_entity_metadata("project", meta)
    db.commit(); return authoritative
