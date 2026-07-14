from __future__ import annotations

from uuid import UUID

from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


# Better Auth owns this table and its migrations. Register only the referenced
# primary key in SQLAlchemy metadata so cross-schema foreign keys can resolve.
AUTH_USER_TABLE = Table(
    "user",
    Base.metadata,
    Column("id", PGUUID(as_uuid=True), primary_key=True),
    schema="auth",
    extend_existing=True,
)


class TenantOwned:
    """Mixin for rows that are private to one Better Auth user."""

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("auth.user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
