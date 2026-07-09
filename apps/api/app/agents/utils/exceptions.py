from __future__ import annotations


class AgentProviderError(RuntimeError):
    """Base error for safe agent provider failures."""


class AgentDisabledError(AgentProviderError):
    """Raised when AI features are disabled at the application level."""


class MissingAPIKeyError(AgentProviderError):
    """Raised when a provider is requested without a configured API key."""


class ProviderTimeoutError(AgentProviderError):
    """Raised when the upstream provider times out."""


class InvalidJSONError(AgentProviderError):
    """Raised when model output cannot be parsed into valid JSON."""


class ModelResponseError(AgentProviderError):
    """Raised when the upstream model returns an invalid or unusable response."""
