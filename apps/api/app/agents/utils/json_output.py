from __future__ import annotations

import json
from json import JSONDecodeError
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError, ValidationError

from app.agents.schemas.common import JsonSchema
from app.agents.utils.exceptions import InvalidJSONError


def strip_json_code_fence(raw_text: str) -> str:
    candidate = raw_text.strip()
    if not candidate.startswith("```"):
        return candidate

    lines = candidate.splitlines()
    if len(lines) >= 3 and lines[-1].strip().startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return candidate


def parse_and_validate_json_output(raw_text: str, json_schema: JsonSchema) -> dict[str, Any]:
    candidate = strip_json_code_fence(raw_text)

    try:
        payload = json.loads(candidate)
    except JSONDecodeError as exc:
        raise InvalidJSONError(f"Model returned invalid JSON: {exc.msg}") from exc

    if not isinstance(payload, dict):
        raise InvalidJSONError("Model output must be a JSON object.")

    validate_json_value(payload, json_schema)
    return payload


def validate_json_value(value: Any, schema: JsonSchema, path: str = "$") -> None:
    try:
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(value)
    except SchemaError as exc:
        raise InvalidJSONError(f"Invalid output schema: {exc.message}") from exc
    except ValidationError as exc:
        location = path
        for segment in exc.absolute_path:
            location += f"[{segment}]" if isinstance(segment, int) else f".{segment}"
        raise InvalidJSONError(f"Model output failed JSON Schema validation at {location}: {exc.message}") from exc
