from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.agents.schemas.common import AgentStatusRead, AgentTestJsonRequest, AgentTestJsonResponse
from app.agents.services.provider import get_ai_provider, get_agent_status_snapshot
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.agents.utils.prompts import read_prompt_file

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
    except AgentDisabledError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except MissingAPIKeyError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except InvalidJSONError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ModelResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except AgentProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return AgentTestJsonResponse(provider=provider.provider_name, model=provider.fast_model, output=output)
