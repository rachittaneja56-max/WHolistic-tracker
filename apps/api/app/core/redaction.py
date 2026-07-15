from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

REDACTED = "[REDACTED]"
SENSITIVE_KEY = re.compile(r"authorization|cookie|password|token|secret|api[_-]?key|database[_-]?url", re.I)
BEARER_VALUE = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+\-/=]+")
URL_CREDENTIALS = re.compile(r"([a-z][a-z0-9+.-]*://)([^/@\s:]+):([^/@\s]+)@", re.I)
LABELED_SECRET = re.compile(
    r"(?i)\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\b"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
PROVIDER_TOKEN = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b"
)
PRIVATE_KEY = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
    re.DOTALL,
)


def redact_value(value: Any, *, key: str | None = None) -> Any:
    if key and SENSITIVE_KEY.search(key):
        return REDACTED
    if isinstance(value, Mapping):
        return {str(item_key): redact_value(item_value, key=str(item_key)) for item_key, item_value in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [redact_value(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def redact_text(value: str) -> str:
    redacted = BEARER_VALUE.sub(r"\1[REDACTED]", value)
    redacted = URL_CREDENTIALS.sub(r"\1[REDACTED]@", redacted)
    redacted = LABELED_SECRET.sub(r"\1\2[REDACTED]", redacted)
    redacted = PROVIDER_TOKEN.sub(REDACTED, redacted)
    return PRIVATE_KEY.sub(REDACTED, redacted)
