from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKeyConstraint, Integer, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tenant import TenantOwned


class Review(TenantOwned, Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_reviews_user_id_id"),
        ForeignKeyConstraint(["user_id", "entity_id"], ["entities.user_id", "entities.id"], name="fk_reviews_owned_entity", ondelete="CASCADE"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    recalled_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=True)

    entity: Mapped["Entity | None"] = relationship(back_populates="reviews")
