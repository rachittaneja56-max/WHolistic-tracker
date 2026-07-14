from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tenant import TenantOwned


class Link(TenantOwned, Base):
    __tablename__ = "links"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_links_user_id_id"),
        ForeignKeyConstraint(["user_id", "from_id"], ["entities.user_id", "entities.id"], name="fk_links_owned_from", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "to_id"], ["entities.user_id", "entities.id"], name="fk_links_owned_to", ondelete="CASCADE"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    from_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    to_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    relation_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=True)

    from_entity: Mapped["Entity | None"] = relationship(back_populates="links_from", foreign_keys=[from_id])
    to_entity: Mapped["Entity | None"] = relationship(back_populates="links_to", foreign_keys=[to_id])
