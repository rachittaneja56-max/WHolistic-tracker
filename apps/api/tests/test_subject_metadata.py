import pytest

from app.schemas.entity import normalize_entity_metadata
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
