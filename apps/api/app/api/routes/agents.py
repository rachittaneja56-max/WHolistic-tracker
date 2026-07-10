from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.agents.schemas.common import (
    AgentStatusRead,
    AgentTestJsonRequest,
    AgentTestJsonResponse,
    DeepConnectionsRunResponseRead,
    DuplicateDetectorResponseRead,
)
from app.agents.services.daily_guidance import get_daily_guidance
from app.agents.services.deep_connections import run_deep_connection_agent
from app.agents.services.duplicate_detector import run_duplicate_detector
from app.agents.services.provider import get_ai_provider, get_agent_status_snapshot
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.agents.utils.prompts import read_prompt_file
from app.db.session import get_db
from app.schemas.guidance import DailyGuidanceResponse

router = APIRouter(prefix="/agents", tags=["agents"])

TEST_JSON_SCHEMA = {
    "title": "agent_test_json_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "status": {"type": "string", "enum": ["ok", "no_result"]},
        "summary": {"type": "string", "minLength": 1, "maxLength": 280},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "reason": {"type": "string", "minLength": 1, "maxLength": 280},
    },
    "required": ["status", "summary", "confidence", "reason"],
}


@router.get("/status", response_model=AgentStatusRead)
def get_agent_status() -> AgentStatusRead:
    return get_agent_status_snapshot()


@router.get("/daily-guidance", response_model=DailyGuidanceResponse)
def get_daily_guidance_route(db: Session = Depends(get_db)) -> DailyGuidanceResponse:
    try:
        provider = get_ai_provider()
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None

    try:
        return get_daily_guidance(db, provider=provider)
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/test-json", response_model=AgentTestJsonResponse)
def test_agent_json(payload: AgentTestJsonRequest) -> AgentTestJsonResponse:
    try:
        provider = get_ai_provider()
        system_rules = read_prompt_file("system_rules.md")
        output = provider.generate_json(
            messages=[
                {"role": "system", "content": system_rules},
                {
                    "role": "user",
                    "content": (
                        "Return a valid JSON object that matches the requested schema. "
                        "This is only a structured-output connectivity test for the personal knowledge graph backend.\n\n"
                        f"Prompt: {payload.prompt}"
                    ),
                },
            ],
            json_schema=TEST_JSON_SCHEMA,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
    except (AgentDisabledError, MissingAPIKeyError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return AgentTestJsonResponse(provider=provider.provider_name, model=provider.fast_model, output=output)


@router.post("/duplicate-detector/entities/{entity_id}", response_model=DuplicateDetectorResponseRead)
def run_duplicate_detector_route(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> DuplicateDetectorResponseRead:
    try:
        provider = get_ai_provider()
        return run_duplicate_detector(entity_id, db=db, provider=provider)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except (AgentDisabledError, MissingAPIKeyError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/deep-connections/run-once", response_model=DeepConnectionsRunResponseRead)
def run_deep_connections_route(
    batch_limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
) -> DeepConnectionsRunResponseRead:
    try:
        provider = get_ai_provider()
        return run_deep_connection_agent(db=db, batch_limit=batch_limit, provider=provider)
    except (AgentDisabledError, MissingAPIKeyError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
