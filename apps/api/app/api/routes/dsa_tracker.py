from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Text, case, cast, func, or_, select
from sqlalchemy.orm import Session

from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.schemas.dsa_extension import DsaProblemPageRead, DsaProblemStatsRead
from app.services.auth import require_authenticated_owner
from app.services.entity_visibility import active_entity_clause

router = APIRouter(prefix="/integrations/dsa", tags=["dsa-tracker"])


@router.get("/problems", response_model=DsaProblemPageRead)
def list_dsa_problems(
    search: str | None = Query(default=None, max_length=200),
    platform: str | None = Query(default=None, max_length=40),
    difficulty: str | None = Query(default=None, max_length=40),
    problem_status: str | None = Query(default=None, alias="status", max_length=40),
    tag: str | None = Query(default=None, max_length=80),
    sort: str = Query(default="updated_desc", pattern=r"^(updated_desc|updated_asc|title_asc|difficulty_asc)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _owner: str = Depends(require_authenticated_owner),
) -> DsaProblemPageRead:
    filters = [Entity.type == "dsa_problem", active_entity_clause()]
    if search:
        filters.append(Entity.title.ilike(f"%{search.strip()}%"))
    if platform:
        filters.append(Entity.entity_metadata["integration"]["platform"].astext == platform)
    if difficulty:
        filters.append(Entity.entity_metadata["difficulty"].astext == difficulty)
    if problem_status:
        filters.append(Entity.entity_metadata["status"].astext == problem_status)
    if tag:
        filters.append(Entity.tags.any(tag))

    source_updated = func.coalesce(
        Entity.entity_metadata["integration"]["last_submitted_at"].astext,
        Entity.entity_metadata["integration"]["source_updated_at"].astext,
        cast(Entity.created_at, Text),
    )
    order = {
        "updated_desc": source_updated.desc(),
        "updated_asc": source_updated.asc(),
        "title_asc": Entity.title.asc(),
        "difficulty_asc": case(
            (Entity.entity_metadata["difficulty"].astext == "easy", 1),
            (Entity.entity_metadata["difficulty"].astext == "medium", 2),
            (Entity.entity_metadata["difficulty"].astext == "hard", 3),
            else_=4,
        ).asc(),
    }[sort]
    total = db.scalar(select(func.count()).select_from(Entity).where(*filters)) or 0
    items = db.scalars(select(Entity).where(*filters).order_by(order, Entity.id).offset(offset).limit(limit)).all()

    all_filters = [Entity.type == "dsa_problem", active_entity_clause()]
    solved = db.scalar(select(func.count()).select_from(Entity).where(
        *all_filters,
        or_(
            Entity.entity_metadata["integration"]["accepted"].as_boolean().is_(True),
            Entity.entity_metadata["status"].astext == "solved",
        ),
    )) or 0
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    this_week = db.scalar(select(func.count()).select_from(Entity).where(*all_filters, Entity.created_at >= week_ago)) or 0
    review_due = db.scalar(select(func.count()).select_from(Entity).where(*all_filters, Entity.entity_metadata["status"].astext == "review")) or 0
    platforms = db.scalar(select(func.count(func.distinct(Entity.entity_metadata["integration"]["platform"].astext))).where(*all_filters)) or 0
    return DsaProblemPageRead(
        items=[serialize_entity(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
        stats=DsaProblemStatsRead(solved=solved, this_week=this_week, review_due=review_due, platforms=platforms),
    )
