from __future__ import annotations

import json
import socket
from http import HTTPStatus
from typing import TypedDict
from urllib import error, request

from app.agents.schemas.common import AgentStatusRead, JsonSchema
from app.agents.utils.exceptions import AgentDisabledError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.agents.utils.json_output import parse_and_validate_json_output
from app.agents.utils.logging import get_agent_logger, log_agent_event
from app.core.config import settings

logger = get_agent_logger("provider")
CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_TIMEOUT_SECONDS = 30


class AgentMessage(TypedDict):
    role: str
    content: str


class OpenAIProvider:
    def __init__(self, *, api_key: str, fast_model: str, smart_model: str, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.api_key = api_key
        self.fast_model = fast_model
        self.smart_model = smart_model
        self.timeout_seconds = timeout_seconds
        self.provider_name = "openai"

    def generate_text(self, messages: list[AgentMessage], temperature: float = 0.2, max_tokens: int = 800) -> str:
        payload = {
            "model": self.fast_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        response_payload = self._post_json(payload)
        return self._extract_message_text(response_payload)

    def generate_json(
        self,
        messages: list[AgentMessage],
        json_schema: JsonSchema,
        temperature: float = 0.1,
        max_tokens: int = 600,
    ) -> dict[str, object]:
        schema_name = str(json_schema.get("title") or "agent_json_output").replace(" ", "_")
        payload = {
            "model": self.fast_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "strict": True,
                    "schema": json_schema,
                },
            },
        }
        response_payload = self._post_json(payload)
        raw_text = self._extract_message_text(response_payload)
        return parse_and_validate_json_output(raw_text, json_schema)

    def _post_json(self, payload: dict[str, object]) -> dict[str, object]:
        body = json.dumps(payload).encode("utf-8")
        req = request.Request(
            CHAT_COMPLETIONS_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = _read_error_detail(exc)
            log_agent_event(logger, 40, "provider_http_error", status=exc.code, detail=detail)
            if exc.code == HTTPStatus.UNAUTHORIZED:
                raise MissingAPIKeyError("OpenAI rejected the API key. Check OPENAI_API_KEY.") from exc
            raise ModelResponseError(f"OpenAI request failed with status {exc.code}: {detail}") from exc
        except error.URLError as exc:
            if isinstance(exc.reason, socket.timeout):
                log_agent_event(logger, 40, "provider_timeout", reason=exc.reason)
                raise ProviderTimeoutError("The AI provider timed out.") from exc
            log_agent_event(logger, 40, "provider_unavailable", reason=exc.reason)
            raise ModelResponseError(f"Unable to reach the AI provider: {exc.reason}") from exc
        except TimeoutError as exc:
            log_agent_event(logger, 40, "provider_timeout", reason="timeout")
            raise ProviderTimeoutError("The AI provider timed out.") from exc

        try:
            parsed = json.loads(response_body)
        except json.JSONDecodeError as exc:
            log_agent_event(logger, 40, "provider_invalid_response", body=response_body[:400])
            raise ModelResponseError("The AI provider returned malformed JSON.") from exc

        if not isinstance(parsed, dict):
            raise ModelResponseError("The AI provider returned an unexpected response payload.")
        return parsed

    def _extract_message_text(self, response_payload: dict[str, object]) -> str:
        choices = response_payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ModelResponseError("The AI provider returned no choices.")

        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            raise ModelResponseError("The AI provider returned an invalid choice payload.")

        message = first_choice.get("message")
        if not isinstance(message, dict):
            raise ModelResponseError("The AI provider returned no message content.")

        refusal = message.get("refusal")
        if isinstance(refusal, str) and refusal.strip():
            raise ModelResponseError(f"The AI provider refused the request: {refusal.strip()}")

        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()

        if isinstance(content, list):
            text_parts: list[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    text_parts.append(text.strip())
            if text_parts:
                return "\n".join(text_parts)

        raise ModelResponseError("The AI provider returned an empty message.")


def get_agent_status_snapshot() -> AgentStatusRead:
    api_key_configured = bool(settings.openai_api_key and settings.openai_api_key.strip())
    provider_ready = bool(settings.ai_enabled and api_key_configured)
    disabled_reason = None

    if not settings.ai_enabled:
        disabled_reason = "AI is disabled. Set AI_ENABLED=true to enable agent endpoints."
    elif not api_key_configured:
        disabled_reason = "OPENAI_API_KEY is missing. Configure it before using agent endpoints."

    return AgentStatusRead(
        ai_enabled=settings.ai_enabled,
        provider_ready=provider_ready,
        api_key_configured=api_key_configured,
        fast_model=settings.openai_model_fast,
        smart_model=settings.openai_model_smart,
        disabled_reason=disabled_reason,
    )


def get_ai_provider() -> OpenAIProvider:
    if not settings.ai_enabled:
        raise AgentDisabledError("AI is disabled. Set AI_ENABLED=true to enable agent endpoints.")

    api_key = (settings.openai_api_key or "").strip()
    if not api_key:
        raise MissingAPIKeyError("OPENAI_API_KEY is missing. Configure it before using agent endpoints.")

    return OpenAIProvider(
        api_key=api_key,
        fast_model=settings.openai_model_fast,
        smart_model=settings.openai_model_smart,
    )


def _read_error_detail(exc: error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8")
    except Exception:
        return exc.reason or "Unknown error"

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return body[:300] or str(exc.reason)

    if isinstance(payload, dict):
        nested_error = payload.get("error")
        if isinstance(nested_error, dict):
            message = nested_error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()

    return body[:300] or str(exc.reason)
