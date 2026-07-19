from __future__ import annotations

"""Tenant-scoped search for the shared entity workspace.

All values remain SQLAlchemy-bound. Tenant and soft-delete criteria are added
by the session hook to each Entity query, including parent lookups.
"""

import base64
import json
import re
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Text, and_, case, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models.entity import Entity
from app.schemas.entity import EntitySearchResponseRead, EntitySearchResultRead, SearchHighlightRead, SearchParentContextRead
from app.services.entity_visibility import active_entity_clause

_SPACE = re.compile(r"\s+")
_WORDS = re.compile(r"[\w-]+", re.UNICODE)
_EXCERPT_LENGTH = 280


def extract_search_text(content: str | None, content_type: str | None) -> str:
    """Flatten BlockNote/canvas JSON as text only; invalid JSON stays safe text."""
    if not content:
        return ""
    if content_type not in {"blocks", "canvas_json"}:
        return _SPACE.sub(" ", content).strip()
    try:
        parsed = json.loads(content)
    except (TypeError, ValueError):
        return _SPACE.sub(" ", content).strip()
    values: list[str] = []

    def collect(value: Any, key: str = "") -> None:
        if isinstance(value, str) and key in {"text", "content", "code", "originalText", "label"}:
            values.append(value)
        elif isinstance(value, list):
            for child in value:
                collect(child)
        elif isinstance(value, dict):
            for child_key, child in value.items():
                collect(child, child_key)

    collect(parsed)
    return _SPACE.sub(" ", " ".join(values)).strip() or _SPACE.sub(" ", content).strip()


def _terms(query: str) -> list[str]:
    return [term.casefold() for term in _WORDS.findall(query) if len(term) > 1][:12]


def _excerpt(entity: Entity, terms: list[str]) -> tuple[str, list[SearchHighlightRead]]:
    source = extract_search_text(entity.content, entity.content_type) or entity.title or "No text content available."
    folded = source.casefold()
    matches = [folded.find(term) for term in terms if folded.find(term) >= 0]
    start = max(min(matches) - 72, 0) if matches else 0
    end = min(start + _EXCERPT_LENGTH, len(source))
    prefix = "…" if start else ""
    text = prefix + source[start:end].strip() + ("…" if end < len(source) else "")
    folded_text = text.casefold()
    highlights = [SearchHighlightRead(start=index, end=index + len(term)) for term in terms if (index := folded_text.find(term)) >= 0]
    return text, highlights


def _encode_cursor(sort: str, value: Any, entity_id: UUID) -> str:
    if isinstance(value, datetime):
        value = value.isoformat()
    payload = json.dumps({"s": sort, "v": value, "i": str(entity_id)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _decode_cursor(cursor: str | None, sort: str) -> tuple[Any, UUID] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        payload = json.loads(raw)
        if payload["s"] != sort:
            raise ValueError
        return payload["v"], UUID(payload["i"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ValueError("Invalid search cursor") from None


def _subject_ids(db: Session, subject_id: UUID | None, term: str | None) -> set[UUID] | None:
    roots: set[UUID] = {subject_id} if subject_id else set()
    if term:
        roots.update(db.scalars(select(Entity.id).where(Entity.type == "subject_topic", Entity.parent_id.is_(None), Entity.entity_metadata["term"].astext == term)).all())
    if not roots:
        return None
    found: set[UUID] = set()
    frontier = list(roots)
    while frontier:
        found.update(frontier)
        children = db.scalars(select(Entity.id).where(Entity.parent_id.in_(frontier))).all()
        frontier = [child for child in children if child not in found]
    return found


def search_entities(
    db: Session, *, q: str, entity_type: str | None, subject_id: UUID | None, term: str | None, tags: list[str],
    min_confidence: float | None, max_confidence: float | None, recall_state: str | None,
    created_after: datetime | None, created_before: datetime | None, updated_after: datetime | None, updated_before: datetime | None,
    sort: str, cursor: str | None, limit: int,
) -> EntitySearchResponseRead:
    terms = _terms(q)
    clauses = [active_entity_clause()]
    if entity_type:
        clauses.append(Entity.type == entity_type)
    subject_scope = _subject_ids(db, subject_id, term)
    if subject_scope is not None:
        clauses.append(Entity.id.in_(subject_scope))
    elif term:
        clauses.append(Entity.entity_metadata["term"].astext == term)
    clean_tags = [tag.strip() for tag in tags if tag.strip()]
    if clean_tags:
        clauses.append(Entity.tags.overlap(clean_tags))
    if min_confidence is not None:
        clauses.append(Entity.confidence_score >= min_confidence)
    if max_confidence is not None:
        clauses.append(Entity.confidence_score <= max_confidence)
    if recall_state == "enabled":
        clauses.append(Entity.entity_metadata["recall_enabled"].as_boolean().is_(True))
    elif recall_state == "due":
        clauses.append(or_(Entity.confidence_score < 0.7, Entity.last_revisited_at.is_(None)))
    elif recall_state == "revisited":
        clauses.append(Entity.last_revisited_at.is_not(None))
    elif recall_state == "not_revisited":
        clauses.append(Entity.last_revisited_at.is_(None))
    for column, lower, upper in ((Entity.created_at, created_after, created_before), (Entity.updated_at, updated_after, updated_before)):
        if lower:
            clauses.append(column >= lower)
        if upper:
            clauses.append(column <= upper)

    indexed_document = func.coalesce(Entity.title, "") + " " + func.coalesce(Entity.content, "") + " " + func.coalesce(func.array_to_string(Entity.tags, " "), "")
    document = indexed_document + " " + func.coalesce(cast(Entity.entity_metadata, Text), "")
    postgres_fts = bool(terms) and bool(db.bind) and db.bind.dialect.name == "postgresql"
    rank = None
    if terms:
        if postgres_fts:
            tsquery = func.websearch_to_tsquery("simple", q)
            vector = func.to_tsvector("simple", indexed_document)
            rank = func.ts_rank_cd(vector, tsquery).label("relevance")
            metadata_match = cast(Entity.entity_metadata, Text).ilike(f"%{terms[0].replace('%', '%%')}%")
            clauses.append(or_(vector.op("@@")(tsquery), metadata_match))
        else:
            for item in terms:
                escaped = item.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                clauses.append(document.ilike(f"%{escaped}%", escape="\\"))
            rank = sum((case((func.lower(Entity.title).like(f"%{item}%"), 3.0), else_=0.0) + case((func.lower(document).like(f"%{item}%"), 1.0), else_=0.0)) for item in terms).label("relevance")

    total = db.scalar(select(func.count()).select_from(Entity).where(*clauses)) or 0
    effective_sort = sort if sort != "relevance" or terms else "updated"
    sort_value = {"relevance": rank, "updated": func.coalesce(Entity.updated_at, Entity.created_at), "created": Entity.created_at, "confidence": func.coalesce(Entity.confidence_score, 0.0), "revisited": func.coalesce(Entity.last_revisited_at, Entity.created_at)}[effective_sort]
    decoded = _decode_cursor(cursor, sort)
    if decoded:
        value, cursor_id = decoded
        value = datetime.fromisoformat(value) if effective_sort in {"updated", "created", "revisited"} else float(value)
        clauses.append(or_(sort_value < value, and_(sort_value == value, Entity.id < cursor_id)))
    rows = db.execute(select(Entity, sort_value.label("_sort_value")).where(*clauses).order_by(sort_value.desc(), Entity.id.desc()).limit(limit + 1)).all()
    has_more, rows = len(rows) > limit, rows[:limit]
    parent_ids = {entity.parent_id for entity, _ in rows if entity.parent_id}
    parents = {parent.id: parent for parent in db.scalars(select(Entity).where(Entity.id.in_(parent_ids))).all()} if parent_ids else {}
    from app.api.routes.entities import serialize_entity
    results = []
    for entity, value in rows:
        parent = parents.get(entity.parent_id)
        excerpt, highlights = _excerpt(entity, terms)
        results.append(EntitySearchResultRead(entity=serialize_entity(entity), excerpt=excerpt, highlights=highlights, parent=SearchParentContextRead(id=parent.id, title=parent.title, type=parent.type, term=(parent.entity_metadata or {}).get("term")) if parent else None, relevance=float(value) if effective_sort == "relevance" and value is not None else None))
    next_cursor = _encode_cursor(sort, rows[-1][1], rows[-1][0].id) if has_more and rows else None
    return EntitySearchResponseRead(results=results, total=total, next_cursor=next_cursor, search_mode="postgresql_fts" if postgres_fts else "portable_contains")
