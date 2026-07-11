from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.agents.services.provider import get_ai_provider
from app.agents.services.rag_chat import run_graph_chat
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.db.session import get_db
from app.schemas.chat import GraphChatRequest, GraphChatResponse
from app.services.auth import require_owner_mutation

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/graph", response_model=GraphChatResponse)
def graph_chat(payload: GraphChatRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> GraphChatResponse:
    try:
        provider = get_ai_provider(db)
        return run_graph_chat(payload.question, db=db, provider=provider)
    except TypeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (AgentDisabledError, MissingAPIKeyError) as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
