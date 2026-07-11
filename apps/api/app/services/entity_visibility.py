from __future__ import annotations

from sqlalchemy import or_

from app.models.entity import Entity


def active_entity_clause():
    return or_(Entity.entity_metadata.is_(None), Entity.entity_metadata["deleted_at"].astext.is_(None))


def archived_entity_clause():
    return Entity.entity_metadata["deleted_at"].astext.is_not(None)


def is_entity_deleted(entity: Entity | None) -> bool:
    return bool(entity and isinstance(entity.entity_metadata, dict) and entity.entity_metadata.get("deleted_at"))
