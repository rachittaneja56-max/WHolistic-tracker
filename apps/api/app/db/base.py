from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""


# Import models so SQLAlchemy metadata is fully registered for Alembic.
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.link import Link
from app.models.review import Review
from app.models.session import ActivitySession

__all__ = ["ActivitySession", "Base", "ComprehensionCheck", "Entity", "Link", "Review"]
