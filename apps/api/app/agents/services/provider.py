from __future__ import annotations

import json
import socket
from http import HTTPStatus
from typing import Protocol, TypedDict
from urllib import error, parse, request

from sqlalchemy.orm import Session

from app.agents.schemas.common import AgentStatusRead, JsonSchema
from app.agents.utils.exceptions import AgentDisabledError, MissingAPIKeyError, ModelResponseError, ProviderTimeoutError
from app.agents.utils.json_output import parse_and_validate_json_output
from app.core.redaction import redact_text
from app.services.runtime_settings import get_ai_api_key, get_settings_status

DEFAULT_TIMEOUT_SECONDS = 30


class AgentMessage(TypedDict):
    role: str
    content: str


class AIProvider(Protocol):
    provider_name: str
    fast_model: str
    smart_model: str
    last_usage: dict[str, int]
    def generate_text(self, messages: list[AgentMessage], temperature: float = .2, max_tokens: int = 800, model: str | None = None) -> str: ...
    def generate_json(self, messages: list[AgentMessage], json_schema: JsonSchema, temperature: float = .1, max_tokens: int = 600, model: str | None = None) -> dict[str, object]: ...


class OpenAIProvider:
    def __init__(self, *, api_key: str, fast_model: str, smart_model: str, provider_name: str = "openai", timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.api_key, self.fast_model, self.smart_model = api_key, fast_model, smart_model
        self.provider_name, self.timeout_seconds, self.last_usage = provider_name, timeout_seconds, {}

    @property
    def url(self) -> str:
        return "https://api.mistral.ai/v1/chat/completions" if self.provider_name == "mistral" else "https://api.openai.com/v1/chat/completions"

    def generate_text(self, messages, temperature=.2, max_tokens=800, model=None):
        return self._extract(self._post({"model": model or self.fast_model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}))

    def generate_json(self, messages, json_schema, temperature=.1, max_tokens=600, model=None):
        schema = {"name": str(json_schema.get("title") or "agent_json_output").replace(" ", "_"), "strict": True, "schema": json_schema}
        payload = {"model": model or self.fast_model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens, "response_format": {"type": "json_schema", "json_schema": schema}}
        return parse_and_validate_json_output(self._extract(self._post(payload)), json_schema)

    def _post(self, payload):
        req = request.Request(self.url, data=json.dumps(payload).encode(), headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}, method="POST")
        data = _send(req, self.timeout_seconds, self.provider_name)
        usage = data.get("usage") or {}; self.last_usage = {k: int(v) for k, v in usage.items() if k in {"prompt_tokens", "completion_tokens", "total_tokens"} and isinstance(v, int)}
        return data

    def _extract(self, data):
        try: content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc: raise ModelResponseError("The AI provider returned no message content.") from exc
        if isinstance(content, str) and content.strip(): return content.strip()
        if isinstance(content, list):
            text = "\n".join(str(x.get("text", "")).strip() for x in content if isinstance(x, dict) and x.get("text"))
            if text: return text
        raise ModelResponseError("The AI provider returned an empty message.")


class GeminiProvider:
    provider_name = "gemini"
    def __init__(self, *, api_key: str, fast_model: str, smart_model: str, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS):
        self.api_key, self.fast_model, self.smart_model, self.timeout_seconds, self.last_usage = api_key, fast_model, smart_model, timeout_seconds, {}

    def generate_text(self, messages, temperature=.2, max_tokens=800, model=None):
        return self._generate(messages, temperature, max_tokens, model, None)

    def generate_json(self, messages, json_schema, temperature=.1, max_tokens=600, model=None):
        return parse_and_validate_json_output(self._generate(messages, temperature, max_tokens, model, json_schema), json_schema)

    def _generate(self, messages, temperature, max_tokens, model, schema):
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
        config = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if schema: config.update({"responseMimeType": "application/json", "responseJsonSchema": schema})
        payload = {"contents": contents, "generationConfig": config}
        if system: payload["systemInstruction"] = {"parts": [{"text": system}]}
        selected = parse.quote(model or self.fast_model, safe="")
        req = request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{selected}:generateContent", data=json.dumps(payload).encode(), headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"}, method="POST")
        data = _send(req, self.timeout_seconds, "gemini")
        usage = data.get("usageMetadata") or {}
        mapping = {"promptTokenCount": "prompt_tokens", "candidatesTokenCount": "completion_tokens", "totalTokenCount": "total_tokens"}
        self.last_usage = {mapping[k]: int(v) for k, v in usage.items() if k in mapping and isinstance(v, int)}
        try: parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError) as exc: raise ModelResponseError("Gemini returned no content.") from exc
        text = "\n".join(p["text"].strip() for p in parts if isinstance(p, dict) and isinstance(p.get("text"), str))
        if not text: raise ModelResponseError("Gemini returned an empty response.")
        return text


def _send(req, timeout, provider):
    try:
        with request.urlopen(req, timeout=timeout) as response: body = response.read().decode()
    except error.HTTPError as exc:
        detail = redact_text(exc.read().decode(errors="replace")[:400])
        if exc.code in (HTTPStatus.UNAUTHORIZED, HTTPStatus.FORBIDDEN): raise MissingAPIKeyError(f"{provider.title()} rejected the API key.") from exc
        raise ModelResponseError(f"{provider.title()} request failed with status {exc.code}: {detail}") from exc
    except error.URLError as exc:
        if isinstance(exc.reason, socket.timeout): raise ProviderTimeoutError("The AI provider timed out.") from exc
        raise ModelResponseError(f"Unable to reach the AI provider: {exc.reason}") from exc
    except TimeoutError as exc: raise ProviderTimeoutError("The AI provider timed out.") from exc
    try: data = json.loads(body)
    except json.JSONDecodeError as exc: raise ModelResponseError("The AI provider returned malformed JSON.") from exc
    if not isinstance(data, dict): raise ModelResponseError("The AI provider returned an unexpected response payload.")
    return data


def get_agent_status_snapshot(db: Session) -> AgentStatusRead:
    status = get_settings_status(db).ai
    return AgentStatusRead(ai_enabled=status.enabled, provider_ready=status.provider_ready, api_key_configured=status.providers[status.provider].configured, fast_model=status.fast_model, smart_model=status.smart_model, disabled_reason=status.disabled_reason)


def get_ai_provider(db: Session) -> AIProvider:
    status = get_settings_status(db).ai
    if not status.enabled: raise AgentDisabledError("AI is disabled in website settings.")
    if not status.providers[status.provider].configured: raise MissingAPIKeyError(f"{status.provider.title()} is not configured.")
    fast_model = status.fast_model
    smart_model = status.smart_model
    if status.model_mode == "fast":
        smart_model = fast_model
    elif status.model_mode == "smart":
        fast_model = smart_model
    values = {"api_key": get_ai_api_key(db, status.provider), "fast_model": fast_model, "smart_model": smart_model}
    if status.provider == "gemini":
        return GeminiProvider(**values)
    return OpenAIProvider(**values, provider_name=status.provider)
