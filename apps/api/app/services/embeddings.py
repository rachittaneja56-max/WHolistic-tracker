from __future__ import annotations

from collections.abc import Iterable
import hashlib
import json
import logging
import math
from pathlib import Path
import re
from functools import lru_cache
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entity import Entity

logger = logging.getLogger(__name__)
TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_./:+#-]+")


class EmbeddingBackend(Protocol):
    def generate(self, text: str) -> list[float]: ...


class SentenceTransformerBackend:
    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name, local_files_only=True)

    def generate(self, text: str) -> list[float]:
        vector = self._model.encode(text, normalize_embeddings=True)
        if hasattr(vector, "tolist"):
            values = vector.tolist()
        else:
            values = list(vector)
        return [float(value) for value in values]


class HashEmbeddingBackend:
    def __init__(self, dimension: int):
        self.dimension = dimension

    def generate(self, text: str) -> list[float]:
        tokens = TOKEN_PATTERN.findall(text.lower())
        if not tokens:
            tokens = [text.lower().strip() or "entity"]

        vector = [0.0] * self.dimension
        for token in tokens:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
            primary_index = int.from_bytes(digest[:4], "big") % self.dimension
            secondary_index = int.from_bytes(digest[4:8], "big") % self.dimension
            sign = 1.0 if digest[8] % 2 == 0 else -1.0
            weight = 1.0 + (digest[9] / 255.0)
            vector[primary_index] += sign * weight
            vector[secondary_index] += sign * 0.5

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector

        return [value / norm for value in vector]


@lru_cache(maxsize=1)
def get_embedding_backend() -> EmbeddingBackend:
    if settings.embedding_backend == "hash":
        return HashEmbeddingBackend(settings.embedding_dimension)

    if settings.embedding_backend == "auto":
        model_path = Path(settings.embedding_model_name)
        if model_path.exists():
            try:
                return SentenceTransformerBackend(settings.embedding_model_name)
            except Exception:
                logger.warning("Falling back to deterministic hash embeddings because the local sentence-transformer backend was unavailable.")
        return HashEmbeddingBackend(settings.embedding_dimension)

    return SentenceTransformerBackend(settings.embedding_model_name)


def serialize_metadata_for_embedding(metadata: dict[str, Any] | None) -> str:
    if not metadata:
        return ""

    serialized_fields: list[str] = []
    for key in sorted(metadata):
        value = metadata[key]
        if value is None:
            continue

        if isinstance(value, str):
            serialized_value = value.strip()
        elif isinstance(value, (int, float, bool)):
            serialized_value = str(value)
        elif isinstance(value, list):
            serialized_value = ", ".join(str(item) for item in value if item is not None)
        else:
            serialized_value = json.dumps(value, ensure_ascii=True, sort_keys=True)

        if serialized_value:
            serialized_fields.append(f"{key}: {serialized_value}")

    return "\n".join(serialized_fields)


def build_entity_embedding_text(entity: Entity) -> str:
    parts: list[str] = []

    if entity.title:
        parts.append(f"Title: {entity.title.strip()}")
    if entity.type:
        parts.append(f"Type: {entity.type}")
    if entity.content_type:
        parts.append(f"Content Type: {entity.content_type}")
    if entity.tags:
        parts.append(f"Tags: {', '.join(tag.strip() for tag in entity.tags if tag.strip())}")
    if entity.content and entity.content.strip():
        parts.append(f"Content:\n{entity.content.strip()}")

    metadata_text = serialize_metadata_for_embedding(entity.entity_metadata)
    if metadata_text:
        parts.append(f"Metadata:\n{metadata_text}")

    combined = "\n\n".join(part for part in parts if part)
    return combined[: settings.embedding_text_max_chars].strip()


def generate_embedding(text: str) -> list[float]:
    cleaned_text = text.strip()
    if not cleaned_text:
        raise ValueError("Embedding text is empty")

    vector = get_embedding_backend().generate(cleaned_text)
    if len(vector) != settings.embedding_dimension:
        raise ValueError(
            f"Expected embedding dimension {settings.embedding_dimension}, received {len(vector)}"
        )
    return vector


def update_entity_embedding(entity_id: UUID, db: Session | None = None) -> Entity:
    owns_session = db is None
    session = db or SessionLocal()

    try:
        entity = session.get(Entity, entity_id)
        if entity is None:
            raise ValueError("Entity not found")

        embedding_text = build_entity_embedding_text(entity)
        entity.embedding = generate_embedding(embedding_text) if embedding_text else None
        session.add(entity)
        session.commit()
        session.refresh(entity)
        return entity
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


def get_similar_entities(
    entity_id: UUID,
    db: Session,
    limit: int = 5,
    excluded_entity_ids: Iterable[UUID] | None = None,
) -> list[tuple[Entity, float]]:
    entity = db.get(Entity, entity_id)
    if entity is None:
        raise ValueError("Entity not found")
    if entity.embedding is None:
        raise RuntimeError("Entity does not have an embedding")

    excluded_ids = {entity.id}
    if excluded_entity_ids is not None:
        excluded_ids.update(excluded_entity_ids)

    distance = Entity.embedding.cosine_distance(entity.embedding).label("distance")
    query = select(Entity, distance).where(Entity.embedding.is_not(None))
    if excluded_ids:
        query = query.where(Entity.id.notin_(list(excluded_ids)))

    rows = db.execute(query.order_by(distance).limit(limit)).all()
    return [(candidate, float(distance_value)) for candidate, distance_value in rows]
