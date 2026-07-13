from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.agents.services.provider import get_ai_provider
from app.agents.utils.exceptions import AgentDisabledError, AgentProviderError, InvalidJSONError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.db.session import get_db
from app.schemas.assistant import (
    AssistantExecuteRequest,
    AssistantExecutionRead,
    AssistantProposalUpdate,
    AssistantRecallRead,
    AssistantRecallRequest,
    AssistantThreadDetailRead,
    AssistantThreadRead,
    AssistantTurnRead,
    AssistantTurnRequest,
)
from app.services.auth import require_authenticated_owner, require_owner_mutation
from app.services.central_assistant import (
    archive_thread,
    cancel_proposal,
    create_thread,
    execute_proposal,
    list_threads,
    run_recall,
    run_turn,
    thread_detail,
    update_proposal,
)

router = APIRouter(prefix="/assistant", tags=["central-assistant"])


@router.get("/threads", response_model=list[AssistantThreadRead])
def get_threads(db: Session = Depends(get_db), _owner: str = Depends(require_authenticated_owner)) -> list[AssistantThreadRead]:
    return list_threads(db)


@router.post("/threads", response_model=AssistantThreadRead, status_code=status.HTTP_201_CREATED)
def new_thread(db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> AssistantThreadRead:
    thread = create_thread(db)
    db.commit(); db.refresh(thread)
    return AssistantThreadRead.model_validate(thread, from_attributes=True)


@router.get("/threads/{thread_id}", response_model=AssistantThreadDetailRead)
def get_thread(thread_id: UUID, db: Session = Depends(get_db), _owner: str = Depends(require_authenticated_owner)) -> AssistantThreadDetailRead:
    return thread_detail(db, thread_id)


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(thread_id: UUID, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> Response:
    archive_thread(db, thread_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/turns", response_model=AssistantTurnRead)
def assistant_turn(payload: AssistantTurnRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> AssistantTurnRead:
    try:
        provider = get_ai_provider(db)
        return run_turn(
            db,
            provider,
            thread_id=payload.thread_id,
            message=payload.message,
            current_path=payload.current_path,
            page_context=payload.page_context.model_dump(mode="json") if payload.page_context else None,
        )
    except (AgentDisabledError, MissingAPIKeyError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=502, detail="The assistant could not prepare a safe response. Your message was not applied.") from exc


@router.patch("/proposals/{proposal_id}")
def edit_proposal(proposal_id: UUID, payload: AssistantProposalUpdate, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> dict:
    proposal = update_proposal(db, proposal_id, payload.actions)
    return {"proposal_id": str(proposal.id), "actions": proposal.actions, "status": proposal.status}


@router.post("/proposals/{proposal_id}/execute", response_model=AssistantExecutionRead)
def confirm_proposal(proposal_id: UUID, payload: AssistantExecuteRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> AssistantExecutionRead:
    return execute_proposal(db, proposal_id, execution_key=payload.idempotency_key, action_ids=payload.action_ids)


@router.delete("/proposals/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_proposal(proposal_id: UUID, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> Response:
    cancel_proposal(db, proposal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/recall/grade", response_model=AssistantRecallRead)
def assistant_recall(payload: AssistantRecallRequest, db: Session = Depends(get_db), _owner: str = Depends(require_owner_mutation)) -> AssistantRecallRead:
    try:
        provider = get_ai_provider(db)
    except (AgentDisabledError, MissingAPIKeyError):
        provider = None
    try:
        return run_recall(
            db,
            provider,
            entity_id=payload.entity_id,
            answer=payload.answer,
            self_score=payload.self_score,
            thread_id=payload.thread_id,
            source_message_id=payload.source_message_id,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderTimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except (InvalidJSONError, ModelResponseError, AgentProviderError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
