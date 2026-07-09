from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ComprehensionCheck(Base):
    __tablename__ = "comprehension_checks"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    entity_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("entities.id"), nullable=True)
    ai_assist_level: Mapped[str | None] = mapped_column(Text, nullable=True)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    your_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_grade: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    entity: Mapped["Entity | None"] = relationship(back_populates="comprehension_checks")
