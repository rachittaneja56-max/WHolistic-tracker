from typing import cast

from sqlalchemy.orm import Session

from app.api.routes.ideas import create_project_draft_route
from app.models.entity import Entity
from app.models.link import Link
from app.schemas.idea import IdeaProjectDraftRequest, IdeaValidationResponse


class FakeSession:
    def __init__(self) -> None:
        self.rows: list[object] = []

    def add(self, row: object) -> None:
        self.rows.append(row)

    def add_all(self, rows: list[object]) -> None:
        self.rows.extend(rows)

    def commit(self) -> None:
        return None

    def refresh(self, row: object) -> None:
        return None


def test_approved_idea_creates_reviewable_project_hierarchy() -> None:
    validation = IdeaValidationResponse(
        idea_summary="A focused developer project tracker",
        similar_products=[{"name": "Example", "url": "https://example.com", "note": "Market reference"}],
        suggested_mvp=[
            {"milestone": "Validate workflow", "tasks": ["Interview users", "Prototype the board"]},
            {"milestone": "Ship MVP", "tasks": ["Release the first version"]},
        ],
    )
    payload = IdeaProjectDraftRequest(
        idea="Connect delivery, market research, and durable learning.",
        validation=validation,
        title="Holistic tracker",
        tags=["productivity"],
    )
    fake_db = FakeSession()

    result = create_project_draft_route(payload, db=cast(Session, fake_db))

    assert result.project.metadata["status"] == "planned"
    assert result.project.metadata["market_research"][0]["name"] == "Example"
    assert len(result.milestones) == 2
    assert len(result.tasks) == 3
    assert {task.parent_id for task in result.tasks}.issubset({milestone.id for milestone in result.milestones})
    assert any(isinstance(row, Link) and row.relation_type == "implements" for row in fake_db.rows)
    entities = [row for row in fake_db.rows if isinstance(row, Entity)]
    assert {row.type for row in entities} >= {"idea", "project", "milestone", "task"}
