from __future__ import annotations

from datetime import datetime, timezone
import json
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.prompts import build_system_prompt
from app.api.activity import record_session
from app.api.routes.entities import serialize_entity
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.comprehension import ComprehensionCheckAnswerResponse, ComprehensionCheckGenerateResponse, ComprehensionCheckRead
from app.schemas.entity import AI_ASSIST_LEVEL_VALUES, validate_ai_assist_level

COMPREHENSION_GENERATOR_SCHEMA = {
    "title": "comprehension_question_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "question": {"type": "string", "minLength": 1, "maxLength": 280},
        "expected_answer": {"type": "string", "minLength": 1, "maxLength": 500},
        "why_this_matters": {"type": "string", "minLength": 1, "maxLength": 240},
    },
    "required": ["question", "expected_answer", "why_this_matters"],
}
COMPREHENSION_GRADER_SCHEMA = {
    "title": "comprehension_grader_result",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "ai_grade": {"type": "string", "enum": ["passed", "flagged"]},
        "feedback": {"type": "string", "minLength": 1, "maxLength": 360},
        "follow_up": {"type": "string", "minLength": 1, "maxLength": 220},
    },
    "required": ["ai_grade", "feedback", "follow_up"],
}
FALLBACK_GENERATOR = {
    "question": "Why was this task needed, and what tradeoff or implementation choice did it force you to think through?",
    "expected_answer": "A grounded explanation of the reason for the change, the approach taken, and one specific tradeoff.",
    "why_this_matters": "It checks whether you understood the reasoning behind the work, not just the visible output.",
}
FALLBACK_GRADE_FEEDBACK = {
    "passed": "This answer shows enough understanding to keep moving, even without AI grading.",
    "flagged": "This answer still feels thin. Revisit the task context and make the reasoning more concrete.",
}
FALLBACK_GRADE_FOLLOW_UP = {
    "passed": "Write one sentence about the tradeoff you would repeat next time.",
    "flagged": "Explain one concrete reason the chosen approach was better than the obvious alternative.",
}



def list_comprehension_checks(db: Session, *, status_filter: str = "pending", limit: int = 100) -> list[ComprehensionCheckRead]:
    query = select(ComprehensionCheck).options(joinedload(ComprehensionCheck.entity)).order_by(ComprehensionCheck.created_at.desc()).limit(limit)
    if status_filter == "pending":
        query = query.where(ComprehensionCheck.answered_at.is_(None))
    elif status_filter == "answered":
        query = query.where(ComprehensionCheck.answered_at.is_not(None))

    checks = db.scalars(query).all()
    feedback_map = load_feedback_map(db)
    return [serialize_comprehension_check(check, feedback_map.get(str(check.id))) for check in checks]



def generate_comprehension_check(
    task_entity_id: uuid.UUID,
    *,
    diff_or_summary: str | None,
    db: Session,
    provider: OpenAIProvider | None,
) -> ComprehensionCheckGenerateResponse:
    task = db.get(Entity, task_entity_id)
    if task is None:
        raise ValueError("Task entity not found")
    if task.type != "task":
        raise TypeError("Comprehension checks can only be generated for task entities")

    ai_assist_level = validate_ai_assist_level((task.entity_metadata or {}).get("ai_assist_level") or "handwritten")
    if ai_assist_level == "handwritten":
        return ComprehensionCheckGenerateResponse(
            status="not_required",
            task_entity_id=task.id,
            ai_assist_level=ai_assist_level,
            message="This task is marked as handwritten, so no comprehension check is required.",
        )

    payload = FALLBACK_GENERATOR
    used_fallback = provider is None
    if provider is not None:
        payload = provider.generate_json(
            messages=[
                {"role": "system", "content": build_system_prompt("comprehension_question_generator.md")},
                {
                    "role": "user",
                    "content": json.dumps(
                        build_task_context(task, diff_or_summary),
                        ensure_ascii=True,
                        sort_keys=True,
                    ),
                },
            ],
            json_schema=COMPREHENSION_GENERATOR_SCHEMA,
            temperature=0.1,
            max_tokens=700,
            model=provider.smart_model,
        )
        used_fallback = False

    check = ComprehensionCheck(
        id=uuid.uuid4(),
        entity_id=task.id,
        ai_assist_level=ai_assist_level,
        question=str(payload.get("question", FALLBACK_GENERATOR["question"])).strip()[:280],
        your_answer="",
        ai_grade=None,
    )
    db.add(check)
    record_session(
        db,
        entity_id=task.id,
        action="created",
        meta={
            "source": "comprehension_check",
            "check_id": str(check.id),
            "ai_assist_level": ai_assist_level,
            "expected_answer": str(payload.get("expected_answer", FALLBACK_GENERATOR["expected_answer"])).strip()[:500],
            "why_this_matters": str(payload.get("why_this_matters", FALLBACK_GENERATOR["why_this_matters"])).strip()[:240],
        },
    )
    db.commit()
    db.refresh(check)

    return ComprehensionCheckGenerateResponse(
        status="generated",
        check_id=check.id,
        task_entity_id=task.id,
        ai_assist_level=ai_assist_level,
        question=check.question,
        expected_answer=str(payload.get("expected_answer", FALLBACK_GENERATOR["expected_answer"])).strip()[:500],
        why_this_matters=str(payload.get("why_this_matters", FALLBACK_GENERATOR["why_this_matters"])).strip()[:240],
        used_fallback=used_fallback,
    )



def answer_comprehension_check(
    check_id: uuid.UUID,
    *,
    your_answer: str,
    self_grade: str | None,
    db: Session,
    provider: OpenAIProvider | None,
) -> ComprehensionCheckAnswerResponse:
    check = db.get(ComprehensionCheck, check_id)
    if check is None:
        raise ValueError("Comprehension check not found")

    cleaned_answer = your_answer.strip()
    if not cleaned_answer:
        raise TypeError("Answer is required")

    task = db.get(Entity, check.entity_id) if check.entity_id is not None else None
    if task is None:
        raise ValueError("Task entity not found")

    used_fallback = provider is None
    if provider is None:
        if self_grade not in {"passed", "flagged"}:
            raise TypeError("self_grade is required when AI grading is unavailable")
        grade = self_grade
        feedback = FALLBACK_GRADE_FEEDBACK[grade]
        follow_up = FALLBACK_GRADE_FOLLOW_UP[grade]
    else:
        payload = provider.generate_json(
            messages=[
                {"role": "system", "content": build_system_prompt("comprehension_grader.md")},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            **build_task_context(task, None),
                            "question": check.question,
                            "answer": cleaned_answer,
                        },
                        ensure_ascii=True,
                        sort_keys=True,
                    ),
                },
            ],
            json_schema=COMPREHENSION_GRADER_SCHEMA,
            temperature=0.1,
            max_tokens=700,
            model=provider.smart_model,
        )
        grade = str(payload.get("ai_grade", "flagged"))
        feedback = str(payload.get("feedback", FALLBACK_GRADE_FEEDBACK["flagged"])).strip()[:360]
        follow_up = str(payload.get("follow_up", FALLBACK_GRADE_FOLLOW_UP["flagged"])).strip()[:220]
        used_fallback = False

    answered_at = datetime.now(timezone.utc)
    check.your_answer = cleaned_answer
    check.ai_grade = grade
    check.answered_at = answered_at

    if grade == "flagged":
        task.confidence_score = max(0.1, (task.confidence_score or 1.0) - 0.15)
        record_session(
            db,
            entity_id=task.id,
            action="revisited",
            meta={
                "source": "comprehension_check",
                "check_id": str(check.id),
                "ai_grade": grade,
                "feedback": feedback,
                "follow_up": follow_up,
            },
        )
    else:
        record_session(
            db,
            entity_id=task.id,
            action="revisited",
            meta={
                "source": "comprehension_check",
                "check_id": str(check.id),
                "ai_grade": grade,
                "feedback": feedback,
                "follow_up": follow_up,
            },
        )

    db.commit()
    db.refresh(check)
    db.refresh(task)

    return ComprehensionCheckAnswerResponse(
        check_id=check.id,
        entity_id=check.entity_id,
        ai_grade=grade,
        feedback=feedback,
        follow_up=follow_up,
        answered_at=answered_at,
        used_fallback=used_fallback,
        updated_confidence_score=task.confidence_score or 1.0,
    )



def build_task_context(task: Entity, diff_or_summary: str | None) -> dict[str, object]:
    return {
        "task_id": str(task.id),
        "title": task.title,
        "content": (task.content or "").strip()[:4000],
        "tags": task.tags or [],
        "metadata": task.entity_metadata or {},
        "diff_or_summary": (diff_or_summary or "").strip()[:8000] or None,
    }



def load_feedback_map(db: Session) -> dict[str, dict[str, str]]:
    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.meta.contains({"source": "comprehension_check"}))
        .order_by(ActivitySession.date.desc())
        .limit(500)
    ).all()
    feedback_map: dict[str, dict[str, str]] = {}
    for session_row in sessions:
        meta = session_row.meta or {}
        check_id = meta.get("check_id")
        if not isinstance(check_id, str) or check_id in feedback_map:
            continue
        feedback = meta.get("feedback") if isinstance(meta.get("feedback"), str) else None
        follow_up = meta.get("follow_up") if isinstance(meta.get("follow_up"), str) else None
        if feedback or follow_up:
            feedback_map[check_id] = {"feedback": feedback or "", "follow_up": follow_up or ""}
    return feedback_map



def serialize_comprehension_check(check: ComprehensionCheck, feedback_payload: dict[str, str] | None) -> ComprehensionCheckRead:
    return ComprehensionCheckRead(
        id=check.id,
        entity_id=check.entity_id,
        ai_assist_level=check.ai_assist_level,
        question=check.question,
        your_answer=check.your_answer,
        ai_grade=check.ai_grade,
        created_at=check.created_at,
        answered_at=check.answered_at,
        entity=serialize_entity(check.entity) if check.entity is not None else None,
        feedback=(feedback_payload or {}).get("feedback") or None,
        follow_up=(feedback_payload or {}).get("follow_up") or None,
    )
