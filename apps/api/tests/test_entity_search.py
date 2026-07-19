from uuid import uuid4

import pytest

from app.services.entity_search import _decode_cursor, _encode_cursor, extract_search_text


def test_rich_content_excerpt_text_keeps_blocknote_words_and_ignores_markup() -> None:
    content = '[{"type":"paragraph","content":[{"type":"text","text":"Binary search invariant"}]}]'
    assert extract_search_text(content, "blocks") == "Binary search invariant"


def test_search_cursor_is_sort_scoped_and_rejects_tampering() -> None:
    cursor = _encode_cursor("updated", "2026-07-19T10:00:00+00:00", uuid4())
    assert _decode_cursor(cursor, "updated") is not None
    with pytest.raises(ValueError):
        _decode_cursor(cursor, "created")
    with pytest.raises(ValueError):
        _decode_cursor("not-a-cursor", "updated")
