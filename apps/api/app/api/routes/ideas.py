from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agents.services.idea_validator import build_idea_entity_content, validate_idea
from app.agents.services.provider import get_ai_provider
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.api.activity import record_session
from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.idea import (
    IdeaApproveRequest,
    IdeaApproveResponse,
    IdeaProjectDraftRequest,
    IdeaProjectDraftResponse,
    IdeaValidationRequest,
    IdeaValidationResponse,
    SuggestedMvpMilestoneRead,
)
from app.services.embeddings import update_entity_embedding

router = APIRouter(prefix="/ideas", tags=["ideas"])


@router.post("/validate", response_model=IdeaValidationResponse)
def validate_idea_route(payload: IdeaValidationRequest, db: Session = Depends(get_db)) -> IdeaValidationResponse:
    try:
        provider = get_ai_provider(db)
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None

    try:
        return validate_idea(payload.idea, db=db, provider=provider)
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/approve", response_model=IdeaApproveResponse, status_code=status.HTTP_201_CREATED)
def approve_idea_route(payload: IdeaApproveRequest, db: Session = Depends(get_db)) -> IdeaApproveResponse:
    title = (payload.title or payload.validation.idea_summary or payload.idea).strip()
    entity = Entity(
        id=uuid.uuid4(),
        type="idea",
        parent_id=None,
        title=title[:240],
        content=build_idea_entity_content(payload.idea, payload.validation),
        content_type="markdown",
        tags=payload.tags,
        confidence_score=1.0,
        entity_metadata={
            "source": "idea_validator",
            "raw_idea": payload.idea.strip(),
            "validation": payload.validation.model_dump(mode="json"),
        },
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)

    try:
        entity = update_entity_embedding(entity.id, db=db)
    except Exception:
        pass

    return IdeaApproveResponse(entity=serialize_entity(entity))


@router.post("/project-draft", response_model=IdeaProjectDraftResponse, status_code=status.HTTP_201_CREATED)
def create_project_draft_route(
    payload: IdeaProjectDraftRequest,
    db: Session = Depends(get_db),
) -> IdeaProjectDraftResponse:
    """Create a reviewable hierarchy only after the user explicitly chooses this action."""
    title = (payload.title or payload.validation.idea_summary or payload.idea).strip()[:240]
    tags = list(dict.fromkeys([*payload.tags, "idea-to-project"]))
    idea = Entity(
        id=uuid.uuid4(),
        type="idea",
        parent_id=None,
        title=title,
        content=build_idea_entity_content(payload.idea, payload.validation),
        content_type="markdown",
        tags=tags,
        confidence_score=1.0,
        entity_metadata={
            "source": "idea_validator",
            "raw_idea": payload.idea.strip(),
            "validation": payload.validation.model_dump(mode="json"),
            "converted_to_project": True,
        },
    )
    project = Entity(
        id=uuid.uuid4(),
        type="project",
        parent_id=None,
        title=title,
        content=payload.idea.strip(),
        content_type="markdown",
        tags=tags,
        confidence_score=1.0,
        entity_metadata={
            "status": "planned",
            "priority": "medium",
            "objective": payload.validation.idea_summary.strip(),
            "success_metric": "Define a measurable success metric before starting delivery.",
            "source_idea_id": str(idea.id),
            "market_research": [item.model_dump(mode="json") for item in payload.validation.similar_products],
        },
    )
    db.add_all([idea, project])

    milestone_specs = payload.validation.suggested_mvp[:12] or []
    if not milestone_specs:
        milestone_specs = [SuggestedMvpMilestoneRead(milestone="Validate the MVP", tasks=["Define the first testable customer outcome"])]

    milestones: list[Entity] = []
    tasks: list[Entity] = []
    for index, spec in enumerate(milestone_specs):
        milestone = Entity(
            id=uuid.uuid4(),
            type="milestone",
            parent_id=project.id,
            title=spec.milestone.strip()[:240],
            content=spec.milestone.strip(),
            content_type="markdown",
            tags=tags,
            confidence_score=1.0,
            entity_metadata={"status": "planned", "priority": "medium", "outcome": spec.milestone.strip(), "sequence": index + 1},
        )
        milestones.append(milestone)
        for task_title in spec.tasks[:50]:
            cleaned_title = task_title.strip()
            if not cleaned_title:
                continue
            tasks.append(Entity(
                id=uuid.uuid4(),
                type="task",
                parent_id=milestone.id,
                title=cleaned_title[:240],
                content=None,
                content_type="markdown",
                tags=tags,
                confidence_score=1.0,
                entity_metadata={"status": "backlog", "priority": "medium", "ai_assist_level": "handwritten"},
            ))

    db.add_all([*milestones, *tasks])
    db.add(Link(
        id=uuid.uuid4(),
        from_id=project.id,
        to_id=idea.id,
        relation_type="implements",
        explanation="This project hierarchy was explicitly created from the approved idea validation.",
        status="confirmed",
    ))
    for entity in [idea, project, *milestones, *tasks]:
        record_session(db, entity_id=entity.id, action="created", meta={"entity_title": entity.title, "entity_type": entity.type, "source": "idea_validator"})
    db.commit()
    for entity in [idea, project, *milestones, *tasks]:
        db.refresh(entity)

    return IdeaProjectDraftResponse(
        idea=serialize_entity(idea),
        project=serialize_entity(project),
        milestones=[serialize_entity(item) for item in milestones],
        tasks=[serialize_entity(item) for item in tasks],
    )
