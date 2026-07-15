from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.services.comprehension import answer_comprehension_check, generate_comprehension_check, list_comprehension_checks, preview_comprehension_answer
from app.agents.services.provider import get_ai_provider
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.db.session import get_db
from app.services.auth import require_owner_mutation
from app.schemas.comprehension import (
    ComprehensionCheckAnswerRequest,
    ComprehensionCheckAnswerPreviewResponse,
    ComprehensionCheckAnswerResponse,
    ComprehensionCheckApplyRequest,
    ComprehensionCheckGenerateRequest,
    ComprehensionCheckGenerateResponse,
    ComprehensionCheckRead,
)

router = APIRouter(prefix="/comprehension-checks", tags=["comprehension-checks"])


def _optional_provider(db: Session):
    try:
        return get_ai_provider(db)
    except (AgentDisabledError, MissingAPIKeyError):
        return None


def _preview_answer(
    check_id: uuid.UUID,
    payload: ComprehensionCheckAnswerRequest,
    db: Session,
) -> ComprehensionCheckAnswerPreviewResponse:
    try:
        return preview_comprehension_answer(
            check_id,
            your_answer=payload.your_answer,
            self_grade=payload.self_grade,
            db=db,
            provider=_optional_provider(db),
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=detail) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


def _apply_answer(
    check_id: uuid.UUID,
    *,
    your_answer: str,
    confirmed_grade: str | None,
    db: Session,
) -> ComprehensionCheckAnswerResponse:
    try:
        return answer_comprehension_check(
            check_id,
            your_answer=your_answer,
            self_grade=confirmed_grade,
            db=db,
            # The provider is used only by preview. Durable apply is based on
            # the explicit user grade and remains available during outages.
            provider=None,
        )
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=detail) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("", response_model=list[ComprehensionCheckRead])
def list_comprehension_checks_route(
    status_filter: str = Query(default="pending", alias="status"),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[ComprehensionCheckRead]:
    if status_filter not in {"pending", "answered", "all"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status must be pending, answered, or all")
    return list_comprehension_checks(db, status_filter=status_filter, limit=limit)


@router.post("/generate", response_model=ComprehensionCheckGenerateResponse)
def generate_comprehension_check_route(
    payload: ComprehensionCheckGenerateRequest,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> ComprehensionCheckGenerateResponse:
    provider = _optional_provider(db)

    try:
        return generate_comprehension_check(
            payload.task_entity_id,
            diff_or_summary=payload.diff_or_summary,
            db=db,
            provider=provider,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in detail.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/{check_id}/answer/preview", response_model=ComprehensionCheckAnswerPreviewResponse)
def preview_comprehension_check_answer(
    check_id: uuid.UUID,
    payload: ComprehensionCheckAnswerRequest,
    db: Session = Depends(get_db),
) -> ComprehensionCheckAnswerPreviewResponse:
    return _preview_answer(check_id, payload, db)


@router.post("/{check_id}/answer/apply", response_model=ComprehensionCheckAnswerResponse)
def apply_comprehension_check_answer(
    check_id: uuid.UUID,
    payload: ComprehensionCheckApplyRequest,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> ComprehensionCheckAnswerResponse:
    return _apply_answer(
        check_id,
        your_answer=payload.your_answer,
        confirmed_grade=payload.confirmed_grade,
        db=db,
    )


@router.post("/{check_id}/answer", response_model=ComprehensionCheckAnswerResponse)
def answer_comprehension_check_route(
    check_id: uuid.UUID,
    payload: ComprehensionCheckAnswerRequest,
    db: Session = Depends(get_db),
    _owner: str = Depends(require_owner_mutation),
) -> ComprehensionCheckAnswerResponse:
    return _apply_answer(
        check_id,
        your_answer=payload.your_answer,
        confirmed_grade=payload.self_grade,
        db=db,
    )
