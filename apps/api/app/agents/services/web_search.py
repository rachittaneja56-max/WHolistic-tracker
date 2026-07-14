from __future__ import annotations

import json
from http import HTTPStatus
from typing import TypedDict
from urllib import error, request

from app.core.config import settings


class WebSearchResult(TypedDict):
    name: str
    url: str | None
    note: str


class TavilyWebSearchProvider:
    provider_name = "tavily"

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def search(self, query: str, *, limit: int = 5) -> list[WebSearchResult]:
        body = json.dumps(
            {
                "api_key": self.api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": max(1, min(limit, 8)),
                "include_answer": False,
                "include_images": False,
            }
        ).encode("utf-8")
        req = request.Request(
            "https://api.tavily.com/search",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")[:300]
            raise RuntimeError(f"Web search failed with status {exc.code}: {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"Web search provider is unavailable: {exc}") from exc

        if not isinstance(payload, dict):
            raise RuntimeError("Web search provider returned an unexpected payload")

        raw_results = payload.get("results")
        if not isinstance(raw_results, list):
            return []

        results: list[WebSearchResult] = []
        for item in raw_results[:limit]:
            if not isinstance(item, dict):
                continue
            title = item.get("title") if isinstance(item.get("title"), str) else "Untitled product"
            url = item.get("url") if isinstance(item.get("url"), str) else None
            content = item.get("content") if isinstance(item.get("content"), str) else ""
            results.append({"name": title.strip()[:160], "url": url, "note": content.strip()[:240] or "Related result from web search."})
        return results


class DisabledWebSearchProvider:
    provider_name = "disabled"

    def search(self, query: str, *, limit: int = 5) -> list[WebSearchResult]:
        return []



def get_web_search_provider(db):
    from app.services.runtime_settings import get_settings_status, get_web_search_credential
    status = get_settings_status(db).web_search
    if not status.enabled:
        return None, "Web search not configured. Graph-based validation still works."

    if settings.web_search_provider == "tavily":
        api_key = get_web_search_credential(db)
        if not api_key:
            return None, "Web search is enabled but this user has not configured an API key. Graph-based validation still works."
        return TavilyWebSearchProvider(api_key), None

    return None, "Web search provider is not supported in this environment."
