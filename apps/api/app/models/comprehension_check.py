from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tenant import TenantOwned


class ComprehensionCheck(TenantOwned, Base):
    __tablename__ = "comprehension_checks"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_comprehension_checks_user_id_id"),
        ForeignKeyConstraint(["user_id", "entity_id"], ["entities.user_id", "entities.id"], name="fk_checks_owned_entity", ondelete="CASCADE"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    ai_assist_level: Mapped[str | None] = mapped_column(Text, nullable=True)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    your_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_grade: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    entity: Mapped["Entity | None"] = relationship(back_populates="comprehension_checks")
