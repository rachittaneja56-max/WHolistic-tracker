from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes.links import ensure_pair_is_available
from app.models.link import Link
from app.schemas.link import LinkCreate


class ScalarDb:
    def __init__(self, result: Link | None) -> None:
        self.result = result
        self.queries = []

    def scalar(self, query):
        self.queries.append(query)
        return self.result


def test_link_create_normalizes_explanation_and_rejects_self_links() -> None:
    from_id = uuid4()
    payload = LinkCreate(
        from_id=from_id,
        to_id=uuid4(),
        relation_type="prerequisite",
        explanation="  Required foundation  ",
    )
    assert payload.explanation == "Required foundation"

    with pytest.raises(ValidationError, match="cannot be the same"):
        LinkCreate(
            from_id=from_id,
            to_id=from_id,
            relation_type="prerequisite",
            explanation="Invalid",
        )


def test_pair_availability_rejects_reverse_direction_duplicates() -> None:
    left_id = uuid4()
    right_id = uuid4()
    existing = Link(
        id=uuid4(),
        from_id=right_id,
        to_id=left_id,
        relation_type="depends_on",
        explanation="Already connected",
        status="confirmed",
    )
    db = ScalarDb(existing)

    with pytest.raises(HTTPException) as exc:
        ensure_pair_is_available(db, left_id, right_id)

    assert exc.value.status_code == 409
    assert "status: confirmed" in exc.value.detail
    assert len(db.queries) == 1


def test_pair_availability_accepts_unconnected_entities() -> None:
    db = ScalarDb(None)
    ensure_pair_is_available(db, uuid4(), uuid4())
    assert len(db.queries) == 1