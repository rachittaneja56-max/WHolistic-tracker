from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.services.provider import get_ai_provider
from app.agents.services.weekly_digest import get_default_weekly_range, get_weekly_digest
from app.agents.utils.exceptions import (
    AgentDisabledError,
    AgentProviderError,
    InvalidJSONError,
    MissingAPIKeyError,
    ModelResponseError,
    ProviderTimeoutError,
)
from app.db.session import get_db
from app.schemas.weekly import WeeklyDigestResponse

router = APIRouter(prefix="/digest", tags=["digest"])


@router.get("/weekly", response_model=WeeklyDigestResponse)
def get_weekly_digest_route(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> WeeklyDigestResponse:
    default_start_date, default_end_date = get_default_weekly_range()
    resolved_start_date = start_date or default_start_date
    resolved_end_date = end_date or default_end_date

    if resolved_start_date > resolved_end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be on or before end_date")

    try:
        provider = get_ai_provider(db)
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None

    try:
        return get_weekly_digest(
            db,
            start_date=resolved_start_date,
            end_date=resolved_end_date,
            provider=provider,
        )
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
