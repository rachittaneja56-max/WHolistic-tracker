import pytest
from pydantic import ValidationError

from app.api.routes.sessions import create_session
from app.schemas.entity import normalize_entity_metadata
from app.schemas.session import SessionCreate
from app.schemas.settings import SettingsStatusRead


def test_subject_legacy_metadata_gets_safe_defaults() -> None:
    metadata = normalize_entity_metadata("subject_topic", {"exam_date": "2026-12-01"})
    assert metadata["status"] == "active"
    assert metadata["priority"] == "medium"
    assert metadata["progress_percent"] == 0
    assert metadata["target_confidence"] == 0.8
    assert metadata["study_sessions_planned"] == 0
    assert metadata["syllabus_units"] == []


@pytest.mark.parametrize("metadata", [
    {"exam_date": "not-a-date"},
    {"progress_percent": 101},
    {"target_confidence": -1},
    {"study_sessions_planned": -1},
    {"syllabus_units": "unit one"},
])
def test_invalid_subject_metadata_is_rejected(metadata) -> None:
    with pytest.raises(ValueError):
        normalize_entity_metadata("subject_topic", metadata)


def test_subject_academic_metadata_is_normalized() -> None:
    metadata = normalize_entity_metadata("subject_topic", {
        "course_code": " CS-301 ",
        "term": " Fall 2026 ",
        "instructor": " Ada Lovelace ",
        "location": " Room 12 ",
        "color": " #A1B2C3 ",
        "credits": 4,
    })
    assert metadata["course_code"] == "CS-301"
    assert metadata["term"] == "Fall 2026"
    assert metadata["instructor"] == "Ada Lovelace"
    assert metadata["location"] == "Room 12"
    assert metadata["color"] == "#a1b2c3"
    assert metadata["credits"] == 4


@pytest.mark.parametrize("metadata", [
    {"color": "blue"},
    {"color": "#12345"},
    {"credits": -0.5},
    {"credits": True},
    {"course_code": 301},
])
def test_invalid_subject_academic_metadata_is_rejected(metadata) -> None:
    with pytest.raises(ValueError):
        normalize_entity_metadata("subject_topic", metadata)


def test_academic_task_metadata_is_normalized_without_breaking_project_tasks() -> None:
    metadata = normalize_entity_metadata("task", {
        "status": "in_progress",
        "academic_kind": "assignment",
        "due_at": "2026-10-02T14:30:00Z",
        "estimated_minutes": 90,
        "recurrence": " weekly ",
        "points_earned": 18,
        "points_possible": 20,
        "weight_percent": 25,
    })
    assert metadata["status"] == "in_progress"
    assert metadata["academic_kind"] == "assignment"
    assert metadata["due_at"] == "2026-10-02T14:30:00Z"
    assert metadata["recurrence"] == "weekly"
    assert metadata["ai_assist_level"] == "handwritten"


@pytest.mark.parametrize("metadata", [
    {"academic_kind": "quiz"},
    {"due_at": "next Friday"},
    {"estimated_minutes": -1},
    {"estimated_minutes": 1.5},
    {"recurrence": 7},
    {"points_earned": -1},
    {"points_possible": True},
    {"weight_percent": 101},
])
def test_invalid_academic_task_metadata_is_rejected(metadata) -> None:
    with pytest.raises(ValueError):
        normalize_entity_metadata("task", metadata)


def test_study_session_actions_and_optional_date_are_supported() -> None:
    planned = SessionCreate.model_validate({
        "action": "study_planned",
        "date": "2026-10-02T14:30:00Z",
        "meta": {"duration_minutes": 45},
    })
    assert planned.date is not None
    assert planned.date.isoformat() == "2026-10-02T14:30:00+00:00"
    assert SessionCreate(action="study_completed").action == "study_completed"
    assert SessionCreate(action="revisited").date is None
    with pytest.raises(ValidationError):
        SessionCreate(action="unknown")


def test_create_session_preserves_an_explicit_study_timestamp() -> None:
    payload = SessionCreate.model_validate({
        "action": "study_completed",
        "date": "2026-10-02T14:30:00Z",
        "meta": {"duration_minutes": 45},
    })

    class FakeDb:
        def __init__(self):
            self.row = None

        def add(self, row):
            self.row = row

        def commit(self):
            return None

        def refresh(self, _row):
            return None

    db = FakeDb()
    result = create_session(payload, db)

    assert db.row is not None
    assert db.row.date == payload.date
    assert result.date == payload.date


def test_safe_settings_contract_has_no_secret_fields() -> None:
    payload = SettingsStatusRead.model_validate({
        "ai": {"enabled": True, "provider": "openai", "openai_configured": True, "provider_ready": True, "fast_model": "fast", "smart_model": "smart", "disabled_reason": None},
        "github": {"enabled": True, "webhook_secret_configured": True, "access_token_configured": True},
        "web_search": {"enabled": False, "provider": None, "api_key_configured": False},
    }).model_dump()
    serialized = str(payload).lower()
    assert "openai_api_key" not in serialized
    assert "database_url" not in serialized
    assert "github_access_token" not in serialized
