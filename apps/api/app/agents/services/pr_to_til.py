from __future__ import annotations

import json
from typing import Any
from sqlalchemy.orm import Session

from app.agents.services.provider import OpenAIProvider
from app.agents.utils.prompts import build_system_prompt
from app.models.session import ActivitySession
from app.services.github import fetch_pull_request_diff_summary, sanitize_tags

PR_TO_TIL_SCHEMA = {
    "title": "github_pr_to_til_draft",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 160},
        "content": {"type": "string", "minLength": 1, "maxLength": 3000},
        "tags": {
            "type": "array",
            "items": {"type": "string", "minLength": 1, "maxLength": 48},
            "maxItems": 8,
        },
    },
    "required": ["title", "content", "tags"],
}


def draft_til_from_pr_session(session_row: ActivitySession, *, db: Session, provider: OpenAIProvider | None) -> tuple[dict[str, Any], bool]:
    meta = dict(session_row.meta or {})
    cached_draft = meta.get("github_til_draft")
    if isinstance(cached_draft, dict):
        normalized = normalize_draft_payload(cached_draft)
        if normalized is not None:
            return normalized, bool(meta.get("github_til_draft_used_ai"))

    if provider is None:
        return build_deterministic_draft(meta), False

    diff_summary = fetch_pull_request_diff_summary(db, meta)
    context = build_pr_context(meta, diff_summary)
    payload = provider.generate_json(
        messages=[
            {"role": "system", "content": build_system_prompt("pr_to_til.md")},
            {
                "role": "user",
                "content": (
                    "Create a careful starter TIL draft using only this merged pull request context. "
                    "If the context is thin, keep the draft generic and explicitly mark unknowns as needing user confirmation.\n\n"
                    f"Context:\n{json.dumps(context, ensure_ascii=True, sort_keys=True)}"
                ),
            },
        ],
        json_schema=PR_TO_TIL_SCHEMA,
        temperature=0.2,
        max_tokens=700,
        model=provider.fast_model,
    )
    normalized = normalize_draft_payload(payload)
    if normalized is None:
        return build_deterministic_draft(meta), False
    return normalized, True



def build_deterministic_draft(meta: dict[str, Any]) -> dict[str, Any]:
    pr_title = str(meta.get("pr_title") or "Merged pull request").strip()
    pr_number = meta.get("pr_number")
    repo_full_name = str(meta.get("repo_full_name") or "unknown repo").strip()
    pr_body = str(meta.get("pr_body") or "").strip()
    head_ref = str(meta.get("head_ref") or "").strip()
    base_ref = str(meta.get("base_ref") or "").strip()
    branch_line = f"- Branches: `{head_ref or 'unknown'}` -> `{base_ref or 'unknown'}`"
    summary_line = f"- PR: #{pr_number} in `{repo_full_name}`" if isinstance(pr_number, int) else f"- Repo: `{repo_full_name}`"

    content_lines = [
        "## Draft",
        "This is a starter draft from merged GitHub activity. Review and rewrite anything that overstates what you actually learned.",
        "",
        "## What changed",
        summary_line,
        branch_line,
    ]
    if pr_body:
        content_lines.extend(["", "## PR context", pr_body[:900]])
    content_lines.extend(
        [
            "",
            "## What I learned",
            "- Replace this line with the concrete lesson or debugging insight you want to keep.",
            "- Add one detail about what you would reuse or watch out for next time.",
        ]
    )

    tags = sanitize_tags([
        "til",
        "github",
        repo_full_name.split("/")[-1] if "/" in repo_full_name else repo_full_name,
    ])
    return {
        "title": f"TIL draft: {pr_title}"[:160],
        "content": "\n".join(content_lines).strip(),
        "tags": tags,
    }



def build_pr_context(meta: dict[str, Any], diff_summary: Any) -> dict[str, Any]:
    context = {
        "repo_full_name": meta.get("repo_full_name"),
        "repo_html_url": meta.get("repo_html_url"),
        "pr_number": meta.get("pr_number"),
        "pr_title": meta.get("pr_title"),
        "pr_body": meta.get("pr_body"),
        "pr_html_url": meta.get("pr_html_url"),
        "head_ref": meta.get("head_ref"),
        "base_ref": meta.get("base_ref"),
        "merged_at": meta.get("merged_at"),
        "sender_login": meta.get("sender_login"),
        "project_title": meta.get("project_title"),
    }
    if diff_summary is not None:
        context["diff_summary"] = {
            "files_changed": diff_summary.files_changed,
            "summary": diff_summary.summary,
        }
    return context



def normalize_draft_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    title = payload.get("title")
    content = payload.get("content")
    raw_tags = payload.get("tags")
    if not isinstance(title, str) or not title.strip() or not isinstance(content, str) or not content.strip() or not isinstance(raw_tags, list):
        return None

    tags = sanitize_tags([tag for tag in raw_tags if isinstance(tag, str)])
    return {
        "title": title.strip()[:160],
        "content": content.strip()[:3000],
        "tags": tags,
    }
