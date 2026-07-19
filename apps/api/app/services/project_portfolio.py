from __future__ import annotations

from typing import Iterable

from app.models.entity import Entity
from app.models.session import ActivitySession
from app.services.task_statuses import is_terminal_task_status


GITHUB_EVIDENCE_ACTIONS = {"pr_merged", "push", "deployed", "project_shipped"}


def _completed_task(task: Entity) -> bool:
    return task.type == "task" and is_terminal_task_status(str((task.entity_metadata or {}).get("status", "backlog")))


def project_evidence(tasks: Iterable[Entity], sessions: Iterable[ActivitySession]) -> list[str]:
    evidence = [f"Confirmed task: {task.title or 'Untitled task'}" for task in tasks if _completed_task(task)]
    for session in sessions:
        meta = session.meta or {}
        if session.action == "focus_session" and meta.get("status") == "completed":
            minutes = meta.get("actual_minutes")
            evidence.append(f"Completed focus session{f' ({minutes} minutes)' if isinstance(minutes, int) else ''}")
        elif session.action in GITHUB_EVIDENCE_ACTIONS:
            evidence.append(f"GitHub/project activity: {session.action.replace('_', ' ')}")
    return list(dict.fromkeys(evidence))


def portfolio_draft(project: Entity, tasks: Iterable[Entity], sessions: Iterable[ActivitySession]) -> tuple[str, list[str], list[str]]:
    evidence = project_evidence(tasks, sessions)
    title = project.title or "Untitled project"
    if not evidence:
        return (f"{title}: portfolio summary pending confirmed delivery evidence.", [], [])
    summary = f"{title}: {len(evidence)} confirmed delivery signal{'s' if len(evidence) != 1 else ''} across tasks, focus work, and project/GitHub activity."
    bullets = [f"Delivered {title} work backed by {item.lower()}." for item in evidence[:3]]
    return summary, bullets, evidence
