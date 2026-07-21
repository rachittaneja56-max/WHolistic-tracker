from datetime import datetime, timezone
from uuid import uuid4

from app.api.routes.graph import get_graph
from app.models.entity import Entity


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _GraphDb:
    def __init__(self, entities, total_nodes):
        self.entities = entities
        self.total_nodes = total_nodes
        self.statements = []
        self.scalar_statements = []
        self._scalar_calls = 0

    def scalar(self, statement):
        self.scalar_statements.append(statement)
        self._scalar_calls += 1
        return self.total_nodes

    def scalars(self, statement):
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _Rows(self.entities)
        return _Rows([])


def _entity(index: int) -> Entity:
    return Entity(
        id=uuid4(),
        user_id=uuid4(),
        type="note",
        title=f"Graph entity {index}",
        content="",
        content_type="markdown",
        tags=[],
        confidence_score=1.0,
        entity_metadata={},
        created_at=datetime.now(timezone.utc),
    )


def test_graph_caps_a_thousands_entity_workspace_and_reports_truncation() -> None:
    all_entities = [_entity(index) for index in range(2_400)]
    db = _GraphDb(all_entities[:250], total_nodes=len(all_entities))

    graph = get_graph(limit=250, db=db)

    assert graph.total_nodes == 2_400
    assert graph.truncated is True
    assert len(graph.nodes) == 250
    assert len(graph.edges) == 0
    assert db.scalar_statements
    assert "LIMIT" in str(db.statements[0]).upper()
