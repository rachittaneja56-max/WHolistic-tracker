"""Compatibility module for the retired FastAPI session-auth routes.

Authentication is owned by the Better Auth service in ``apps/auth``. Keep an
empty router here so imports of the historical module remain harmless without
reintroducing the former password and cookie-session endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])
