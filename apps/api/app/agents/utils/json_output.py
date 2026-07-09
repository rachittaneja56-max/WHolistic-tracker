from __future__ import annotations

import json
from json import JSONDecodeError
from typing import Any

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
    expected_type = schema.get("type")
    if expected_type is not None:
        _validate_type(value, expected_type, path)

    if "const" in schema and value != schema["const"]:
        raise InvalidJSONError(f"Expected {path} to equal {schema['const']!r}.")

    if "enum" in schema and value not in schema["enum"]:
        raise InvalidJSONError(f"Expected {path} to be one of {schema['enum']!r}.")

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        additional_properties = schema.get("additionalProperties", True)

        for key in required:
            if key not in value:
                raise InvalidJSONError(f"Missing required field {path}.{key}.")

        if additional_properties is False:
            extras = sorted(set(value.keys()) - set(properties.keys()))
            if extras:
                raise InvalidJSONError(f"Unexpected field(s) at {path}: {', '.join(extras)}.")

        for key, child_schema in properties.items():
            if key in value:
                validate_json_value(value[key], child_schema, f"{path}.{key}")

    elif isinstance(value, list):
        items_schema = schema.get("items")
        if items_schema:
            for index, item in enumerate(value):
                validate_json_value(item, items_schema, f"{path}[{index}]")

    elif isinstance(value, str):
        min_length = schema.get("minLength")
        max_length = schema.get("maxLength")
        if min_length is not None and len(value) < min_length:
            raise InvalidJSONError(f"Expected {path} to have length >= {min_length}.")
        if max_length is not None and len(value) > max_length:
            raise InvalidJSONError(f"Expected {path} to have length <= {max_length}.")

    elif _is_number(value):
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if minimum is not None and value < minimum:
            raise InvalidJSONError(f"Expected {path} to be >= {minimum}.")
        if maximum is not None and value > maximum:
            raise InvalidJSONError(f"Expected {path} to be <= {maximum}.")


def _validate_type(value: Any, expected_type: str, path: str) -> None:
    if expected_type == "object" and not isinstance(value, dict):
        raise InvalidJSONError(f"Expected {path} to be an object.")
    if expected_type == "array" and not isinstance(value, list):
        raise InvalidJSONError(f"Expected {path} to be an array.")
    if expected_type == "string" and not isinstance(value, str):
        raise InvalidJSONError(f"Expected {path} to be a string.")
    if expected_type == "boolean" and not isinstance(value, bool):
        raise InvalidJSONError(f"Expected {path} to be a boolean.")
    if expected_type == "integer" and not _is_integer(value):
        raise InvalidJSONError(f"Expected {path} to be an integer.")
    if expected_type == "number" and not _is_number(value):
        raise InvalidJSONError(f"Expected {path} to be a number.")
    if expected_type == "null" and value is not None:
        raise InvalidJSONError(f"Expected {path} to be null.")


def _is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value: Any) -> bool:
    return (isinstance(value, int) or isinstance(value, float)) and not isinstance(value, bool)
