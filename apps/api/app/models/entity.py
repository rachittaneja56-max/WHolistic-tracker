from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tenant import TenantOwned


class Entity(TenantOwned, Base):
    __tablename__ = "entities"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_entities_user_id_id"),
        ForeignKeyConstraint(
            ["user_id", "parent_id"],
            ["entities.user_id", "entities.id"],
            name="fk_entities_owned_parent",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    type: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(dim=384), nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, server_default=text("1.0"), nullable=True)
    last_revisited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=True)
    entity_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    parent: Mapped["Entity | None"] = relationship(back_populates="children", remote_side="Entity.id", foreign_keys=[parent_id])
    children: Mapped[list["Entity"]] = relationship(back_populates="parent", foreign_keys=[parent_id])
    links_from: Mapped[list["Link"]] = relationship(back_populates="from_entity", foreign_keys="Link.from_id")
    links_to: Mapped[list["Link"]] = relationship(back_populates="to_entity", foreign_keys="Link.to_id")
    sessions: Mapped[list["ActivitySession"]] = relationship(back_populates="entity")
    reviews: Mapped[list["Review"]] = relationship(back_populates="entity")
    comprehension_checks: Mapped[list["ComprehensionCheck"]] = relationship(back_populates="entity")
