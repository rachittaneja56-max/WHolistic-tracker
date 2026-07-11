from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import and_, create_engine, event, or_
from sqlalchemy.orm import Session, sessionmaker, with_loader_criteria

from app.core.config import settings
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession

engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
@event.listens_for(Session, "do_orm_execute")
def exclude_archived_entities(execute_state) -> None:
    if not execute_state.is_select or execute_state.execution_options.get("include_deleted"):
        return
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            Entity,
            lambda entity: or_(entity.entity_metadata.is_(None), entity.entity_metadata["deleted_at"].astext.is_(None)),
            include_aliases=True,
        )
    )




def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
