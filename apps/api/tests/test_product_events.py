import pytest
from pydantic import ValidationError

from app.api.routes.events import ProductEventCreate


def test_product_events_accept_only_allowlisted_aggregate_properties():
    event = ProductEventCreate(
        event_name="core_web_vital",
        properties={"metric": "LCP", "value": 2100.5, "rating": "good", "surface": "landing"},
    )
    assert event.properties["metric"] == "LCP"

    with pytest.raises(ValidationError):
        ProductEventCreate(
            event_name="core_web_vital",
            properties={"metric": "LCP", "raw_url": "/entity/private-id"},
        )
    with pytest.raises(ValidationError):
        ProductEventCreate(
            event_name="prompt_injection_signal",
            properties={"source_category": "note", "decision": "blocked", "prompt": "raw note text"},
        )
    with pytest.raises(ValidationError):
        ProductEventCreate(
            event_name="extension_operation_failed",
            properties={"operation": "current_question", "category": "server said: private content"},
        )
