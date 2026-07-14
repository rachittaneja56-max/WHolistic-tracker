from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.api.routes.entities import serialize_entity
from app.api.routes.links import serialize_link
from app.api.routes.sessions import serialize_session
from app.db.session import get_db
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.session import ActivitySession
from app.schemas.comprehension import ComprehensionCheckRead
from app.schemas.project import ProjectTrackerItemRead, ProjectWorkspaceRead
from app.services.entity_visibility import active_entity_clause

router = APIRouter(prefix="/projects", tags=["projects"])
TERMINAL_STATUSES = {"done", "completed", "submitted", "cancelled", "archived"}
SHIPPING_ACTIONS = {"pr_merged", "deployed", "project_shipped"}
KNOWLEDGE_TYPES = {"til", "note", "concept", "canvas", "dsa_problem"}


def _status(entity: Entity, default: str) -> str:
    value = (entity.entity_metadata or {}).get("status", default)
    return value if isinstance(value, str) else default


def _parse_datetime(value: object, *, end_of_day: bool = False) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    try:
        if len(raw) == 10:
            parsed_date = date.fromisoformat(raw)
            return datetime.combine(parsed_date, time.max if end_of_day else time.min, tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _serialize_check(check: ComprehensionCheck, entity_by_id: dict[uuid.UUID, Entity]) -> ComprehensionCheckRead:
    return ComprehensionCheckRead(
        id=check.id,
        entity_id=check.entity_id,
        ai_assist_level=check.ai_assist_level,
        question=check.question,
        your_answer=check.your_answer,
        ai_grade=check.ai_grade,
        created_at=check.created_at,
        answered_at=check.answered_at,
        entity=serialize_entity(entity_by_id[check.entity_id]) if check.entity_id in entity_by_id else None,
    )


def build_project_summary(
    project: Entity,
    milestones: list[Entity],
    tasks: list[Entity],
    sessions: list[ActivitySession],
    til_task_ids: set[uuid.UUID],
    checks: list[ComprehensionCheck],
    *,
    now: datetime | None = None,
) -> ProjectTrackerItemRead:
    current_time = _as_utc(now) or datetime.now(timezone.utc)
    completed_tasks = [task for task in tasks if _status(task, "backlog") in TERMINAL_STATUSES]
    open_tasks = [task for task in tasks if task not in completed_tasks]
    blocked_tasks = [task for task in open_tasks if _status(task, "backlog") == "blocked"]
    overdue_tasks = [
        task
        for task in open_tasks
        if (deadline := _parse_datetime((task.entity_metadata or {}).get("due_at"), end_of_day=True)) is not None
        and deadline < current_time
    ]
    completed_milestones = [milestone for milestone in milestones if _status(milestone, "planned") in TERMINAL_STATUSES]

    if tasks:
        progress = round(len(completed_tasks) / len(tasks) * 100, 1)
    elif milestones:
        progress = round(len(completed_milestones) / len(milestones) * 100, 1)
    else:
        progress = 0.0

    deadline_values: list[tuple[datetime, str]] = []
    for entity, key in [*[ (task, "due_at") for task in open_tasks ], *[ (milestone, "target_at") for milestone in milestones if milestone not in completed_milestones ], (project, "target_at")]:
        raw = (entity.entity_metadata or {}).get(key)
        parsed = _parse_datetime(raw, end_of_day=True)
        if parsed is not None and isinstance(raw, str):
            deadline_values.append((parsed, raw))
    next_deadline = min(deadline_values, key=lambda item: item[0])[1] if deadline_values else None

    current_milestones = [milestone for milestone in milestones if milestone not in completed_milestones]
    current_milestones.sort(
        key=lambda milestone: (
            0 if _status(milestone, "planned") in {"active", "in_progress"} else 1,
            _parse_datetime((milestone.entity_metadata or {}).get("target_at"), end_of_day=True)
            or datetime.max.replace(tzinfo=timezone.utc),
            (milestone.title or "").lower(),
        )
    )
    current_milestone = current_milestones[0] if current_milestones else None

    activity_dates = [_as_utc(row.date) for row in sessions if row.date is not None]
    entity_dates = [_as_utc(entity.created_at) for entity in [project, *milestones, *tasks] if entity.created_at is not None]
    last_activity = max([value for value in [*activity_dates, *entity_dates] if value is not None], default=None)
    shipped_this_week = sum(
        row.action in SHIPPING_ACTIONS and (_as_utc(row.date) or datetime.min.replace(tzinfo=timezone.utc)) >= current_time - timedelta(days=7)
        for row in sessions
    )
    captured_completed_tasks = sum(task.id in til_task_ids for task in completed_tasks)
    til_coverage = round(captured_completed_tasks / len(completed_tasks) * 100, 1) if completed_tasks else 0.0
    comprehension_debt = sum(check.answered_at is None or check.ai_grade == "flagged" for check in checks)

    metadata = project.entity_metadata or {}
    project_status = _status(project, "active")
    override = metadata.get("health_override")
    reasons: list[str] = []
    if override in {"on_track", "at_risk", "stalled", "paused", "completed"}:
        health = override
        reasons.append("Health was set manually for this project.")
    elif project_status in {"done", "completed", "archived"}:
        health = "completed"
        reasons.append("Project is marked complete.")
    elif project_status == "paused":
        health = "paused"
        reasons.append("Project is paused.")
    elif open_tasks and last_activity is not None and last_activity < current_time - timedelta(days=14):
        health = "stalled"
        reasons.append(f"No tracked activity for {(current_time - last_activity).days} days.")
    elif overdue_tasks or blocked_tasks:
        health = "at_risk"
        if overdue_tasks:
            reasons.append(f"{len(overdue_tasks)} overdue task{'s' if len(overdue_tasks) != 1 else ''}.")
        if blocked_tasks:
            reasons.append(f"{len(blocked_tasks)} blocked task{'s' if len(blocked_tasks) != 1 else ''}.")
    else:
        target = _parse_datetime(metadata.get("target_at"), end_of_day=True)
        if target is not None and target <= current_time + timedelta(days=7) and progress < 70:
            health = "at_risk"
            reasons.append("Target date is within seven days and less than 70% of work is complete.")
        else:
            health = "on_track"
            reasons.append("No overdue, blocked, or stale work was detected.")

    return ProjectTrackerItemRead(
        project=serialize_entity(project),
        milestone_count=len(milestones),
        completed_milestone_count=len(completed_milestones),
        task_count=len(tasks),
        open_task_count=len(open_tasks),
        completed_task_count=len(completed_tasks),
        blocked_task_count=len(blocked_tasks),
        overdue_task_count=len(overdue_tasks),
        progress_percent=progress,
        health=health,
        health_reasons=reasons,
        next_deadline=next_deadline,
        current_milestone=serialize_entity(current_milestone) if current_milestone else None,
        last_activity_at=last_activity,
        shipped_this_week=shipped_this_week,
        til_coverage_percent=til_coverage,
        comprehension_debt_count=comprehension_debt,
    )


def _load_entities(db: Session) -> tuple[list[Entity], list[Entity], list[Entity]]:
    projects = list(db.scalars(select(Entity).where(Entity.type == "project").where(active_entity_clause()).order_by(Entity.created_at.desc())).all())
    project_ids = [project.id for project in projects]
    milestones = list(db.scalars(select(Entity).where(Entity.type == "milestone").where(Entity.parent_id.in_(project_ids)).where(active_entity_clause())).all()) if project_ids else []
    milestone_ids = [milestone.id for milestone in milestones]
    task_parent_ids = [*project_ids, *milestone_ids]
    tasks = list(db.scalars(select(Entity).where(Entity.type == "task").where(Entity.parent_id.in_(task_parent_ids)).where(active_entity_clause())).all()) if task_parent_ids else []
    return projects, milestones, tasks


def _til_task_ids(tils: list[Entity], links: list[Link], task_ids: set[uuid.UUID], entity_by_id: dict[uuid.UUID, Entity]) -> set[uuid.UUID]:
    captured: set[uuid.UUID] = set()
    for til in tils:
        raw = (til.entity_metadata or {}).get("source_task_id")
        try:
            task_id = uuid.UUID(str(raw))
        except (ValueError, TypeError, AttributeError):
            continue
        if task_id in task_ids:
            captured.add(task_id)
    for link in links:
        if link.status != "confirmed" or link.from_id is None or link.to_id is None:
            continue
        if link.from_id in task_ids and entity_by_id.get(link.to_id, None) and entity_by_id[link.to_id].type == "til":
            captured.add(link.from_id)
        if link.to_id in task_ids and entity_by_id.get(link.from_id, None) and entity_by_id[link.from_id].type == "til":
            captured.add(link.to_id)
    return captured


@router.get("/tracker", response_model=list[ProjectTrackerItemRead])
def get_project_tracker(db: Session = Depends(get_db)) -> list[ProjectTrackerItemRead]:
    projects, milestones, tasks = _load_entities(db)
    tracked_ids = {entity.id for entity in [*projects, *milestones, *tasks]}
    task_ids = {task.id for task in tasks}
    sessions = list(db.scalars(select(ActivitySession).where(ActivitySession.entity_id.in_(tracked_ids))).all()) if tracked_ids else []
    links = list(db.scalars(select(Link).where(or_(Link.from_id.in_(tracked_ids), Link.to_id.in_(tracked_ids)))).all()) if tracked_ids else []
    tils = list(db.scalars(select(Entity).where(Entity.type == "til").where(active_entity_clause())).all()) if task_ids else []
    checks = list(db.scalars(select(ComprehensionCheck).where(ComprehensionCheck.entity_id.in_(task_ids))).all()) if task_ids else []
    entity_by_id = {entity.id: entity for entity in [*projects, *milestones, *tasks, *tils]}
    captured = _til_task_ids(tils, links, task_ids, entity_by_id)

    rows: list[ProjectTrackerItemRead] = []
    for project in projects:
        project_milestones = [milestone for milestone in milestones if milestone.parent_id == project.id]
        milestone_ids = {milestone.id for milestone in project_milestones}
        project_tasks = [task for task in tasks if task.parent_id == project.id or task.parent_id in milestone_ids]
        project_ids = {project.id, *milestone_ids, *[task.id for task in project_tasks]}
        rows.append(build_project_summary(
            project,
            project_milestones,
            project_tasks,
            [row for row in sessions if row.entity_id in project_ids],
            captured,
            [check for check in checks if check.entity_id in {task.id for task in project_tasks}],
        ))
    health_order = {"stalled": 0, "at_risk": 1, "on_track": 2, "paused": 3, "completed": 4}
    rows.sort(key=lambda row: (health_order[row.health], -row.open_task_count, (row.project.title or "").lower()))
    return rows


@router.get("/{project_id}/tracker", response_model=ProjectWorkspaceRead)
def get_project_workspace(project_id: uuid.UUID, db: Session = Depends(get_db)) -> ProjectWorkspaceRead:
    project = db.scalar(select(Entity).where(Entity.id == project_id).where(active_entity_clause()))
    if project is None or project.type != "project":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    milestones = list(db.scalars(select(Entity).where(Entity.type == "milestone").where(Entity.parent_id == project.id).where(active_entity_clause())).all())
    milestone_ids = {milestone.id for milestone in milestones}
    task_parent_ids = {project.id, *milestone_ids}
    tasks = list(db.scalars(select(Entity).where(Entity.type == "task").where(Entity.parent_id.in_(task_parent_ids)).where(active_entity_clause())).all())
    task_ids = {task.id for task in tasks}
    tracked_ids = {project.id, *milestone_ids, *task_ids}
    sessions = list(db.scalars(select(ActivitySession).where(ActivitySession.entity_id.in_(tracked_ids)).order_by(ActivitySession.date.desc()).limit(500)).all())
    links = list(db.scalars(select(Link).options(joinedload(Link.from_entity), joinedload(Link.to_entity)).where(or_(Link.from_id.in_(tracked_ids), Link.to_id.in_(tracked_ids))).order_by(Link.created_at.desc())).all())
    checks = list(db.scalars(select(ComprehensionCheck).where(ComprehensionCheck.entity_id.in_(task_ids)).order_by(ComprehensionCheck.created_at.desc())).all()) if task_ids else []
    all_tils = list(db.scalars(select(Entity).where(Entity.type == "til").where(active_entity_clause())).all())
    entity_by_id = {entity.id: entity for entity in [project, *milestones, *tasks, *all_tils]}
    captured = _til_task_ids(all_tils, links, task_ids, entity_by_id)

    knowledge_by_id: dict[uuid.UUID, Entity] = {}
    for til in all_tils:
        raw = (til.entity_metadata or {}).get("source_task_id")
        if raw and str(raw) in {str(task_id) for task_id in task_ids}:
            knowledge_by_id[til.id] = til
    relationships: list[Link] = []
    for link in links:
        relationships.append(link)
        counterpart_id = link.to_id if link.from_id in tracked_ids else link.from_id
        counterpart = link.to_entity if link.from_id in tracked_ids else link.from_entity
        if counterpart_id not in tracked_ids and counterpart is not None and counterpart.type in KNOWLEDGE_TYPES:
            knowledge_by_id[counterpart.id] = counterpart

    summary = build_project_summary(project, milestones, tasks, sessions, captured, checks)
    return ProjectWorkspaceRead(
        summary=summary,
        milestones=[serialize_entity(item) for item in milestones],
        tasks=[serialize_entity(item) for item in tasks],
        relationships=[serialize_link(item) for item in relationships],
        activity=[serialize_session(item) for item in sessions],
        knowledge=[
            serialize_entity(item)
            for item in sorted(
                knowledge_by_id.values(),
                key=lambda entity: _as_utc(entity.created_at) or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            )
        ],
        comprehension_checks=[_serialize_check(item, entity_by_id) for item in checks],
    )
