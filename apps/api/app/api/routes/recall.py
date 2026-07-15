from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.services.provider import get_ai_provider
from app.agents.services.recall import get_due_recall_items, grade_recall_answer, preview_recall_answer
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.api.routes.entities import serialize_entity
from app.db.session import get_db
from app.schemas.recall import RecallDueEntityRead, RecallGradeApplyRequest, RecallGradePreviewResponse, RecallGradeRequest, RecallGradeResponse
from app.services.auth import require_owner_mutation

router = APIRouter(prefix="/recall", tags=["recall"])


def _optional_provider(db: Session):
    try:
        return get_ai_provider(db)
    except (AgentDisabledError, MissingAPIKeyError):
        return None


def _preview(
    entity_id: uuid.UUID,
    payload: RecallGradeRequest,
    db: Session,
) -> RecallGradePreviewResponse:
    try:
        return preview_recall_answer(
            entity_id,
            answer=payload.answer,
            self_score=payload.self_score,
            db=db,
            provider=_optional_provider(db),
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if detail == "Entity not found" else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=detail) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


def _apply(
    entity_id: uuid.UUID,
    *,
    answer: str,
    confirmed_score: int | None,
    db: Session,
) -> RecallGradeResponse:
    try:
        return grade_recall_answer(
            entity_id,
            answer=answer,
            self_score=confirmed_score,
            db=db,
            # Apply is deterministic and cannot fail because a provider changed
            # state after the user reviewed the advisory preview.
            provider=None,
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if detail == "Entity not found" else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=detail) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/due", response_model=list[RecallDueEntityRead])
def get_due_recall_entities(
    limit: int = Query(default=20, ge=1, le=100),
    tag: str | None = Query(default=None, min_length=1, max_length=100),
    db: Session = Depends(get_db),
) -> list[RecallDueEntityRead]:
    due_items = get_due_recall_items(db, limit=limit, tag=tag)
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


@router.post("/{entity_id}/grade/preview", response_model=RecallGradePreviewResponse)
def preview_recall_entity(
    entity_id: uuid.UUID,
    payload: RecallGradeRequest,
    db: Session = Depends(get_db),
) -> RecallGradePreviewResponse:
    return _preview(entity_id, payload, db)


@router.post("/{entity_id}/grade/apply", response_model=RecallGradeResponse)
def apply_recall_entity(
    entity_id: uuid.UUID,
    payload: RecallGradeApplyRequest,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> RecallGradeResponse:
    return _apply(
        entity_id,
        answer=payload.answer,
        confirmed_score=payload.confirmed_score,
        db=db,
    )


@router.post("/{entity_id}/grade", response_model=RecallGradeResponse)
def grade_recall_entity(
    entity_id: uuid.UUID,
    payload: RecallGradeRequest,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> RecallGradeResponse:
    return _apply(
        entity_id,
        answer=payload.answer,
        confirmed_score=payload.self_score,
        db=db,
    )
