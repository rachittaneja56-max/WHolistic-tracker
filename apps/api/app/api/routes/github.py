from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.services.pr_to_til import draft_til_from_pr_session
from app.agents.services.provider import get_ai_provider
from app.agents.utils.exceptions import AgentProviderError
from app.api.activity import record_session
from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.github import GithubApproveTilRequest, GithubApproveTilResponse, GithubFeedItemRead, GithubTilDraftRead
from app.services.embeddings import update_entity_embedding
from app.services.github import (
    build_github_feed_message,
    build_github_feed_title,
    build_github_feed_url,
    ensure_github_integration_enabled,
    get_session_or_404,
    is_github_pr_merge_session,
    list_github_feed_sessions,
    sanitize_tags,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/github", tags=["github"])


@router.get("/feed", response_model=list[GithubFeedItemRead])
def get_github_feed(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[GithubFeedItemRead]:
    ensure_github_integration_enabled()
    sessions = list_github_feed_sessions(db, limit=limit)

    feed: list[GithubFeedItemRead] = []
    for session_row in sessions:
        meta = session_row.meta or {}
        approved_til_entity_id = _parse_uuid(meta.get("approved_til_entity_id"))
        feed.append(
            GithubFeedItemRead(
                id=session_row.id,
                entity_id=session_row.entity_id,
                action=session_row.action or "unknown",
                date=session_row.date,
                repo_full_name=_get_string(meta, "repo_full_name"),
                repo_html_url=_get_string(meta, "repo_html_url"),
                title=build_github_feed_title(session_row),
                message=build_github_feed_message(session_row),
                github_url=build_github_feed_url(session_row),
                project_id=session_row.entity_id,
                project_title=_get_string(meta, "project_title"),
                pr_number=_get_int(meta, "pr_number"),
                commit_count=_get_int(meta, "commit_count"),
                sender_login=_get_string(meta, "sender_login") or _get_string(meta, "pusher"),
                meta=meta,
                draft_available=session_row.action == "pr_merged" and approved_til_entity_id is None,
                approved_til_entity_id=approved_til_entity_id,
                approved_til_title=_get_string(meta, "approved_til_title"),
            )
        )

    return feed


@router.post("/sessions/{session_id}/draft-til", response_model=GithubTilDraftRead)
def create_github_til_draft(session_id: uuid.UUID, db: Session = Depends(get_db)) -> GithubTilDraftRead:
    ensure_github_integration_enabled()
    session_row = get_session_or_404(db, session_id)
    if not is_github_pr_merge_session(session_row):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only merged pull request sessions can generate a TIL draft")

    meta = dict(session_row.meta or {})
    if meta.get("approved_til_entity_id"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A TIL has already been approved for this merged PR session")

    provider = None
    try:
        provider = get_ai_provider()
    except AgentProviderError:
        provider = None

    try:
        draft, used_ai = draft_til_from_pr_session(session_row, provider=provider)
    except AgentProviderError:
        draft, used_ai = draft_til_from_pr_session(session_row, provider=None)

    meta["github_til_draft"] = draft
    meta["github_til_draft_used_ai"] = used_ai
    session_row.meta = meta
    db.commit()
    db.refresh(session_row)

    return GithubTilDraftRead(
        session_id=session_row.id,
        title=draft["title"],
        content=draft["content"],
        tags=draft["tags"],
        used_ai=used_ai,
        meta={
            "repo_full_name": meta.get("repo_full_name"),
            "pr_number": meta.get("pr_number"),
            "pr_html_url": meta.get("pr_html_url"),
        },
    )


@router.post("/sessions/{session_id}/approve-til", response_model=GithubApproveTilResponse, status_code=status.HTTP_201_CREATED)
def approve_github_til(
    session_id: uuid.UUID,
    payload: GithubApproveTilRequest,
    db: Session = Depends(get_db),
) -> GithubApproveTilResponse:
    ensure_github_integration_enabled()
    session_row = get_session_or_404(db, session_id)
    if not is_github_pr_merge_session(session_row):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only merged pull request sessions can create a TIL")

    meta = dict(session_row.meta or {})
    existing_til_id = _parse_uuid(meta.get("approved_til_entity_id"))
    if existing_til_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A TIL has already been approved for this merged PR session")

    tags = sanitize_tags(payload.tags)
    entity = Entity(
        id=uuid.uuid4(),
        type="til",
        parent_id=None,
        title=payload.title.strip(),
        content=payload.content.strip(),
        content_type="markdown",
        tags=tags,
        confidence_score=1.0,
        entity_metadata={
            "source": "github_pr",
            "github_session_id": str(session_row.id),
            "repo_full_name": meta.get("repo_full_name"),
            "repo_html_url": meta.get("repo_html_url"),
            "pr_number": meta.get("pr_number"),
            "pr_html_url": meta.get("pr_html_url"),
        },
    )
    db.add(entity)

    project_entity = db.get(Entity, session_row.entity_id) if session_row.entity_id is not None else None
    link_id = None
    if project_entity is not None:
        link = Link(
            id=uuid.uuid4(),
            from_id=project_entity.id,
            to_id=entity.id,
            relation_type="used_in",
            explanation=_build_project_link_explanation(meta),
            status="confirmed",
        )
        db.add(link)
        link_id = link.id
        record_session(
            db,
            entity_id=project_entity.id,
            action="linked",
            meta={
                "entity_title": project_entity.title,
                "entity_type": project_entity.type,
                "linked_entity_id": str(entity.id),
                "linked_entity_title": entity.title,
                "linked_entity_type": entity.type,
                "relation_type": "used_in",
                "link_status": "confirmed",
                "source": "github_pr_approval",
            },
        )

    record_session(
        db,
        entity_id=entity.id,
        action="created",
        meta={
            "entity_title": entity.title,
            "entity_type": entity.type,
            "source": "github_pr_approval",
            "source_session_id": str(session_row.id),
        },
    )

    meta["approved_til_entity_id"] = str(entity.id)
    meta["approved_til_title"] = entity.title
    session_row.meta = meta

    db.commit()
    db.refresh(entity)
    db.refresh(session_row)

    try:
        entity = update_entity_embedding(entity.id, db=db)
    except Exception:
        logger.exception("Unable to refresh embedding for GitHub-approved TIL %s", entity.id)

    return GithubApproveTilResponse(
        entity=serialize_entity(entity),
        link_id=link_id,
        source_session_id=session_row.id,
    )


def _build_project_link_explanation(meta: dict[str, object]) -> str:
    pr_number = meta.get("pr_number")
    repo_full_name = meta.get("repo_full_name")
    if isinstance(pr_number, int) and isinstance(repo_full_name, str) and repo_full_name.strip():
        return f"Learning captured from merged PR #{pr_number} in {repo_full_name.strip()}."
    if isinstance(repo_full_name, str) and repo_full_name.strip():
        return f"Learning captured from merged GitHub work in {repo_full_name.strip()}."
    return "Learning captured from merged GitHub work tied to this project."


def _get_string(meta: dict[str, object], key: str) -> str | None:
    value = meta.get(key)
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _get_int(meta: dict[str, object], key: str) -> int | None:
    value = meta.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _parse_uuid(value: object) -> uuid.UUID | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None
