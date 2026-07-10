from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.services.provider import get_ai_provider
from app.agents.services.recall import get_due_recall_items, grade_recall_answer
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.schemas.recall import RecallDueEntityRead, RecallGradeRequest, RecallGradeResponse

router = APIRouter(prefix="/recall", tags=["recall"])


@router.get("/due", response_model=list[RecallDueEntityRead])
def get_due_recall_entities(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[RecallDueEntityRead]:
    due_items = get_due_recall_items(db, limit=limit)
    return [
        RecallDueEntityRead(
            entity=serialize_entity(item.entity),
            due_score=item.due_score,
            due_reasons=item.due_reasons,
            days_since_review=item.days_since_review,
            days_until_exam=item.days_until_exam,
        )
        for item in due_items
    ]


@router.post("/{entity_id}/grade", response_model=RecallGradeResponse)
def grade_recall_entity(
    entity_id: uuid.UUID,
    payload: RecallGradeRequest,
    db: Session = Depends(get_db),
) -> RecallGradeResponse:
    try:
        provider = get_ai_provider()
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None

    try:
        return grade_recall_answer(
            entity_id,
            answer=payload.answer,
            self_score=payload.self_score,
            db=db,
            provider=provider,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if detail == "Entity not found" else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
