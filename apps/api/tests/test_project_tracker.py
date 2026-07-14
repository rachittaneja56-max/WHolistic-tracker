from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.api.routes.projects import build_project_summary, router
from app.models.comprehension_check import ComprehensionCheck
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.entity import normalize_entity_metadata


def _entity(
    entity_type: str,
    *,
    parent_id: UUID | None = None,
    metadata: dict | None = None,
    title: str = "Entity",
    created_at: datetime | None = None,
) -> Entity:
    return Entity(
        id=uuid4(),
        type=entity_type,
        parent_id=parent_id,
        title=title,
        content="",
        content_type="markdown",
        tags=[],
        confidence_score=1.0,
        entity_metadata=metadata or {},
        created_at=created_at,
    )


def _session(entity_id: UUID, action: str, when: datetime) -> ActivitySession:
    return ActivitySession(id=uuid4(), entity_id=entity_id, action=action, date=when, meta={})


def test_project_summary_derives_progress_risk_shipping_and_learning() -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=timezone.utc)
    project = _entity("project", metadata={"status": "active", "target_at": "2026-07-20"}, created_at=now - timedelta(days=20))
    milestone = _entity("milestone", parent_id=project.id, metadata={"status": "active", "target_at": "2026-07-18"})
    done = _entity("task", parent_id=milestone.id, metadata={"status": "done"})
    overdue = _entity("task", parent_id=milestone.id, metadata={"status": "in_progress", "due_at": "2026-07-12", "priority": "high"})
    blocked = _entity("task", parent_id=milestone.id, metadata={"status": "blocked", "blocked_reason": "Waiting for API"})
    check = ComprehensionCheck(id=uuid4(), entity_id=blocked.id, ai_assist_level="ai-paired", question="Why?", created_at=now)

    result = build_project_summary(
        project,
        [milestone],
        [done, overdue, blocked],
        [_session(project.id, "pr_merged", now - timedelta(days=1))],
        {done.id},
        [check],
        now=now,
    )

    assert result.progress_percent == pytest.approx(33.3)
    assert result.health == "at_risk"
    assert result.overdue_task_count == 1
    assert result.blocked_task_count == 1
    assert result.shipped_this_week == 1
    assert result.til_coverage_percent == 100
    assert result.comprehension_debt_count == 1
    assert result.current_milestone is not None
    assert result.current_milestone.id == milestone.id


def test_project_summary_marks_inactive_open_work_stalled() -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=timezone.utc)
    project = _entity("project", metadata={"status": "active"}, created_at=now - timedelta(days=30))
    milestone = _entity("milestone", parent_id=project.id, metadata={"status": "active"}, created_at=now - timedelta(days=30))
    task = _entity("task", parent_id=milestone.id, metadata={"status": "ready"}, created_at=now - timedelta(days=20))

    result = build_project_summary(project, [milestone], [task], [], set(), [], now=now)

    assert result.health == "stalled"
    assert "20 days" in result.health_reasons[0]


def test_project_metadata_normalization_validates_tracker_fields() -> None:
    metadata = normalize_entity_metadata(
        "project",
        {
            "status": "active",
            "priority": "urgent",
            "target_at": "2026-08-01",
            "objective": "  Ship a useful tracker  ",
        },
    )
    assert metadata["objective"] == "Ship a useful tracker"
    assert metadata["priority"] == "urgent"

    with pytest.raises(ValueError, match="metadata.priority"):
        normalize_entity_metadata("task", {"priority": "whenever"})
    with pytest.raises(ValueError, match="metadata.due_at"):
        normalize_entity_metadata("task", {"due_at": "next Tuesday"})


def test_static_tracker_route_precedes_dynamic_project_route() -> None:
    paths = [route.path for route in router.routes]
    assert paths.index("/projects/tracker") < paths.index("/projects/{project_id}/tracker")


def test_project_summary_supports_legacy_direct_project_tasks() -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=timezone.utc)
    project = _entity("project", metadata={"status": "active"}, created_at=now)
    direct_task = _entity("task", parent_id=project.id, metadata={"status": "done"}, created_at=now)

    result = build_project_summary(project, [], [direct_task], [], set(), [], now=now)

    assert result.task_count == 1
    assert result.completed_task_count == 1
    assert result.progress_percent == 100
