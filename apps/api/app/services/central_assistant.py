from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.agents.services.provider import OpenAIProvider
from app.agents.services.recall import get_due_recall_items, grade_recall_answer
from app.agents.utils.prompts import build_system_prompt
from app.api.activity import record_session
from app.api.routes.entities import serialize_entity
from app.models.assistant import AssistantMessage, AssistantProposal, AssistantThread
from app.models.entity import Entity
from app.schemas.assistant import (
    AssistantExecutionRead,
    AssistantMessageRead,
    AssistantRecallRead,
    AssistantThreadDetailRead,
    AssistantThreadRead,
    AssistantTurnRead,
)
from app.schemas.entity import normalize_entity_metadata

logger = logging.getLogger(__name__)
ALLOWED_ACTIONS = {"create_entity", "update_entity", "log_shipping"}
ALLOWED_ENTITY_TYPES = {"dsa_problem", "note", "til", "project", "milestone", "task"}
ALLOWED_CONTENT_TYPES = {"markdown", "blocks", "code"}
PROPOSAL_TTL = timedelta(minutes=30)

EXTRACTION_SCHEMA = {
    "title": "central_assistant_extraction",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "intent": {"type": "string", "enum": ["capture_dsa", "capture_note", "update_project", "log_shipping", "run_recall", "query_graph", "show_guidance", "unknown"]},
        "requested_count": {"type": "integer", "minimum": 0, "maximum": 25},
        "names": {"type": "array", "items": {"type": "string", "maxLength": 300}, "maxItems": 25},
        "urls": {"type": "array", "items": {"type": "string", "maxLength": 500}, "maxItems": 25},
        "project_name": {"type": ["string", "null"], "maxLength": 300},
        "context_types": {"type": "array", "items": {"type": "string", "enum": ["dsa_problem", "note", "til", "project", "milestone", "task", "subject_topic", "recent_activity", "recall_due"]}, "maxItems": 8},
        "needs_context": {"type": "boolean"},
    },
    "required": ["intent", "requested_count", "names", "urls", "project_name", "context_types", "needs_context"],
}

ACTION_PROPERTIES = {
    "id": {"type": "string", "minLength": 1, "maxLength": 80},
    "action_type": {"type": "string", "enum": sorted(ALLOWED_ACTIONS)},
    "entity_type": {"type": ["string", "null"], "enum": [*sorted(ALLOWED_ENTITY_TYPES), None]},
    "target_id": {"type": ["string", "null"], "maxLength": 80},
    "parent_id": {"type": ["string", "null"], "maxLength": 80},
    "title": {"type": ["string", "null"], "maxLength": 300},
    "content": {"type": ["string", "null"], "maxLength": 12000},
    "content_type": {"type": ["string", "null"], "enum": ["markdown", "blocks", "code", None]},
    "tags": {"type": "array", "items": {"type": "string", "maxLength": 80}, "maxItems": 50},
    "difficulty": {"type": ["string", "null"], "enum": ["easy", "medium", "hard", None]},
    "status": {"type": ["string", "null"], "maxLength": 40},
    "url": {"type": ["string", "null"], "maxLength": 500},
    "solution_code": {"type": ["string", "null"], "maxLength": 12000},
    "summary": {"type": "string", "minLength": 1, "maxLength": 400},
}
PLANNING_SCHEMA = {
    "title": "central_assistant_plan",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "assistant_text": {"type": "string", "minLength": 1, "maxLength": 2400},
        "questions": {"type": "array", "items": {"type": "string", "maxLength": 400}, "maxItems": 8},
        "actions": {
            "type": "array",
            "maxItems": 25,
            "items": {"type": "object", "additionalProperties": False, "properties": ACTION_PROPERTIES, "required": list(ACTION_PROPERTIES)},
        },
    },
    "required": ["assistant_text", "questions", "actions"],
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_thread(thread: AssistantThread) -> AssistantThreadRead:
    return AssistantThreadRead.model_validate(thread, from_attributes=True)


def serialize_message(message: AssistantMessage) -> AssistantMessageRead:
    return AssistantMessageRead.model_validate(message, from_attributes=True)


def create_thread(db: Session, title: str = "New conversation") -> AssistantThread:
    thread = AssistantThread(id=uuid4(), title=title[:120], updated_at=_now())
    db.add(thread)
    db.flush()
    return thread


def list_threads(db: Session) -> list[AssistantThreadRead]:
    rows = db.scalars(select(AssistantThread).where(AssistantThread.archived_at.is_(None)).order_by(AssistantThread.updated_at.desc()).limit(50)).all()
    return [serialize_thread(row) for row in rows]


def thread_detail(db: Session, thread_id: UUID) -> AssistantThreadDetailRead:
    thread = db.get(AssistantThread, thread_id)
    if thread is None or thread.archived_at is not None:
        raise HTTPException(status_code=404, detail="Assistant thread not found")
    messages = db.scalars(select(AssistantMessage).where(AssistantMessage.thread_id == thread_id).order_by(AssistantMessage.created_at, AssistantMessage.id).limit(200)).all()
    proposals = db.scalars(select(AssistantProposal).where(AssistantProposal.thread_id == thread_id)).all()
    proposal_by_message = {item.source_message_id: item for item in proposals}
    serialized_messages = []
    for item in messages:
        serialized = serialize_message(item)
        proposal = proposal_by_message.get(item.id)
        if proposal:
            serialized.payload = serialized.payload.model_copy(update={"proposal_status": proposal.status})
        serialized_messages.append(serialized)
    return AssistantThreadDetailRead(thread=serialize_thread(thread), messages=serialized_messages)


def archive_thread(db: Session, thread_id: UUID) -> None:
    thread = db.get(AssistantThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Assistant thread not found")
    thread.archived_at = _now()
    thread.updated_at = _now()
    db.commit()


def _history(db: Session, thread_id: UUID) -> list[dict[str, str]]:
    rows = db.scalars(select(AssistantMessage).where(AssistantMessage.thread_id == thread_id).order_by(AssistantMessage.created_at.desc()).limit(10)).all()
    return [{"role": item.role, "content": item.content[:2000]} for item in reversed(rows)]


def _model_json(provider: OpenAIProvider, *, stage: str, messages: list[dict[str, str]], schema: dict[str, Any], model: str) -> dict[str, object]:
    started = time.perf_counter()
    try:
        result = provider.generate_json(messages=messages, json_schema=schema, temperature=0.1, max_tokens=1800, model=model)
        logger.info(
            "central_assistant_model stage=%s model=%s status=success latency_ms=%d prompt_tokens=%s completion_tokens=%s total_tokens=%s",
            stage,
            model,
            int((time.perf_counter() - started) * 1000),
            provider.last_usage.get("prompt_tokens"),
            provider.last_usage.get("completion_tokens"),
            provider.last_usage.get("total_tokens"),
        )
        return result
    except Exception:
        logger.exception("central_assistant_model stage=%s model=%s status=failed latency_ms=%d", stage, model, int((time.perf_counter() - started) * 1000))
        raise


def extract_intent(provider: OpenAIProvider, history: list[dict[str, str]]) -> dict[str, object]:
    messages = [{"role": "system", "content": build_system_prompt("central_assistant_extract.md")}, *history]
    for attempt in range(2):
        try:
            return _model_json(provider, stage="extract", messages=messages, schema=EXTRACTION_SCHEMA, model=provider.fast_model)
        except Exception:
            if attempt == 1:
                return _model_json(provider, stage="extract_fallback", messages=messages, schema=EXTRACTION_SCHEMA, model=provider.smart_model)
    raise RuntimeError("Intent extraction failed")


def _candidate_query(extraction: dict[str, object]):
    query = select(Entity)
    context_types = [str(item) for item in extraction.get("context_types", [])]
    names = [str(item).strip() for item in extraction.get("names", []) if str(item).strip()]
    project_name = str(extraction.get("project_name") or "").strip()
    if context_types:
        query = query.where(Entity.type.in_(context_types))
    terms = [*names, project_name]
    clauses = [Entity.title.ilike(f"%{term[:120]}%") for term in terms if term]
    if clauses:
        query = query.where(or_(*clauses))
    return query.order_by(Entity.created_at.desc()).limit(30)


def resolve_context(db: Session, extraction: dict[str, object]) -> tuple[list[dict[str, Any]], set[str]]:
    entities = db.scalars(_candidate_query(extraction)).all()
    if not entities and extraction.get("needs_context"):
        entities = db.scalars(select(Entity).order_by(Entity.created_at.desc()).limit(20)).all()
    context = []
    allowed_ids: set[str] = set()
    for entity in entities:
        allowed_ids.add(str(entity.id))
        context.append({
            "id": str(entity.id),
            "type": entity.type,
            "title": entity.title,
            "content": (entity.content or "")[:1200],
            "tags": entity.tags or [],
            "metadata": entity.entity_metadata or {},
        })
    return context, allowed_ids


def _snapshot(entity: Entity) -> str:
    payload = json.dumps({
        "title": entity.title,
        "content": entity.content,
        "tags": entity.tags or [],
        "metadata": entity.entity_metadata or {},
        "parent_id": str(entity.parent_id) if entity.parent_id else None,
    }, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def sanitize_actions(db: Session, raw_actions: object, allowed_ids: set[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if not isinstance(raw_actions, list):
        return results
    for raw in raw_actions[:25]:
        if not isinstance(raw, dict) or raw.get("action_type") not in ALLOWED_ACTIONS:
            continue
        action_type = str(raw["action_type"])
        target_id = str(raw.get("target_id") or "") or None
        parent_id = str(raw.get("parent_id") or "") or None
        if target_id and target_id not in allowed_ids:
            continue
        if parent_id and parent_id not in allowed_ids:
            continue
        entity_type = raw.get("entity_type")
        if entity_type is not None and entity_type not in ALLOWED_ENTITY_TYPES:
            continue
        if action_type == "create_entity" and (not entity_type or not str(raw.get("title") or "").strip()):
            continue
        if action_type in {"update_entity", "log_shipping"} and not target_id:
            continue
        target = db.get(Entity, UUID(target_id)) if target_id else None
        if action_type == "log_shipping" and (target is None or target.type != "project"):
            continue
        if action_type == "update_entity" and target is None:
            continue
        tags = list(dict.fromkeys(str(item).strip()[:80] for item in raw.get("tags", []) if str(item).strip()))[:50]
        results.append({
            "id": str(raw.get("id") or uuid4()),
            "action_type": action_type,
            "entity_type": entity_type,
            "target_id": target_id,
            "parent_id": parent_id,
            "title": str(raw.get("title") or "").strip()[:300] or None,
            "content": str(raw.get("content") or "")[:12000] or None,
            "content_type": raw.get("content_type") if raw.get("content_type") in ALLOWED_CONTENT_TYPES else "markdown",
            "tags": tags,
            "difficulty": raw.get("difficulty") if raw.get("difficulty") in {"easy", "medium", "hard"} else None,
            "status": str(raw.get("status") or "").strip()[:40] or None,
            "url": str(raw.get("url") or "").strip()[:500] or None,
            "solution_code": str(raw.get("solution_code") or "")[:12000] or None,
            "summary": str(raw.get("summary") or "Proposed change").strip()[:400],
            "_snapshot": _snapshot(target) if target else None,
        })
    return results


def _recall_payload(db: Session) -> tuple[str, dict[str, Any]]:
    due = get_due_recall_items(db, limit=8)
    items = [{
        "entity": serialize_entity(item.entity).model_dump(mode="json"),
        "due_score": item.due_score,
        "due_reasons": item.due_reasons,
    } for item in due]
    text = "Choose an item and explain it from memory. I’ll grade your answer without revealing the source note." if items else "Nothing is due for recall right now."
    return text, {"kind": "recall_due", "items": items}


def _resolve_page_context(db: Session, current_path: str, page_context: dict[str, Any] | None) -> dict[str, Any]:
    route = current_path if current_path.startswith("/") else "/"
    supplied = dict(page_context or {})
    supplied_route = str(supplied.get("route") or "").strip()
    if supplied_route.startswith("/"):
        route = supplied_route[:500]
    resolved: dict[str, Any] = {"route": route}
    raw_entity_id = supplied.get("entity_id")
    if raw_entity_id:
        try:
            entity = db.get(Entity, UUID(str(raw_entity_id)))
        except (TypeError, ValueError):
            entity = None
        if entity is not None:
            resolved.update({"entity_id": str(entity.id), "entity_type": entity.type, "entity_title": entity.title})
    return resolved


def run_turn(db: Session, provider: OpenAIProvider, *, thread_id: UUID | None, message: str, current_path: str, page_context: dict[str, Any] | None = None) -> AssistantTurnRead:
    thread = db.get(AssistantThread, thread_id) if thread_id else None
    if thread is None:
        thread = create_thread(db, message.strip()[:80] or "New conversation")
    elif thread.title == "New conversation":
        thread.title = message.strip()[:80] or thread.title
    resolved_page_context = _resolve_page_context(db, current_path, page_context)
    user_message = AssistantMessage(id=uuid4(), thread_id=thread.id, role="user", content=message.strip(), model_stage=None, payload={"current_path": current_path, "page_context": resolved_page_context})
    db.add(user_message)
    thread.updated_at = _now()
    db.flush()
    history = _history(db, thread.id)
    extraction = extract_intent(provider, history)

    if extraction.get("intent") == "run_recall":
        assistant_text, payload = _recall_payload(db)
        assistant_message = AssistantMessage(id=uuid4(), thread_id=thread.id, role="assistant", content=assistant_text, model_stage="deterministic", payload=payload)
        db.add(assistant_message)
        db.commit()
        db.refresh(thread); db.refresh(user_message); db.refresh(assistant_message)
        return AssistantTurnRead(thread=serialize_thread(thread), user_message=serialize_message(user_message), assistant_message=serialize_message(assistant_message))

    requested = int(extraction.get("requested_count") or 0)
    identified = len(extraction.get("names", [])) + len(extraction.get("urls", []))
    if extraction.get("intent") == "capture_dsa" and requested > identified:
        missing = requested - identified
        assistant_text = f"I still need {missing} problem name{'s' if missing != 1 else ''} or LeetCode link{'s' if missing != 1 else ''}. Send one per line; I won’t create placeholders."
        assistant_message = AssistantMessage(id=uuid4(), thread_id=thread.id, role="assistant", content=assistant_text, model_stage="deterministic", payload={"kind": "questions", "questions": [assistant_text], "extraction": extraction})
        db.add(assistant_message); db.commit()
        db.refresh(thread); db.refresh(user_message); db.refresh(assistant_message)
        return AssistantTurnRead(thread=serialize_thread(thread), user_message=serialize_message(user_message), assistant_message=serialize_message(assistant_message))

    context, allowed_ids = resolve_context(db, extraction)
    planning_input = json.dumps({"latest_message": message, "page_context": resolved_page_context, "extraction": extraction, "resolved_context": context, "allowed_actions": sorted(ALLOWED_ACTIONS)}, ensure_ascii=True)
    plan = _model_json(provider, stage="plan", messages=[
        {"role": "system", "content": build_system_prompt("central_assistant_plan.md")},
        {"role": "user", "content": planning_input},
    ], schema=PLANNING_SCHEMA, model=provider.smart_model)
    actions = sanitize_actions(db, plan.get("actions"), allowed_ids)
    questions = [str(item).strip()[:400] for item in plan.get("questions", []) if str(item).strip()][:8]
    assistant_text = str(plan.get("assistant_text") or "Tell me a little more about what you want to capture.").strip()[:2400]
    payload: dict[str, Any] = {"kind": "proposal" if actions else "questions" if questions else "answer", "questions": questions, "actions": actions}
    assistant_message = AssistantMessage(id=uuid4(), thread_id=thread.id, role="assistant", content=assistant_text, model_stage="smart", payload=payload)
    db.add(assistant_message); db.flush()
    proposal = None
    if actions:
        proposal = AssistantProposal(id=uuid4(), thread_id=thread.id, source_message_id=assistant_message.id, status="pending", actions=actions, result={}, expires_at=_now() + PROPOSAL_TTL)
        db.add(proposal)
        payload["proposal_id"] = str(proposal.id)
        assistant_message.payload = payload
    db.commit()
    db.refresh(thread); db.refresh(user_message); db.refresh(assistant_message)
    return AssistantTurnRead(thread=serialize_thread(thread), user_message=serialize_message(user_message), assistant_message=serialize_message(assistant_message), proposal_id=proposal.id if proposal else None)


def update_proposal(db: Session, proposal_id: UUID, actions: list[dict[str, Any]]) -> AssistantProposal:
    proposal = db.get(AssistantProposal, proposal_id)
    if proposal is None or proposal.status != "pending" or proposal.expires_at <= _now():
        raise HTTPException(status_code=409, detail="Proposal is unavailable or expired")
    allowed_ids = {str(item) for item in db.scalars(select(Entity.id)).all()}
    sanitized = sanitize_actions(db, actions, allowed_ids)
    if not sanitized:
        raise HTTPException(status_code=400, detail="Proposal contains no valid actions")
    proposal.actions = sanitized
    db.commit(); db.refresh(proposal)
    return proposal


def cancel_proposal(db: Session, proposal_id: UUID) -> None:
    proposal = db.get(AssistantProposal, proposal_id)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status == "pending":
        proposal.status = "cancelled"
        db.commit()


def _execution_message(db: Session, proposal: AssistantProposal) -> AssistantMessage | None:
    messages = db.scalars(
        select(AssistantMessage)
        .where(AssistantMessage.thread_id == proposal.thread_id)
        .order_by(AssistantMessage.created_at.desc())
        .limit(100)
    ).all()
    return next(
        (
            message
            for message in messages
            if (message.payload or {}).get("kind") == "execution_result"
            and str((message.payload or {}).get("proposal_id")) == str(proposal.id)
        ),
        None,
    )


def execute_proposal(db: Session, proposal_id: UUID, *, execution_key: str, action_ids: list[str] | None) -> AssistantExecutionRead:
    existing = db.scalar(select(AssistantProposal).where(AssistantProposal.execution_key == execution_key))
    if existing is not None and existing.status == "executed":
        message = _execution_message(db, existing)
        return AssistantExecutionRead(
            proposal_id=existing.id,
            status="executed",
            results=list((existing.result or {}).get("results") or []),
            message=serialize_message(message) if message else None,
        )
    proposal = db.scalar(select(AssistantProposal).where(AssistantProposal.id == proposal_id).with_for_update())
    if proposal is None or proposal.status != "pending" or proposal.expires_at <= _now():
        raise HTTPException(status_code=409, detail="Proposal is unavailable or expired")
    selected = [item for item in proposal.actions if action_ids is None or item.get("id") in action_ids]
    if not selected:
        raise HTTPException(status_code=400, detail="Select at least one action")
    results: list[dict[str, Any]] = []
    for action in selected:
        action_type = action["action_type"]
        if action_type == "create_entity":
            duplicate = db.scalar(select(Entity).where(Entity.type == action["entity_type"], func.lower(Entity.title) == action["title"].lower()))
            if duplicate is not None:
                raise HTTPException(status_code=409, detail=f"{action['title']} already exists; refresh the proposal")
            metadata = {key: action[key] for key in ("difficulty", "status") if action.get(key)}
            if action.get("solution_code"):
                metadata["solution_code"] = action["solution_code"]
            if action.get("url"):
                metadata["source_url"] = action["url"]
            metadata = normalize_entity_metadata(action["entity_type"], metadata)
            entity = Entity(id=uuid4(), type=action["entity_type"], parent_id=UUID(action["parent_id"]) if action.get("parent_id") else None, title=action["title"], content=action.get("content") or "", content_type=action.get("content_type") or "markdown", tags=action.get("tags") or [], confidence_score=1.0, entity_metadata=metadata)
            db.add(entity); db.flush()
            record_session(db, entity_id=entity.id, action="assistant_created", meta={"proposal_id": str(proposal.id), "entity_type": entity.type, "entity_title": entity.title})
            results.append({"action_id": action["id"], "entity_id": str(entity.id), "title": entity.title, "status": "created"})
        elif action_type == "update_entity":
            entity = db.get(Entity, UUID(action["target_id"]))
            if entity is None or _snapshot(entity) != action.get("_snapshot"):
                raise HTTPException(status_code=409, detail=f"{action['summary']} is stale; refresh the proposal")
            if action.get("title"): entity.title = action["title"]
            if action.get("content") is not None: entity.content = action["content"]
            if action.get("tags"): entity.tags = action["tags"]
            metadata = dict(entity.entity_metadata or {})
            for key in ("difficulty", "status"):
                if action.get(key): metadata[key] = action[key]
            if action.get("solution_code"): metadata["solution_code"] = action["solution_code"]
            entity.entity_metadata = normalize_entity_metadata(entity.type, metadata)
            record_session(db, entity_id=entity.id, action="assistant_updated", meta={"proposal_id": str(proposal.id), "entity_type": entity.type, "entity_title": entity.title})
            results.append({"action_id": action["id"], "entity_id": str(entity.id), "title": entity.title, "status": "updated"})
        elif action_type == "log_shipping":
            project = db.get(Entity, UUID(action["target_id"]))
            if project is None or project.type != "project" or _snapshot(project) != action.get("_snapshot"):
                raise HTTPException(status_code=409, detail="The matched project changed; refresh the proposal")
            record_session(db, entity_id=project.id, action="project_shipped", meta={"proposal_id": str(proposal.id), "summary": action.get("content") or action.get("summary"), "project_title": project.title})
            results.append({"action_id": action["id"], "entity_id": str(project.id), "title": project.title, "status": "logged"})
    proposal.status = "executed"; proposal.execution_key = execution_key; proposal.executed_at = _now(); proposal.result = {"results": results}
    result_message = AssistantMessage(
        id=uuid4(),
        thread_id=proposal.thread_id,
        role="assistant",
        content=f"Applied {len(results)} change{'s' if len(results) != 1 else ''}.",
        model_stage="deterministic",
        payload={
            "kind": "execution_result",
            "proposal_id": str(proposal.id),
            "source_message_id": str(proposal.source_message_id),
            "results": results,
        },
    )
    db.add(result_message)
    thread = db.get(AssistantThread, proposal.thread_id)
    if thread is not None:
        thread.updated_at = _now()
    record_session(db, entity_id=None, action="assistant_proposal_executed", meta={"proposal_id": str(proposal.id), "thread_id": str(proposal.thread_id), "action_count": len(results)})
    db.commit()
    db.refresh(result_message)
    return AssistantExecutionRead(proposal_id=proposal.id, status="executed", results=results, message=serialize_message(result_message))


def run_recall(
    db: Session,
    provider: OpenAIProvider | None,
    *,
    entity_id: UUID,
    answer: str,
    self_score: int | None,
    thread_id: UUID | None = None,
    source_message_id: UUID | None = None,
) -> AssistantRecallRead:
    grade = grade_recall_answer(entity_id, answer=answer, self_score=self_score, db=db, provider=provider)
    thread = db.get(AssistantThread, thread_id) if thread_id else None
    entity = db.get(Entity, entity_id)
    if thread is None:
        thread = create_thread(db, f"Recall: {entity.title if entity else 'review'}")
        db.flush()
    message = AssistantMessage(
        id=uuid4(),
        thread_id=thread.id,
        role="assistant",
        content=f"Recall scored {grade.recalled_score}/5. {grade.feedback}",
        model_stage="deterministic",
        payload={
            "kind": "recall_result",
            "source_message_id": str(source_message_id) if source_message_id else None,
            "grade": grade.model_dump(mode="json"),
        },
    )
    db.add(message)
    thread.updated_at = _now()
    db.commit()
    db.refresh(message)
    return AssistantRecallRead(grade=grade, message=serialize_message(message))
