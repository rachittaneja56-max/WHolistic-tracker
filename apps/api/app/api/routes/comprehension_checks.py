from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.services.comprehension import answer_comprehension_check, generate_comprehension_check, list_comprehension_checks
from app.agents.services.provider import get_ai_provider
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.db.session import get_db
from app.schemas.comprehension import (
    ComprehensionCheckAnswerRequest,
    ComprehensionCheckAnswerResponse,
    ComprehensionCheckGenerateRequest,
    ComprehensionCheckGenerateResponse,
    ComprehensionCheckRead,
)

router = APIRouter(prefix="/comprehension-checks", tags=["comprehension-checks"])


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
) -> ComprehensionCheckGenerateResponse:
    try:
        provider = get_ai_provider()
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None

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


@router.post("/{check_id}/answer", response_model=ComprehensionCheckAnswerResponse)
def answer_comprehension_check_route(
    check_id: uuid.UUID,
    payload: ComprehensionCheckAnswerRequest,
    db: Session = Depends(get_db),
) -> ComprehensionCheckAnswerResponse:
    try:
        provider = get_ai_provider()
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None

    try:
        return answer_comprehension_check(
            check_id,
            your_answer=payload.your_answer,
            self_grade=payload.self_grade,
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
