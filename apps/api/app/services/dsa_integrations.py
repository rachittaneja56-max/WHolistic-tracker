from __future__ import annotations

from dataclasses import dataclass, field
import logging
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Protocol
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.activity import record_session
from app.models.app_setting import AppSetting
from app.models.entity import Entity
from app.schemas.dsa_integrations import DsaConnection, Platform
from app.services.embeddings import update_entity_embedding

SETTING_KEY = "dsa_integrations"
PUBLIC_LEETCODE_DEPRECATION_MESSAGE = (
    "Public-profile LeetCode sync is deprecated because the third-party feed is unreliable. "
    "Use the Personal Dev KG browser extension for LeetCode imports."
)
logger = logging.getLogger(__name__)


@dataclass
class ImportedProblem:
    external_id: str
    title: str
    url: str
    difficulty: str | None = None
    tags: list[str] = field(default_factory=list)
    accepted: bool = True
    submission_count: int = 1
    first_solved_at: str | None = None
    last_submitted_at: str | None = None
    solution_code: str | None = None
    language: str | None = None
    notes: str | None = None


class PlatformAdapter(Protocol):
    platform: Platform
    def fetch(self, connection: DsaConnection) -> list[ImportedProblem]: ...


def _iso_timestamp(value: Any) -> str | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    return value if isinstance(value, str) else None


def _client() -> httpx.Client:
    return httpx.Client(timeout=20.0, follow_redirects=True, headers={"User-Agent": "PersonalDevKG/1.0"})



class CodeforcesAdapter:
    platform: Platform = "codeforces"

    def fetch(self, connection: DsaConnection) -> list[ImportedProblem]:
        with _client() as client:
            submissions: list[dict[str, Any]] = []
            offset = 1
            while True:
                response = client.get("https://codeforces.com/api/user.status", params={"handle": connection.username, "from": offset, "count": 1000})
                response.raise_for_status()
                payload = response.json()
                if payload.get("status") != "OK":
                    raise RuntimeError(payload.get("comment") or "Codeforces rejected the request")
                page = payload.get("result", [])
                submissions.extend(page)
                if len(page) < 1000:
                    break
                offset += len(page)
                time.sleep(2)
        grouped: dict[str, ImportedProblem] = {}
        for submission in submissions:
            problem = submission.get("problem") or {}
            contest_id, index = problem.get("contestId"), problem.get("index")
            if contest_id is None or not index:
                continue
            external_id = f"{contest_id}:{index}"
            timestamp = _iso_timestamp(submission.get("creationTimeSeconds"))
            current = grouped.setdefault(external_id, ImportedProblem(external_id, str(problem.get("name") or external_id), f"https://codeforces.com/problemset/problem/{contest_id}/{index}", str(problem["rating"]) if problem.get("rating") else None, list(problem.get("tags") or []), False, 0))
            current.submission_count += 1
            current.accepted = current.accepted or submission.get("verdict") == "OK"
            if timestamp:
                current.last_submitted_at = max(current.last_submitted_at or timestamp, timestamp)
                if submission.get("verdict") == "OK":
                    current.first_solved_at = min(current.first_solved_at or timestamp, timestamp)
            if submission.get("sourceCode") and submission.get("verdict") == "OK":
                current.solution_code, current.language = submission["sourceCode"], submission.get("programmingLanguage")
        return list(grouped.values())


class LeetCodeAdapter:
    """Compatibility marker for the retired public-profile import path."""

    platform: Platform = "leetcode"

    def fetch(self, connection: DsaConnection) -> list[ImportedProblem]:
        _ = connection
        raise RuntimeError(PUBLIC_LEETCODE_DEPRECATION_MESSAGE)


class _CodeChefProblemParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.items: list[tuple[str, str]] = []
        self.href: str | None = None
        self.text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        href = dict(attrs).get("href") if tag == "a" else None
        if href and "/problems/" in href:
            self.href, self.text = href, []

    def handle_data(self, data: str) -> None:
        if self.href is not None:
            self.text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.href is not None:
            self.items.append((self.href, " ".join("".join(self.text).split())))
            self.href = None


class CodeChefAdapter:
    platform: Platform = "codechef"

    def fetch(self, connection: DsaConnection) -> list[ImportedProblem]:
        with _client() as client:
            response = client.get(f"https://www.codechef.com/users/{connection.username}")
            response.raise_for_status()
            body = response.text
        parser = _CodeChefProblemParser()
        parser.feed(body)
        results: dict[str, ImportedProblem] = {}
        for raw_url, title in parser.items:
            slug = raw_url.rstrip("/").split("/")[-1]
            if slug and slug not in results:
                results[slug] = ImportedProblem(slug, title or slug, raw_url if raw_url.startswith("http") else f"https://www.codechef.com{raw_url}")
        return list(results.values())


ADAPTERS: dict[Platform, PlatformAdapter] = {"leetcode": LeetCodeAdapter(), "codeforces": CodeforcesAdapter(), "codechef": CodeChefAdapter()}


def _setting(db: Session) -> AppSetting:
    user_id = db.info.get("user_id")
    if user_id is None:
        raise ValueError("User context is required for DSA integrations")
    row = db.get(AppSetting, (user_id, SETTING_KEY))
    if row is None:
        row = AppSetting(user_id=user_id, key=SETTING_KEY, value={"connections": []})
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_connections(db: Session) -> list[dict[str, Any]]:
    return list((_setting(db).value or {}).get("connections") or [])


def save_connections(db: Session, connections: list[DsaConnection]) -> None:
    old = {item.get("platform"): item for item in get_connections(db)}
    row = _setting(db)
    row.value = {"connections": [{**connection.model_dump(), "last_synced_at": old.get(connection.platform, {}).get("last_synced_at"), "last_error": None} for connection in connections]}
    db.commit()


def _validate_profile_url(connection: DsaConnection) -> None:
    if not connection.profile_url:
        return
    expected = {"leetcode": "leetcode.com", "codeforces": "codeforces.com", "codechef": "codechef.com"}[connection.platform]
    parsed = urlparse(connection.profile_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc.endswith(expected):
        raise ValueError(f"Invalid {connection.platform} profile URL")


def sync_connections(db: Session) -> list[dict[str, Any]]:
    configured = {item.get("platform"): item for item in get_connections(db) if item.get("enabled", True)}
    results: list[dict[str, Any]] = []
    for platform, raw in configured.items():
        now = datetime.now(timezone.utc).isoformat()
        if platform == "leetcode":
            raw["last_error"] = None
            results.append({
                "platform": "leetcode",
                "status": "skipped",
                "skipped_count": 0,
                "message": PUBLIC_LEETCODE_DEPRECATION_MESSAGE,
            })
            continue
        try:
            connection = DsaConnection.model_validate({key: raw.get(key) for key in ("platform", "username", "profile_url", "enabled") if key in raw})
            _validate_profile_url(connection)
            imported = ADAPTERS[platform].fetch(connection)
            existing = db.scalars(select(Entity).where(Entity.type == "dsa_problem")).all()
            by_key = {((entity.entity_metadata or {}).get("integration") or {}).get("external_key"): entity for entity in existing}
            created = updated = 0
            for problem in imported:
                key = f"{platform}:{problem.external_id}"
                entity = by_key.get(key)
                metadata = dict(entity.entity_metadata or {}) if entity else {}
                metadata["integration"] = {**(metadata.get("integration") or {}), "platform": platform, "external_id": problem.external_id, "external_key": key, "url": problem.url, "accepted": problem.accepted, "submission_count": problem.submission_count, "first_solved_at": problem.first_solved_at, "last_submitted_at": problem.last_submitted_at, "language": problem.language, "last_imported_at": now}
                if problem.difficulty:
                    metadata["source_difficulty"] = problem.difficulty
                    if not metadata.get("difficulty") or entity is None:
                        metadata["difficulty"] = problem.difficulty
                if problem.solution_code and not metadata.get("solution_code"):
                    metadata["solution_code"] = problem.solution_code
                if entity:
                    entity.entity_metadata = metadata
                    if not entity.tags and problem.tags:
                        entity.tags = problem.tags
                    updated += 1
                else:
                    entity = Entity(id=uuid4(), type="dsa_problem", title=problem.title, content=problem.notes or "", content_type="markdown", tags=problem.tags, confidence_score=1.0, entity_metadata={**metadata, "difficulty": problem.difficulty})
                    db.add(entity)
                    created += 1
                db.flush()
                try:
                    update_entity_embedding(entity.id, db=db)
                except Exception:
                    pass
            record_session(db, entity_id=None, action="dsa_platform_sync", meta={"platform": platform, "imported": created, "updated": updated})
            raw["last_synced_at"], raw["last_error"] = now, None
            results.append({"platform": platform, "status": "synced", "imported_count": created, "updated_count": updated})
        except Exception as exc:
            logger.exception("DSA platform sync failed for %s", platform)
            raw["last_error"] = str(exc)[:500]
            results.append({"platform": platform, "status": "failed", "message": "Something went wrong"})
    db.commit()
    return results
