from datetime import datetime, timezone

from app.agents.services.recall import get_due_recall_items
from app.api.routes.recall import router
from app.services.auth import require_owner_mutation


class ScalarRows:
    def all(self):
        return []


class RecordingDb:
    def __init__(self) -> None:
        self.statements = []

    def scalars(self, statement):
        self.statements.append(statement)
        return ScalarRows()


def test_due_recall_query_filters_entities_by_tag() -> None:
    db = RecordingDb()

    result = get_due_recall_items(
        db,
        tag="dynamic-programming",
        now=datetime(2026, 7, 14, tzinfo=timezone.utc),
    )

    assert result == []
    assert len(db.statements) == 2
    entity_query_params = db.statements[1].compile().params
    assert "dynamic-programming" in entity_query_params.values()


def test_recall_grading_requires_owner_mutation_auth() -> None:
    grade_route = next(route for route in router.routes if route.path == "/recall/{entity_id}/grade")
    dependency_calls = {dependency.call for dependency in grade_route.dependant.dependencies}
    assert require_owner_mutation in dependency_calls