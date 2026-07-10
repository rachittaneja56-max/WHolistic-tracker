# Personal Dev KG

Personal Dev KG is a monorepo for a personal developer knowledge graph. Everything lives on one stable substrate: `entities` for captured knowledge and work items, `links` for graph relationships, `sessions` for activity, `reviews` for recall history, and `comprehension_checks` for AI-assisted verification.

The current build includes:
- Phase 0 foundation in FastAPI, React, Postgres, pgvector, Alembic, Tailwind, and shadcn-style UI.
- Phase 1 tracker views for DSA, projects, subjects, Today, and task-to-TIL capture.
- Phase 2 embeddings, similarity search, graph view, and confidence decay.
- Phase 3 safe AI infrastructure with provider abstraction, prompts, JSON output validation, and suggestion-only agents.
- Phase 4 rich content support, GitHub webhook activity, PR-to-TIL drafts, CLI capture, and comprehension checks.
- Phase 5 weekly digest, tag taxonomy, analytics, CI visibility, and the weekly analyst brief.

## Architecture

- Backend: `apps/api`
- Frontend: `apps/web`
- CLI capture tool: `packages/klog`
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
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
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
CLI_CAPTURE_TOKEN=
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

## CLI `klog` Usage

1. Set a capture token in `apps/api/.env`:

```env
CLI_CAPTURE_TOKEN=replace-me
```

2. Use the CLI locally:

```powershell
$env:KLOG_API_URL="http://localhost:8000"
$env:KLOG_TOKEN="replace-me"
node packages/klog/index.mjs "learned why pgvector cosine distance matters" --type til --tags pgvector,embeddings
node packages/klog/index.mjs "fix graph layout bug" --type task --project personal-dev-kg
```

Optional install:

```powershell
npm install -g ./packages/klog
klog "capture from anywhere" --type note --tags quick-capture
```

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
