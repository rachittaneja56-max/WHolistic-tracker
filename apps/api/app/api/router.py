from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    academic,
    account,
    admin,
    dsa_integrations,
    dsa_extension,
    dsa_tracker,
    agents,
    assistant,
    analytics,
    chat,
    comprehension_checks,
    dashboard,
    digest,
    entities,
    events,
    focus,
    github,
    graph,
    health,
    ideas,
    jobs,
    links,
    projects,
    recall,
    settings,
    sessions,
    subjects,
    tags,
    webhooks,
    workflows,
    subject_workflows,
    project_workflows,
)

api_router = APIRouter()
api_router.include_router(account.router)
api_router.include_router(academic.router)
api_router.include_router(admin.router)
api_router.include_router(health.router)
api_router.include_router(dashboard.router)
api_router.include_router(digest.router)
api_router.include_router(agents.router)
api_router.include_router(assistant.router)
api_router.include_router(chat.router)
api_router.include_router(graph.router)
api_router.include_router(entities.router)
api_router.include_router(events.router)
api_router.include_router(focus.router)
api_router.include_router(links.router)
api_router.include_router(projects.router)
api_router.include_router(recall.router)
api_router.include_router(settings.router)
api_router.include_router(sessions.router)
api_router.include_router(subjects.router)
api_router.include_router(github.router)
api_router.include_router(analytics.router)
api_router.include_router(ideas.router)
api_router.include_router(comprehension_checks.router)
api_router.include_router(tags.router)
api_router.include_router(webhooks.router)
api_router.include_router(jobs.router)
api_router.include_router(dsa_integrations.router)
api_router.include_router(dsa_extension.router)
api_router.include_router(dsa_tracker.router)
api_router.include_router(workflows.router)
api_router.include_router(subject_workflows.router)
api_router.include_router(project_workflows.router)
