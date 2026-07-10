from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.activity import record_session
from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.capture import CliCaptureRequest, CliCaptureResponse
from app.schemas.entity import normalize_entity_metadata
from app.services.embeddings import update_entity_embedding
from app.services.github import match_project_for_repo
from app.core.config import settings

router = APIRouter(prefix="/capture", tags=["capture"])
TITLE_WHITESPACE = re.compile(r"\s+")


@router.post("/cli", response_model=CliCaptureResponse, status_code=status.HTTP_201_CREATED)
def capture_from_cli(
    payload: CliCaptureRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> CliCaptureResponse:
    require_cli_token(authorization)

    content = payload.text.strip()
    project = resolve_project(db, project_name=payload.project, repo_url=payload.repo_url)
    title = build_cli_title(content)
    metadata = normalize_entity_metadata(
        payload.type,
        {
            "source": "cli_capture",
            "project": payload.project,
            "repo_url": payload.repo_url,
        },
    )

    entity = Entity(
        id=uuid.uuid4(),
        type=payload.type,
        parent_id=None,
        title=title,
        content=content,
        content_type="markdown",
        tags=payload.tags,
        confidence_score=1.0,
        entity_metadata=metadata,
    )
    db.add(entity)
    record_session(
        db,
        entity_id=entity.id,
        action="created",
        meta={
            "entity_title": entity.title,
            "entity_type": entity.type,
            "source": "cli_capture",
        },
    )

    link_created = False
    if project is not None:
        link = Link(
            id=uuid.uuid4(),
            from_id=project.id,
            to_id=entity.id,
            relation_type="used_in",
            explanation="Captured from the CLI with project context.",
            status="confirmed",
        )
        db.add(link)
        record_session(
            db,
            entity_id=project.id,
            action="linked",
            meta={
                "entity_title": project.title,
                "entity_type": project.type,
                "linked_entity_id": str(entity.id),
                "linked_entity_title": entity.title,
                "linked_entity_type": entity.type,
                "relation_type": "used_in",
                "link_status": "confirmed",
                "source": "cli_capture",
            },
        )
        link_created = True

    db.commit()
    db.refresh(entity)

    try:
        entity = update_entity_embedding(entity.id, db=db)
    except Exception:
        pass

    return CliCaptureResponse(
        entity=serialize_entity(entity),
        linked_project_id=str(project.id) if project is not None else None,
        link_created=link_created,
    )



def require_cli_token(authorization: str | None) -> None:
    configured = (settings.cli_capture_token or "").strip()
    if not configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="CLI capture is disabled. Configure CLI_CAPTURE_TOKEN first.")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")

    provided = authorization.split(" ", 1)[1].strip()
    if provided != configured:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid CLI capture token")



def build_cli_title(text: str) -> str:
    first_line = text.splitlines()[0] if text.splitlines() else text
    normalized = TITLE_WHITESPACE.sub(" ", first_line).strip()
    if len(normalized) <= 80:
        return normalized
    return normalized[:77].rstrip() + "..."



def resolve_project(db: Session, *, project_name: str | None, repo_url: str | None) -> Entity | None:
    if repo_url and repo_url.strip():
        matched = match_project_for_repo(db, repo_url.strip(), None)
        if matched.entity_id is not None:
            return db.get(Entity, matched.entity_id)

    if project_name and project_name.strip():
        normalized = project_name.strip().lower()
        project = db.scalars(
            select(Entity)
            .where(Entity.type == "project")
            .where(func.lower(Entity.title) == normalized)
            .limit(1)
        ).first()
        if project is not None:
            return project

    return None
