from uuid import uuid4

from app.models.entity import Entity
from app.models.session import ActivitySession
from app.services.project_portfolio import portfolio_draft


def test_portfolio_draft_uses_only_confirmed_tasks_sessions_and_github_evidence() -> None:
    project = Entity(id=uuid4(), type="project", title="Compiler", content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata={})
    complete = Entity(id=uuid4(), type="task", title="Implement parser", content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata={"status": "done"})
    open_task = Entity(id=uuid4(), type="task", title="Maybe add optimizer", content="", content_type="markdown", tags=[], confidence_score=1, entity_metadata={"status": "todo"})
    focus = ActivitySession(id=uuid4(), entity_id=complete.id, action="focus_session", meta={"status": "completed", "actual_minutes": 50})
    github = ActivitySession(id=uuid4(), entity_id=project.id, action="pr_merged", meta={})
    summary, bullets, evidence = portfolio_draft(project, [complete, open_task], [focus, github])
    assert "3 confirmed" in summary
    assert all("optimizer" not in item.lower() for item in [summary, *bullets, *evidence])
    assert any("Implement parser" in item for item in evidence)
    assert any("pr merged" in item for item in evidence)
