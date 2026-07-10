from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agents.services.idea_validator import build_idea_entity_content, validate_idea
from app.agents.services.provider import get_ai_provider
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.models.entity import Entity
from app.schemas.idea import IdeaApproveRequest, IdeaApproveResponse, IdeaValidationRequest, IdeaValidationResponse
from app.services.embeddings import update_entity_embedding

router = APIRouter(prefix="/ideas", tags=["ideas"])


@router.post("/validate", response_model=IdeaValidationResponse)
def validate_idea_route(payload: IdeaValidationRequest, db: Session = Depends(get_db)) -> IdeaValidationResponse:
    try:
        provider = get_ai_provider()
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
