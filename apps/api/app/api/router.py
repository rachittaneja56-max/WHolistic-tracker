from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import dashboard, entities, health, links, sessions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(dashboard.router)
api_router.include_router(entities.router)
api_router.include_router(links.router)
api_router.include_router(sessions.router)
