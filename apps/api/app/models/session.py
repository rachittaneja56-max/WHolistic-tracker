from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tenant import TenantOwned


class ActivitySession(TenantOwned, Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_sessions_user_id_id"),
        ForeignKeyConstraint(["user_id", "entity_id"], ["entities.user_id", "entities.id"], name="fk_sessions_owned_entity", ondelete="CASCADE"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    action: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    entity: Mapped["Entity | None"] = relationship(back_populates="sessions")
