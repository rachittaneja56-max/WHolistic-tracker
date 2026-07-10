from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    agents,
    analytics,
    capture,
    chat,
    comprehension_checks,
    dashboard,
    digest,
    entities,
    github,
    graph,
    health,
    ideas,
    jobs,
    links,
    recall,
    sessions,
    tags,
    webhooks,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(dashboard.router)
api_router.include_router(digest.router)
api_router.include_router(agents.router)
api_router.include_router(chat.router)
api_router.include_router(graph.router)
api_router.include_router(entities.router)
api_router.include_router(links.router)
api_router.include_router(recall.router)
api_router.include_router(sessions.router)
api_router.include_router(github.router)
api_router.include_router(analytics.router)
api_router.include_router(ideas.router)
api_router.include_router(comprehension_checks.router)
api_router.include_router(capture.router)
api_router.include_router(tags.router)
api_router.include_router(webhooks.router)
api_router.include_router(jobs.router)
