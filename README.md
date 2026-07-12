# Personal Dev KG

Personal Dev KG is a monorepo for a personal developer knowledge graph. Everything lives on one stable substrate: `entities` for captured knowledge and work items, `links` for graph relationships, `sessions` for activity, `reviews` for recall history, and `comprehension_checks` for AI-assisted verification.

The current build includes:
- Phase 0 foundation in FastAPI, React, Postgres, pgvector, Alembic, Tailwind, and shadcn-style UI.
- Phase 1 tracker views for DSA, projects, subjects, Today, and task-to-TIL capture.
- Phase 2 embeddings, similarity search, graph view, and confidence decay.
- Phase 3 safe AI infrastructure with provider abstraction, prompts, JSON output validation, and suggestion-only agents.
- Phase 4 rich content support, GitHub webhook activity, PR-to-TIL drafts, and comprehension checks.
- Phase 5 weekly digest, tag taxonomy, analytics, CI visibility, and the weekly analyst brief.

## Architecture

- Backend: `apps/api`
- Frontend: `apps/web`
- Local services: `docker-compose.yml`
- Stable schema: `entities`, `links`, `sessions`, `reviews`, `comprehension_checks`

Key rules:
- `parent_id` is only for hierarchy.
- `links` is only for graph relationships.
- Embeddings retrieve candidates. Agents suggest. Users confirm.
- No agent auto-creates final knowledge without an explicit user action.

Additional architecture notes live in:
- `docs/ARCHITECTURE.md`
- `docs/PHASES.md`
- `docs/AGENTS.md`

## Prerequisites

- Docker Desktop
- Python 3.13+
- Node.js 22+
- npm 11+

## Phase 0 Local Runbook

### 1. Start Postgres and Redis

From the repo root:

```powershell
docker compose up -d
```

Services:
- Postgres: `localhost:5433`
- Redis: `localhost:6379`

### 2. Backend setup

From `apps/api`:

```powershell
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Optional local embedding model dependencies:

```powershell
python -m pip install -r requirements-embeddings.txt
```

Backend URLs:
- API: `http://localhost:8000`
- Health: `http://localhost:8000/health`
- OpenAPI docs: `http://localhost:8000/docs`

### 3. Frontend setup

From `apps/web`:

```powershell
copy .env.example .env
npm install
npm run dev
```

Frontend URL:
- App: `http://localhost:5173`

### 4. Useful migration commands

From `apps/api`:

```powershell
alembic current
alembic history
alembic upgrade head
```

## Environment Variables

### `apps/api/.env`

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5433/personal_dev_kg
APP_NAME=Personal Dev KG API
APP_ENV=development
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173
EMBEDDING_BACKEND=auto
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
EMBEDDING_TEXT_MAX_CHARS=8000
AI_ENABLED=false
OPENAI_API_KEY=
OPENAI_MODEL_FAST=gpt-4.1-mini
OPENAI_MODEL_SMART=gpt-4.1
GITHUB_INTEGRATION_ENABLED=false
GITHUB_WEBHOOK_SECRET=
GITHUB_ACCESS_TOKEN=
WEB_SEARCH_ENABLED=false
WEB_SEARCH_PROVIDER=tavily
TAVILY_API_KEY=
LEETCODE_SESSION_COOKIE=optional-private-account-cookie
LEETCODE_CSRF_TOKEN=optional-csrf-token
```

### `apps/web/.env`

```env
VITE_API_URL=http://localhost:8000
```

## AI Setup

Set these in `apps/api/.env` if you want AI-backed JSON generation instead of deterministic fallbacks:

```env
AI_ENABLED=true
OPENAI_API_KEY=your-key
OPENAI_MODEL_FAST=gpt-4.1-mini
OPENAI_MODEL_SMART=gpt-4.1
```

Behavior with AI disabled:
- Daily guidance still works with deterministic prioritization.
- Weekly digest still works with deterministic grouping.
- Analyst brief still works with deterministic trend and gap analysis.
- The app should continue to load normally.

## GitHub Webhook Setup

1. Set these in `apps/api/.env`:

```env
GITHUB_INTEGRATION_ENABLED=true
GITHUB_WEBHOOK_SECRET=your-shared-secret
GITHUB_ACCESS_TOKEN=optional-but-useful
```

2. Make sure each `project` entity uses `metadata.repo_url`.
3. In GitHub repository settings, add a webhook:
- Payload URL: `http://YOUR_HOST:8000/webhooks/github`
- Content type: `application/json`
- Secret: same as `GITHUB_WEBHOOK_SECRET`
- Events: `Pull requests`, `Pushes`, `Workflow runs`, and `Check runs`

GitHub activity is stored in `sessions`. No separate PR, commit, or CI tables are introduced.

## Main Product Flows

### Weekly digest
- `GET /digest/weekly` builds a recap from existing `entities`, `links`, `sessions`, `reviews`, and `comprehension_checks`.
- If AI is enabled, the digest uses strict JSON output from the configured provider.
- If AI is disabled, the backend returns a deterministic summary.

### Weekly analyst brief
- `GET /agents/analyst/weekly` analyzes DSA activity, reviews, gaps, comprehension debt, pending links, project shipping activity, and upcoming deadlines.
- Suggestions never auto-create tasks or notes.
- The frontend opens a prefilled capture flow and still waits for user submission.

### Tags and coverage gaps
- `GET /tags/taxonomy` derives taxonomy information from `entities.tags` only.
- `GET /tags/{tag}/entities` returns entities carrying that tag.

### GitHub capture
- Webhook events are stored in `sessions`.
- Merged PRs can draft a TIL, but the final TIL entity is only created after approval.

## Disabled Mode Safety

- Secrets are never returned to the frontend.
- Missing AI configuration should not crash the app.
- Missing web search configuration should not break graph-backed idea validation.
- Missing embeddings should not crash entity detail, graph, or similarity-driven pages.
- GitHub integration can remain disabled without breaking the rest of the app.
## Owner Authentication and Website Settings

The SPA requires a single-owner session. Normal read APIs remain available, while settings mutations, delete/restore, link deletion, jobs, and manual agent runs require the signed owner session.

Generate an Argon2id password hash interactively:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.scripts.hash_password
```

Copy the printed hash to the backend `.env` together with a long random session secret:

```env
APP_ADMIN_PASSWORD_HASH=<argon2id-hash>
APP_SESSION_SECRET=<long-random-value>
FRONTEND_ORIGIN=http://localhost:5173
```

If locked out, stop the API, generate a replacement hash, update `APP_ADMIN_PASSWORD_HASH`, and restart. Existing sessions become invalid when `APP_SESSION_SECRET` changes.

The frontend environment must contain only:

```env
VITE_API_URL=http://localhost:8000
```

OpenAI, GitHub, database, webhook, web-search, cookie, and authorization secrets are backend-only. `GET /settings/status` returns booleans and model names only. The website AI switch stores only `{"enabled": boolean}` in the singleton `app_settings` row. The existing `AI_ENABLED` value seeds that row once; the database is authoritative afterward.

## Routes

- Primary: `/`, `/capture`
- Trackers: `/trackers/dsa`, `/trackers/projects`, `/trackers/subjects`, `/trackers/subjects/:subjectId`
- Knowledge: `/knowledge/entities`, `/knowledge/entities/:entityId`, `/knowledge/graph`, `/knowledge/tags`, `/knowledge/recall`
- Agents: `/agents/ask-graph`, `/agents/review-inbox`, `/agents/ideas`, `/agents/analyst`
- System: `/settings`
- Secondary: `/insights/weekly`, `/knowledge/recall/comprehension`

Legacy routes redirect to these locations.

## Soft Delete and Restore

`DELETE /entities/{id}` permanently deletes the entity, its descendants, links, history, reviews, and comprehension checks. Entities with children or links require exact-title confirmation at the API boundary.

## Subject Metadata

Subjects and topics remain `subject_topic` entities. A subject has `parent_id=null`; a topic uses its subject as `parent_id`. Supported metadata includes `exam_date`, `status`, `priority`, `syllabus_units`, `progress_percent`, `target_confidence`, `study_sessions_planned`, and optional topic `exam_weightage`. Legacy exam-date-only entities receive safe read defaults.

Full LeetCode imports require the owner-only `LEETCODE_SESSION_COOKIE` and optional `LEETCODE_CSRF_TOKEN` backend environment values. Without them, the public profile API is limited to recent submissions; private submissions, code, and notes are unavailable from a username alone.
