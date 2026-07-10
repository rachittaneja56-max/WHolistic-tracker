from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import agents, chat, dashboard, entities, github, graph, health, jobs, links, recall, sessions, webhooks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(dashboard.router)
api_router.include_router(agents.router)
api_router.include_router(chat.router)
api_router.include_router(graph.router)
api_router.include_router(entities.router)
api_router.include_router(links.router)
api_router.include_router(recall.router)
api_router.include_router(sessions.router)
api_router.include_router(github.router)
api_router.include_router(webhooks.router)
api_router.include_router(jobs.router)
