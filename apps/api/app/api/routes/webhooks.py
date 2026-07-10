from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.github import GithubWebhookResponse
from app.services.github import ensure_github_integration_enabled, parse_github_payload, record_github_event, verify_github_signature

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/github", response_model=GithubWebhookResponse, status_code=status.HTTP_202_ACCEPTED)
async def github_webhook(
    request: Request,
    db: Session = Depends(get_db),
    github_event: str | None = Header(default=None, alias="X-GitHub-Event"),
    github_signature: str | None = Header(default=None, alias="X-Hub-Signature-256"),
) -> GithubWebhookResponse:
    ensure_github_integration_enabled()
    payload_bytes = await request.body()
    if not verify_github_signature(payload_bytes, github_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid GitHub webhook signature")

    payload = parse_github_payload(payload_bytes)
    event_name = (github_event or "").strip()
    event_record = record_github_event(db, event_name, payload)
    return GithubWebhookResponse(
        accepted=True,
        stored=event_record.stored,
        event=event_name or "unknown",
        action=event_record.action,
        session_id=event_record.session_id,
        project_id=event_record.project_id,
    )
