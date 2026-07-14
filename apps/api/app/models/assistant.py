from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tenant import TenantOwned


class AssistantThread(TenantOwned, Base):
    __tablename__ = "assistant_threads"
    __table_args__ = (UniqueConstraint("user_id", "id", name="uq_assistant_threads_user_id_id"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    messages: Mapped[list["AssistantMessage"]] = relationship(back_populates="thread", cascade="all, delete-orphan")
    proposals: Mapped[list["AssistantProposal"]] = relationship(back_populates="thread", cascade="all, delete-orphan")


class AssistantMessage(TenantOwned, Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_assistant_messages_user_id_id"),
        ForeignKeyConstraint(["user_id", "thread_id"], ["assistant_threads.user_id", "assistant_threads.id"], name="fk_messages_owned_thread", ondelete="CASCADE"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    thread_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model_stage: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    thread: Mapped[AssistantThread] = relationship(back_populates="messages")


class AssistantProposal(TenantOwned, Base):
    __tablename__ = "assistant_proposals"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_assistant_proposals_user_id_id"),
        ForeignKeyConstraint(["user_id", "thread_id"], ["assistant_threads.user_id", "assistant_threads.id"], name="fk_proposals_owned_thread", ondelete="CASCADE"),
        ForeignKeyConstraint(["user_id", "source_message_id"], ["assistant_messages.user_id", "assistant_messages.id"], name="fk_proposals_owned_message", ondelete="CASCADE"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    thread_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    source_message_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    actions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    execution_key: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    thread: Mapped[AssistantThread] = relationship(back_populates="proposals")
