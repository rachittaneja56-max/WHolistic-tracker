from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app
from app.db.session import SessionLocal, engine
from app.models.assistant import AssistantMessage, AssistantProposal, AssistantThread
from app.services.auth import AuthPrincipal


@pytest.fixture
def authenticated_client(monkeypatch):
    """Run complete HTTP workflows with a disposable, tenant-scoped account."""
    user_id, session_id = uuid4(), uuid4()
    principal = AuthPrincipal(user_id=user_id, session_id=session_id, email=f"phase7-{user_id}@example.test", role="user")
    with engine.begin() as connection:
        connection.execute(text('INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES (:id, :name, :email, true)'), {"id": user_id, "name": "Phase 7", "email": principal.email})
    monkeypatch.setattr("app.services.auth.authenticate_bearer", lambda _authorization: principal)
    try:
        with TestClient(app, headers={"Authorization": "Bearer phase7-test"}) as client:
            client.phase7_user_id = user_id
            yield client
    finally:
        # Tenant tables reference the Better Auth user with ON DELETE CASCADE.
        with engine.begin() as connection:
            connection.execute(text('DELETE FROM auth."user" WHERE id = :id'), {"id": user_id})


def create_entity(client: TestClient, entity_type: str, title: str, *, parent_id: str | None = None, metadata: dict | None = None) -> dict:
    response = client.post("/entities", json={"type": entity_type, "title": title, "parent_id": parent_id, "metadata": metadata or {}})
    assert response.status_code == 201, response.text
    return response.json()


def test_authenticated_semester_hierarchy_focus_and_cross_semester_replanning(authenticated_client: TestClient) -> None:
    client = authenticated_client
    semester = "Fall 2026"
    preferences = client.patch("/settings/preferences", json={"active_semester": semester})
    assert preferences.status_code == 200
    assert preferences.json()["active_semester"] == semester

    subject = create_entity(client, "subject_topic", "Algorithms", metadata={"term": semester, "exam_date": "2026-12-10"})
    topic = create_entity(client, "subject_topic", "Graphs", parent_id=subject["id"], metadata={"term": semester})
    assignment = create_entity(client, "task", "Graph assignment", parent_id=topic["id"], metadata={"academic_kind": "assignment", "estimated_minutes": 90, "priority": "high", "due_at": "2026-10-01T17:00:00+00:00"})
    semester_two = create_entity(client, "subject_topic", "Algorithms", metadata={"term": "Spring 2027"})
    create_entity(client, "note", "Graphs revision across semesters", parent_id=semester_two["id"])

    children = client.get(f"/entities/{subject['id']}/children")
    assert children.status_code == 200
    assert [item["id"] for item in children.json()] == [topic["id"]]

    search = client.get("/entities/search", params={"q": "Graphs", "limit": 20})
    assert search.status_code == 200
    assert {item["entity"]["title"] for item in search.json()["results"]} >= {"Graphs", "Graphs revision across semesters"}

    day = date.today().isoformat()
    start_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    planned = client.post("/daily-plan/confirm", json={"day": day, "available_minutes": 30, "blocks": [{"entity_id": assignment["id"], "planned_minutes": 60, "start_at": start_at, "source": "release-e2e"}]})
    assert planned.status_code == 200, planned.text
    assert planned.json()["is_over_capacity"] is True
    block = planned.json()["blocks"][0]
    replanned = client.post(f"/study-blocks/{block['id']}/reschedule", json={"entity_id": assignment["id"], "planned_minutes": 25, "start_at": start_at, "source": "release-e2e"})
    assert replanned.status_code == 200
    assert replanned.json()["planned_minutes"] == 25

    focus = client.post("/focus-sessions", json={"entity_id": assignment["id"], "planned_minutes": 25, "source": "release-e2e"})
    assert focus.status_code == 201, focus.text
    completed = client.post(f"/focus-sessions/{focus.json()['id']}/complete")
    assert completed.status_code == 200
    reflection = client.put(f"/focus-sessions/{focus.json()['id']}/reflection", json={"accomplished": "Mapped graph traversal", "remaining": "Review complexity", "learned": "Use a visited set"})
    assert reflection.status_code == 200
    assert reflection.json()["reflection"]["learned"] == "Use a visited set"


def test_authenticated_dsa_recall_and_project_til_workflows(authenticated_client: TestClient) -> None:
    client = authenticated_client
    problem = create_entity(client, "dsa_problem", "Two Sum", metadata={"status": "solved", "review_date": date.today().isoformat(), "recall_enabled": True})
    due = client.get("/recall/due")
    assert due.status_code == 200
    assert problem["id"] in {item["entity"]["id"] for item in due.json()}
    preview = client.post(f"/recall/{problem['id']}/grade/preview", json={"answer": "Use a hash map of complements.", "self_score": 4})
    assert preview.status_code == 200, preview.text
    assert preview.json()["mutates_state"] is False
    applied = client.post(f"/recall/{problem['id']}/grade/apply", json={"answer": "Use a hash map of complements.", "confirmed_score": 4})
    assert applied.status_code == 200, applied.text
    assert applied.json()["recalled_score"] == 4

    project = create_entity(client, "project", "Release hardening", metadata={"status": "active"})
    task = create_entity(client, "task", "Ship accessibility fixes", parent_id=project["id"], metadata={"status": "in_progress", "priority": "high"})
    completed = client.patch(f"/entities/{task['id']}", json={"metadata": {"status": "done"}})
    assert completed.status_code == 200, completed.text
    til = create_entity(client, "til", "TIL: focus recovery needs retry state", metadata={"source_task_id": task["id"]})
    workspace = client.get(f"/projects/{project['id']}/tracker")
    assert workspace.status_code == 200, workspace.text
    summary = workspace.json()["summary"]
    assert summary["completed_task_count"] == 1
    assert summary["til_coverage_percent"] == 100
    assert til["id"] in {item["id"] for item in workspace.json()["knowledge"]}


def test_authenticated_proposal_review_and_application(authenticated_client: TestClient) -> None:
    client = authenticated_client
    user_id = client.phase7_user_id
    db = SessionLocal()
    db.info["user_id"] = user_id
    try:
        thread = AssistantThread(id=uuid4(), title="Release planning")
        source = AssistantMessage(id=uuid4(), thread_id=thread.id, role="assistant", content="Review this proposal", model_stage="smart", payload={"kind": "proposal"})
        action = {
            "id": "capture-release-note",
            "action_type": "create_entity",
            "entity_type": "note",
            "parent_id": None,
            "title": "Proposal-created release note",
            "content": "Reviewed and explicitly applied through the assistant proposal flow.",
            "content_type": "markdown",
            "tags": ["release"],
            "difficulty": None,
            "status": None,
            "summary": "Capture the release decision",
            "why": "It keeps a durable record.",
        }
        proposal = AssistantProposal(id=uuid4(), thread_id=thread.id, source_message_id=source.id, status="pending", actions=[action], result={}, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10))
        proposal_id = proposal.id
        db.add_all([thread, source, proposal])
        db.commit()
    finally:
        db.close()

    reviewed = client.patch(f"/assistant/proposals/{proposal_id}", json={"actions": [action]})
    assert reviewed.status_code == 200, reviewed.text
    applied = client.post(f"/assistant/proposals/{proposal_id}/execute", json={"idempotency_key": "phase7-proposal-apply", "action_ids": ["capture-release-note"]})
    assert applied.status_code == 200, applied.text
    assert applied.json()["status"] == "executed"
    assert applied.json()["results"][0]["status"] == "created"
    created_id = applied.json()["results"][0]["entity_id"]
    created = client.get(f"/entities/{created_id}")
    assert created.status_code == 200
    assert created.json()["title"] == "Proposal-created release note"
