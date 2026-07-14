from __future__ import annotations

from collections.abc import Generator
from uuid import UUID

from fastapi import Request
from sqlalchemy import create_engine, event, or_, text
from sqlalchemy.orm import Session, sessionmaker, with_loader_criteria

from app.core.config import settings
from app.models.comprehension_check import ComprehensionCheck
from app.models.assistant import AssistantMessage
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession
from app.models.tenant import TenantOwned

engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
@event.listens_for(Session, "do_orm_execute")
def apply_tenant_and_visibility_filters(execute_state) -> None:
    if not execute_state.is_select:
        return
    user_id = execute_state.session.info.get("user_id")
    options = []
    if isinstance(user_id, UUID):
        options.append(
            with_loader_criteria(
                TenantOwned,
                lambda row: row.user_id == user_id,
                include_aliases=True,
            )
        )
    if not execute_state.execution_options.get("include_deleted"):
        options.append(
            with_loader_criteria(
                Entity,
                lambda entity: or_(entity.entity_metadata.is_(None), entity.entity_metadata["deleted_at"].astext.is_(None)),
                include_aliases=True,
            )
        )
    if options:
        execute_state.statement = execute_state.statement.options(*options)


@event.listens_for(Session, "before_flush")
def enforce_tenant_writes(session: Session, _flush_context, _instances) -> None:
    user_id = session.info.get("user_id")
    for row in session.new:
        if not isinstance(row, TenantOwned):
            continue
        if not isinstance(user_id, UUID):
            raise RuntimeError("Tenant context is required to create private data")
        current = getattr(row, "user_id", None)
        if current is None:
            row.user_id = user_id
        elif current != user_id:
            raise RuntimeError("Cross-tenant writes are forbidden")
    if isinstance(user_id, UUID):
        connection = session.connection()
        new_entities = sum(isinstance(row, Entity) for row in session.new)
        new_messages = sum(isinstance(row, AssistantMessage) for row in session.new)
        if new_entities or new_messages:
            quota = connection.execute(
                text("SELECT COALESCE(max_entities, 25000) AS max_entities, COALESCE(max_assistant_messages, 50000) AS max_messages FROM user_quotas WHERE user_id = :user_id"),
                {"user_id": user_id},
            ).mappings().one_or_none() or {"max_entities": 25000, "max_messages": 50000}
            entity_count = connection.execute(text("SELECT count(*) FROM entities WHERE user_id = :user_id"), {"user_id": user_id}).scalar_one()
            message_count = connection.execute(text("SELECT count(*) FROM assistant_messages WHERE user_id = :user_id"), {"user_id": user_id}).scalar_one()
            if entity_count + new_entities > quota["max_entities"]:
                raise RuntimeError("Entity quota exceeded")
            if message_count + new_messages > quota["max_messages"]:
                raise RuntimeError("Assistant message quota exceeded")
            connection.execute(
                text("INSERT INTO usage_daily (id, user_id, date, entity_writes, assistant_messages) VALUES (gen_random_uuid(), :user_id, current_date, :entities, :messages) ON CONFLICT (user_id, date) DO UPDATE SET entity_writes = usage_daily.entity_writes + EXCLUDED.entity_writes, assistant_messages = usage_daily.assistant_messages + EXCLUDED.assistant_messages"),
                {"user_id": user_id, "entities": new_entities, "messages": new_messages},
            )
    for row in session.dirty:
        if isinstance(row, TenantOwned) and isinstance(user_id, UUID) and row.user_id != user_id:
            raise RuntimeError("Cross-tenant writes are forbidden")




def get_db(request: Request) -> Generator[Session, None, None]:
    db = SessionLocal()
    principal = getattr(request.state, "principal", None)
    if principal is not None:
        db.info["user_id"] = principal.user_id
    try:
        yield db
    finally:
        db.close()
