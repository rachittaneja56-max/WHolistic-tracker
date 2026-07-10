from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib import request
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entity import Entity
from app.models.session import ActivitySession
from app.schemas.analytics import GithubCiStatusItemRead

logger = logging.getLogger(__name__)
GITHUB_SESSION_ACTIONS = ("pr_opened", "pr_merged", "push")
SUPPORTED_PULL_REQUEST_ACTIONS = {"opened", "reopened", "synchronize", "closed"}
TAG_PATTERN = re.compile(r"[^a-z0-9]+")
CI_SESSION_ACTIONS = {"workflow_run", "check_run"}


@dataclass(slots=True)
class MatchedProject:
    entity_id: uuid.UUID | None
    title: str | None


@dataclass(slots=True)
class GithubEventRecord:
    stored: bool
    action: str | None
    session_id: uuid.UUID | None
    project_id: uuid.UUID | None


@dataclass(slots=True)
class PullRequestDiffSummary:
    files_changed: int
    summary: str


def ensure_github_integration_enabled() -> None:
    if not settings.github_integration_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub integration is disabled. Set GITHUB_INTEGRATION_ENABLED=true to enable webhook and feed endpoints.",
        )


def verify_github_signature(payload: bytes, signature_header: str | None) -> bool:
    secret = (settings.github_webhook_secret or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GITHUB_WEBHOOK_SECRET is required when GitHub integration is enabled.",
        )

    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected_signature = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_signature, signature_header)


def parse_github_payload(payload: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid GitHub webhook payload") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub webhook payload must be a JSON object")

    return parsed


def record_github_event(db: Session, event_name: str, payload: dict[str, Any]) -> GithubEventRecord:
    if event_name == "pull_request":
        return _record_pull_request_event(db, payload)
    if event_name == "push":
        return _record_push_event(db, payload)
    if event_name == "workflow_run":
        return _record_workflow_run_event(db, payload)
    if event_name == "check_run":
        return _record_check_run_event(db, payload)
    return GithubEventRecord(stored=False, action=None, session_id=None, project_id=None)


def list_github_feed_sessions(db: Session, *, limit: int = 30) -> list[ActivitySession]:
    return db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action.in_(GITHUB_SESSION_ACTIONS))
        .order_by(ActivitySession.date.desc())
        .limit(limit)
    ).all()


def list_latest_ci_status_items(db: Session) -> list[GithubCiStatusItemRead]:
    sessions = db.scalars(
        select(ActivitySession)
        .where(ActivitySession.action.in_(list(CI_SESSION_ACTIONS)))
        .order_by(ActivitySession.date.desc())
        .limit(500)
    ).all()

    latest_by_repo: dict[tuple[uuid.UUID | None, str], GithubCiStatusItemRead] = {}
    latest_updated_at: dict[tuple[uuid.UUID | None, str], datetime] = {}

    for session_row in sessions:
        meta = session_row.meta or {}
        repo = _get_string(meta, "repo_full_name") or _get_string(meta, "repo_html_url")
        if not repo:
            continue

        updated_at = parse_github_datetime(
            _get_string(meta, "updated_at")
            or _get_string(meta, "completed_at")
            or _get_string(meta, "started_at")
            or _get_string(meta, "created_at")
        ) or session_row.date
        if updated_at is None:
            continue

        key = (session_row.entity_id, repo)
        previous_updated_at = latest_updated_at.get(key)
        if previous_updated_at is not None and previous_updated_at >= updated_at:
            continue

        latest_updated_at[key] = updated_at
        latest_by_repo[key] = GithubCiStatusItemRead(
            project_id=session_row.entity_id,
            project_title=_get_string(meta, "project_title"),
            repo=repo,
            latest_status=_get_string(meta, "status") or "unknown",
            latest_conclusion=_get_string(meta, "conclusion"),
            workflow_name=_get_string(meta, "workflow_name") or _get_string(meta, "check_name") or "unknown",
            url=_get_string(meta, "run_html_url") or _get_string(meta, "details_url") or _get_string(meta, "repo_html_url"),
            updated_at=updated_at,
        )

    return sorted(
        latest_by_repo.values(),
        key=lambda item: item.updated_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


def get_session_or_404(db: Session, session_id: uuid.UUID) -> ActivitySession:
    session_row = db.get(ActivitySession, session_id)
    if session_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session_row


def is_github_pr_merge_session(session_row: ActivitySession) -> bool:
    meta = session_row.meta or {}
    return session_row.action == "pr_merged" and meta.get("source") == "github"


def match_project_for_repo(db: Session, repo_html_url: str | None, repo_full_name: str | None) -> MatchedProject:
    candidate_keys = {key for key in (normalize_repo_identifier(repo_html_url), normalize_repo_identifier(repo_full_name)) if key}
    if not candidate_keys:
        return MatchedProject(entity_id=None, title=None)

    projects = db.scalars(select(Entity).where(Entity.type == "project")).all()
    for project in projects:
        repo_url = (project.entity_metadata or {}).get("repo_url")
        if not isinstance(repo_url, str):
            continue
        project_key = normalize_repo_identifier(repo_url)
        if project_key and project_key in candidate_keys:
            return MatchedProject(entity_id=project.id, title=project.title)

    return MatchedProject(entity_id=None, title=None)


def normalize_repo_identifier(value: str | None) -> str | None:
    if not value or not value.strip():
        return None

    normalized = value.strip().removesuffix("/")
    if normalized.endswith(".git"):
        normalized = normalized[:-4]

    if normalized.startswith("git@github.com:"):
        normalized = normalized.split(":", 1)[1]
    elif "github.com" in normalized:
        parsed = urlparse(normalized if "://" in normalized else f"https://{normalized}")
        normalized = parsed.path.strip("/")

    parts = [part for part in normalized.strip("/").split("/") if part]
    if len(parts) >= 2:
        return f"{parts[-2].lower()}/{parts[-1].lower()}"
    return normalized.lower() or None


def sanitize_tags(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = TAG_PATTERN.sub("-", value.strip().lower()).strip("-")
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned[:48])
    return result


def fetch_pull_request_diff_summary(meta: dict[str, Any]) -> PullRequestDiffSummary | None:
    token = (settings.github_access_token or "").strip()
    repo_full_name = meta.get("repo_full_name")
    pr_number = meta.get("pr_number")
    if not token or not isinstance(repo_full_name, str) or not isinstance(pr_number, int):
        return None

    api_url = f"https://api.github.com/repos/{repo_full_name}/pulls/{pr_number}/files?per_page=20"
    req = request.Request(
        api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "personal-dev-kg",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=20) as response:
            response_body = response.read().decode("utf-8")
    except Exception as exc:
        logger.warning("Unable to fetch GitHub PR diff summary: %s", exc)
        return None

    try:
        payload = json.loads(response_body)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, list):
        return None

    lines: list[str] = []
    for item in payload[:12]:
        if not isinstance(item, dict):
            continue
        filename = item.get("filename")
        status_value = item.get("status")
        additions = item.get("additions")
        deletions = item.get("deletions")
        changes = item.get("changes")
        patch = item.get("patch")
        if isinstance(filename, str):
            lines.append(
                f"- {filename} ({status_value or 'modified'}, +{additions or 0}/-{deletions or 0}, {changes or 0} changes)"
            )
        if isinstance(patch, str) and patch.strip():
            excerpt = patch.strip()
            if len(excerpt) > 400:
                excerpt = excerpt[:400].rstrip() + "..."
            lines.append(excerpt)

    if not lines:
        return None

    summary = "\n".join(lines)
    if len(summary) > 4000:
        summary = summary[:4000].rstrip() + "..."
    return PullRequestDiffSummary(files_changed=len(payload), summary=summary)


def build_github_feed_title(session_row: ActivitySession) -> str | None:
    meta = session_row.meta or {}
    if session_row.action in {"pr_opened", "pr_merged"}:
        return _get_string(meta, "pr_title")
    return _get_string(meta, "head_commit_message")


def build_github_feed_message(session_row: ActivitySession) -> str | None:
    meta = session_row.meta or {}
    if session_row.action in {"pr_opened", "pr_merged"}:
        body = _get_string(meta, "pr_body")
        if body:
            return body
        return f"PR #{meta.get('pr_number')} in {meta.get('repo_full_name') or 'unknown repo'}"
    if session_row.action == "push":
        pusher = _get_string(meta, "pusher") or _get_string(meta, "sender_login") or "unknown"
        commit_count = meta.get("commit_count")
        if isinstance(commit_count, int):
            return f"{commit_count} commit(s) pushed by {pusher}."
        return f"Push activity by {pusher}."
    return None


def build_github_feed_url(session_row: ActivitySession) -> str | None:
    meta = session_row.meta or {}
    if session_row.action in {"pr_opened", "pr_merged"}:
        return _get_string(meta, "pr_html_url")
    return _get_string(meta, "compare_url") or _get_string(meta, "repo_html_url")


def parse_github_datetime(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    raw_value = value.strip()
    if raw_value.endswith("Z"):
        raw_value = raw_value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw_value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _record_pull_request_event(db: Session, payload: dict[str, Any]) -> GithubEventRecord:
    raw_action = payload.get("action")
    if raw_action not in SUPPORTED_PULL_REQUEST_ACTIONS:
        return GithubEventRecord(stored=False, action=None, session_id=None, project_id=None)

    pull_request = payload.get("pull_request")
    repository = payload.get("repository")
    if not isinstance(pull_request, dict) or not isinstance(repository, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub pull_request payload is missing repository data")

    merged = bool(pull_request.get("merged"))
    if raw_action == "closed" and not merged:
        return GithubEventRecord(stored=False, action=None, session_id=None, project_id=None)

    session_action = "pr_merged" if raw_action == "closed" and merged else "pr_opened"
    repo_full_name = _get_string(repository, "full_name")
    repo_html_url = _get_string(repository, "html_url")
    project_match = match_project_for_repo(db, repo_html_url, repo_full_name)

    meta = {
        "source": "github",
        "github_event": "pull_request",
        "github_action": raw_action,
        "repo_full_name": repo_full_name,
        "repo_html_url": repo_html_url,
        "repo_name": _get_string(repository, "name"),
        "pr_number": _get_int(payload, "number"),
        "pr_title": _get_string(pull_request, "title"),
        "pr_body": _get_string(pull_request, "body"),
        "pr_html_url": _get_string(pull_request, "html_url"),
        "base_ref": _get_nested_string(pull_request, "base", "ref"),
        "head_ref": _get_nested_string(pull_request, "head", "ref"),
        "merged": merged,
        "merged_at": _get_string(pull_request, "merged_at"),
        "sender_login": _get_nested_string(payload, "sender", "login"),
        "delivery_id": _get_string(payload, "delivery_id"),
        "project_title": project_match.title,
    }

    session_row = ActivitySession(
        id=uuid.uuid4(),
        entity_id=project_match.entity_id,
        action=session_action,
        meta=meta,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return GithubEventRecord(stored=True, action=session_action, session_id=session_row.id, project_id=project_match.entity_id)


def _record_push_event(db: Session, payload: dict[str, Any]) -> GithubEventRecord:
    repository = payload.get("repository")
    if not isinstance(repository, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub push payload is missing repository data")

    repo_full_name = _get_string(repository, "full_name")
    repo_html_url = _get_string(repository, "html_url")
    project_match = match_project_for_repo(db, repo_html_url, repo_full_name)
    head_commit = payload.get("head_commit") if isinstance(payload.get("head_commit"), dict) else {}
    commits = payload.get("commits") if isinstance(payload.get("commits"), list) else []

    meta = {
        "source": "github",
        "github_event": "push",
        "repo_full_name": repo_full_name,
        "repo_html_url": repo_html_url,
        "repo_name": _get_string(repository, "name"),
        "commit_count": len(commits),
        "head_commit_message": _get_string(head_commit, "message"),
        "head_commit_id": _get_string(head_commit, "id"),
        "head_commit_url": _get_string(head_commit, "url"),
        "compare_url": _get_string(payload, "compare"),
        "ref": _get_string(payload, "ref"),
        "pusher": _get_nested_string(payload, "pusher", "name"),
        "sender_login": _get_nested_string(payload, "sender", "login"),
        "project_title": project_match.title,
    }

    session_row = ActivitySession(
        id=uuid.uuid4(),
        entity_id=project_match.entity_id,
        action="push",
        meta=meta,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return GithubEventRecord(stored=True, action="push", session_id=session_row.id, project_id=project_match.entity_id)


def _record_workflow_run_event(db: Session, payload: dict[str, Any]) -> GithubEventRecord:
    workflow_run = payload.get("workflow_run")
    repository = payload.get("repository")
    if not isinstance(workflow_run, dict) or not isinstance(repository, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub workflow_run payload is missing repository data")

    repo_full_name = _get_string(repository, "full_name")
    repo_html_url = _get_string(repository, "html_url")
    project_match = match_project_for_repo(db, repo_html_url, repo_full_name)

    meta = {
        "source": "github",
        "github_event": "workflow_run",
        "github_action": _get_string(payload, "action"),
        "repo_full_name": repo_full_name,
        "repo_html_url": repo_html_url,
        "repo_name": _get_string(repository, "name"),
        "workflow_name": _get_string(workflow_run, "name"),
        "status": _get_string(workflow_run, "status"),
        "conclusion": _get_string(workflow_run, "conclusion"),
        "run_html_url": _get_string(workflow_run, "html_url"),
        "branch": _get_string(workflow_run, "head_branch"),
        "event": _get_string(workflow_run, "event"),
        "created_at": _get_string(workflow_run, "created_at"),
        "updated_at": _get_string(workflow_run, "updated_at"),
        "sender_login": _get_nested_string(payload, "sender", "login"),
        "project_title": project_match.title,
    }

    session_row = ActivitySession(
        id=uuid.uuid4(),
        entity_id=project_match.entity_id,
        action="workflow_run",
        meta=meta,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return GithubEventRecord(stored=True, action="workflow_run", session_id=session_row.id, project_id=project_match.entity_id)


def _record_check_run_event(db: Session, payload: dict[str, Any]) -> GithubEventRecord:
    check_run = payload.get("check_run")
    repository = payload.get("repository")
    if not isinstance(check_run, dict) or not isinstance(repository, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub check_run payload is missing repository data")

    repo_full_name = _get_string(repository, "full_name")
    repo_html_url = _get_string(repository, "html_url")
    project_match = match_project_for_repo(db, repo_html_url, repo_full_name)

    meta = {
        "source": "github",
        "github_event": "check_run",
        "github_action": _get_string(payload, "action"),
        "repo_full_name": repo_full_name,
        "repo_html_url": repo_html_url,
        "repo_name": _get_string(repository, "name"),
        "check_name": _get_string(check_run, "name"),
        "workflow_name": _get_string(check_run, "name"),
        "status": _get_string(check_run, "status"),
        "conclusion": _get_string(check_run, "conclusion"),
        "details_url": _get_string(check_run, "details_url"),
        "started_at": _get_string(check_run, "started_at"),
        "completed_at": _get_string(check_run, "completed_at"),
        "sender_login": _get_nested_string(payload, "sender", "login"),
        "project_title": project_match.title,
    }

    session_row = ActivitySession(
        id=uuid.uuid4(),
        entity_id=project_match.entity_id,
        action="check_run",
        meta=meta,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return GithubEventRecord(stored=True, action="check_run", session_id=session_row.id, project_id=project_match.entity_id)


def _get_string(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _get_int(payload: dict[str, Any], key: str) -> int | None:
    value = payload.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _get_nested_string(payload: dict[str, Any], *keys: str) -> str | None:
    current: Any = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    if isinstance(current, str):
        stripped = current.strip()
        return stripped or None
    return None
