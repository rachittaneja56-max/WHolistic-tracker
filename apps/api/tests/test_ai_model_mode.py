from app.agents.services import provider as provider_module
from app.schemas.settings import AiProviderStatusRead, AiStatusRead, SettingsStatusRead, GithubStatusRead, WebSearchStatusRead


def _status(mode: str) -> SettingsStatusRead:
    return SettingsStatusRead(
        ai=AiStatusRead(
            enabled=True,
            provider="openai",
            model_mode=mode,
            openai_configured=True,
            providers={
                "openai": AiProviderStatusRead(configured=True, fast_model="fast-model", smart_model="smart-model"),
                "gemini": AiProviderStatusRead(configured=False, fast_model="gemini-fast", smart_model="gemini-smart"),
                "mistral": AiProviderStatusRead(configured=False, fast_model="mistral-fast", smart_model="mistral-smart"),
            },
            provider_ready=True,
            fast_model="fast-model",
            smart_model="smart-model",
        ),
        github=GithubStatusRead(enabled=False, webhook_secret_configured=False, access_token_configured=False),
        web_search=WebSearchStatusRead(enabled=False, provider=None, api_key_configured=False),
    )


def test_global_model_mode_overrides_provider_tiers(monkeypatch) -> None:
    monkeypatch.setattr(provider_module, "get_ai_api_key", lambda db, provider: "test-key")
    for mode, expected_fast, expected_smart in [
        ("auto", "fast-model", "smart-model"),
        ("fast", "fast-model", "fast-model"),
        ("smart", "smart-model", "smart-model"),
    ]:
        monkeypatch.setattr(provider_module, "get_settings_status", lambda db, value=_status(mode): value)
        client = provider_module.get_ai_provider(object())
        assert client.fast_model == expected_fast
        assert client.smart_model == expected_smart
