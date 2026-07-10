# Personal Dev KG

Monorepo for a personal knowledge graph with:
- `apps/api`: FastAPI + SQLAlchemy + Alembic
- `apps/web`: React + TypeScript + Vite + Tailwind + shadcn-style UI components
- `packages/klog`: small CLI capture client
- `docker-compose.yml`: Postgres with pgvector and Redis

## What is included

This repo currently covers the stable foundation plus the implemented Phase 1-4 layers from `PROJECT_BRIEF.md`:
- Stable schema tables: `entities`, `links`, `sessions`, `reviews`, `comprehension_checks`
- Dashboard and tracker views built on the shared `entities` table
- Embedding generation and pgvector similarity search
- Cytoscape graph view with confidence decay support
- Reviewable agent infrastructure with provider abstraction and prompt files
- Rich content editors for locks and canvas_json`r
- Weekly digest, tag taxonomy, and coverage-gap surfaces built from existing graph data
- Single-webhook GitHub integration that stores PR/push activity in `sessions`
- Idea validation against your own graph with optional web-search provider support
- AI assist level on tasks plus comprehension debt workflows
- CLI capture endpoint and `klog` client

## Prerequisites

- Docker Desktop
- Python 3.13+ with `pip`
- Node.js 22+
- npm 11+

## Local runbook

### 1. Start local services

From the repo root:

```powershell
docker compose up -d
```

Services:
- Postgres on `localhost:5433`
- Redis on `localhost:6379`

### 2. Set up and run the backend

From `apps/api`:

```powershell
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Optional local semantic backend:

```powershell
python -m pip install -r requirements-embeddings.txt
```

Backend URLs:
- API: `http://localhost:8000`
- Health: `http://localhost:8000/health`
- Docs: `http://localhost:8000/docs`

### 3. Set up and run the frontend

From `apps/web`:

```powershell
copy .env.example .env
npm install
npm run dev
```

Frontend URL:
- App: `http://localhost:5173`

### 4. Optional AI and search configuration

Add these in `apps/api/.env` only when you want them:

```env
AI_ENABLED=true
OPENAI_API_KEY=...
OPENAI_MODEL_FAST=gpt-4.1-mini
OPENAI_MODEL_SMART=gpt-4.1
WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER=tavily
TAVILY_API_KEY=...
```

Behavior notes:
- If `AI_ENABLED=false`, idea validation and comprehension checks still work with deterministic fallback behavior.
- If web search is disabled or unconfigured, the idea validator still returns graph-based validation and includes a clear note that web search is unavailable.

### 5. GitHub webhook setup

1. In `apps/api/.env`, set:

```env
GITHUB_INTEGRATION_ENABLED=true
GITHUB_WEBHOOK_SECRET=your-shared-secret
GITHUB_ACCESS_TOKEN=
```

2. Make sure each relevant `project` entity has `metadata.repo_url`.
3. In the GitHub repo settings, add a webhook:
   - Payload URL: `http://YOUR_HOST:8000/webhooks/github`
   - Content type: `application/json`
   - Secret: same value as `GITHUB_WEBHOOK_SECRET`
   - Events: `Pull requests` and `Pushes`

### 6. CLI capture setup

1. In `apps/api/.env`, set:

```env
CLI_CAPTURE_TOKEN=replace-me
```

2. Use the local CLI directly:

```powershell
$env:KLOG_API_URL="http://localhost:8000"
$env:KLOG_TOKEN="replace-me"
node packages/klog/index.mjs "learned why pgvector cosine distance matters" --type til --tags pgvector,embeddings
node packages/klog/index.mjs "fix graph layout bug" --type task --project personal-dev-kg
```

3. Optional local bin install:

```powershell
npm install -g ./packages/klog
klog "capture from anywhere" --type note --tags quick-capture
```

Optional git hook example:

```bash
#!/usr/bin/env bash
klog "post-commit note: explain what changed and why" --type til --project personal-dev-kg
```

Do not install that automatically. It is only a reference pattern.

## Environment variables

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
CLI_CAPTURE_TOKEN=
```

### `apps/web/.env`

```env
VITE_API_URL=http://localhost:8000
```

## Key flows

### Weekly digest and tags
- `GET /digest/weekly` builds a weekly recap from existing `entities`, `links`, `sessions`, `reviews`, and `comprehension_checks`.
- If AI is enabled and configured, the digest summary uses a strict JSON prompt with the compact weekly context.
- If AI is disabled or unconfigured, the backend returns a deterministic fallback summary.
- `GET /tags/taxonomy` derives tag coverage directly from `entities.tags` with no separate tags table.
- `GET /tags/{tag}/entities` returns the entities currently carrying that tag.

### Idea validator
- `POST /ideas/validate` uses embeddings to retrieve related entities from your own graph.
- It also inspects matching tags plus related project/concept candidates.
- If web search is configured, similar-product results are added as external context.
- Nothing is saved until `POST /ideas/approve` is called.

### Comprehension debt
- Tasks store `metadata.ai_assist_level`.
- `handwritten` means no check required.
- Non-handwritten tasks can generate a comprehension check when they are completed.
- Answering a check can return `passed` or `flagged`.
- Flagged checks reduce task confidence slightly so the task is more likely to reappear in recall-oriented flows.

## Notes

- `parent_id` is used only for hierarchy.
- `links` is reserved for graph-style relationships.
- Embeddings are used for candidate retrieval, not final reasoning.
- GitHub activity is stored in `sessions`, not a separate pull-request table.
- PR-to-TIL drafts are suggestions only. Final TIL entities are created only after approval.
- Idea validation is also suggestion-only. Saving an idea requires explicit approval.
- No new task, note, or idea tables were created.

