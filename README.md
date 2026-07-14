# Personal Dev KG

Personal Dev KG is a monorepo for a personal developer knowledge graph. Everything lives on one stable substrate: `entities` for captured knowledge and work items, `links` for graph relationships, `sessions` for activity, `reviews` for recall history, and `comprehension_checks` for AI-assisted verification.

The current build includes:
- Phase 0 foundation in FastAPI, React, Postgres, pgvector, Alembic, Tailwind, and shadcn-style UI.
- Phase 1 tracker views for DSA, projects, subjects, Today, and task-to-TIL capture.
- Phase 2 embeddings, similarity search, graph view, and confidence decay.
- Phase 3 safe AI infrastructure with provider abstraction, prompts, JSON output validation, and suggestion-only agents.
- Phase 4 rich content support, GitHub webhook activity, PR-to-TIL drafts, and comprehension checks.
- Phase 5 weekly digest, tag taxonomy, analytics, CI visibility, and the weekly analyst brief.
- Project Tracker V2 with portfolio health, milestone workspaces, a dependency-aware delivery board, timelines, activity evidence, and task-to-learning capture.

## Architecture

- Backend: `apps/api`
- Authentication: `apps/auth` (Better Auth)
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
- `docs/MOBILE_PWA.md`

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

### 3. Better Auth setup

From `apps/auth`:

```powershell
copy .env.example .env
npm install
npm run bootstrap-admin
npm run dev
```

The bootstrap command is one-time and attaches a password to the protected root identity `rachittaneja56@gmail.com`. The password is prompted without being stored in source control. Better Auth runs at `http://localhost:3001`.

### 4. Frontend setup

From `apps/web`:

```powershell
copy .env.example .env
npm install
npm run dev
```

Frontend URL:
- App: `http://localhost:5173`

### 5. Useful migration commands

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
APP_ENCRYPTION_SECRET=<new-random-secret>
AUTH_JWKS_URL=http://localhost:3001/api/auth/jwks
AUTH_JWT_ISSUER=http://localhost:3001
AUTH_JWT_AUDIENCE=personal-dev-kg-api
ROOT_ADMIN_EMAIL=rachittaneja56@gmail.com
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173
EMBEDDING_BACKEND=auto
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
EMBEDDING_TEXT_MAX_CHARS=8000
AI_ENABLED=false
OPENAI_MODEL_FAST=gpt-4.1-mini
OPENAI_MODEL_SMART=gpt-4.1
GITHUB_INTEGRATION_ENABLED=false
WEB_SEARCH_ENABLED=false
WEB_SEARCH_PROVIDER=tavily
```

### `apps/auth/.env`

```env
AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/personal_dev_kg?options=-c%20search_path%3Dauth%2Cpublic
BETTER_AUTH_SECRET=<new-random-secret>
BETTER_AUTH_URL=http://localhost:3001
AUTH_JWT_AUDIENCE=personal-dev-kg-api
FRONTEND_ORIGIN=http://localhost:5173
```

### `apps/web/.env`

```env
VITE_API_URL=http://localhost:8000
VITE_AUTH_URL=http://localhost:3001
```

## AI Setup

Set `AI_ENABLED=true` as the global feature switch, then let each user store their own OpenAI, Gemini, or Mistral key under Settings. Keys are encrypted per workspace and never returned to the browser.

Behavior with AI disabled:
- Daily guidance still works with deterministic prioritization.
- Weekly digest still works with deterministic grouping.
- Analyst brief still works with deterministic trend and gap analysis.
- The app should continue to load normally.

## GitHub Webhook Setup

1. In **Settings → GitHub integration**, enable the integration, save a per-user webhook secret, and optionally add a fine-grained read-only token for PR diff enrichment.

2. Make sure each `project` entity uses `metadata.repo_url`.
3. In GitHub repository settings, add a webhook using the user-specific URL shown in Settings:
- Payload URL: `http://YOUR_HOST:8000/webhooks/github/{webhook_id}`
- Content type: `application/json`
- Secret: the same per-user secret saved in Settings
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

### Project delivery
- `GET /projects/tracker` returns the project portfolio with computed progress, health, blocked and overdue work, shipping activity, TIL coverage, and comprehension debt.
- `GET /projects/{project_id}/tracker` returns a complete project workspace assembled from the existing entity graph.
- Projects contain milestones; milestones contain tasks. Cross-task dependencies remain graph links using `depends_on` or `blocks`.
- Moving a task to Done opens a learning checkpoint so completion can produce a linked TIL and, for AI-assisted work, a comprehension check.
- Today prioritizes overdue and blocked tasks and surfaces projects that are stalled or at risk.

## Disabled Mode Safety

- Secrets are never returned to the frontend.
- Missing AI configuration should not crash the app.
- Missing web search configuration should not break graph-backed idea validation.
- Missing embeddings should not crash entity detail, graph, or similarity-driven pages.
- GitHub integration can remain disabled without breaking the rest of the app.
## Multi-user authentication and reset

Better Auth owns accounts and seven-day HttpOnly sessions in the PostgreSQL `auth` schema. The SPA keeps 15-minute Ed25519 API JWTs in memory only; FastAPI validates issuer, audience, signature, expiry, and the live session/account on every private request. Public sign-up and impersonation are disabled. Users join through hashed, single-use 72-hour invitations created at `/admin`.

Every private application row has a non-null Better Auth `user_id`. SQLAlchemy applies tenant filters automatically and the database enforces same-owner hierarchy, graph, session, review, assistant, setting, webhook, and integration relationships. Admin APIs expose operational metadata and aggregate usage only—not titles, notes, tags, code, prompts, answers, usernames, or secrets.

The root identity is permanently reserved for `rachittaneja56@gmail.com`. A database trigger prevents deleting, banning, demoting, or renaming it. Run `npm run bootstrap-admin` from `apps/auth` once to set its initial password.

The destructive reset is explicit and irreversible:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m app.scripts.reset_for_multiuser --confirm WIPE
.\.venv\Scripts\python.exe -m alembic upgrade head
```

The ownership migration refuses to run while any tenant table contains rows. The reset preserves schemas, extensions, source, and Alembic history but creates no backup. Rotate `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_SECRET`, OAuth, webhook, extension, and integration credentials after a reset.

AI, web-search, GitHub, DSA, and extension credentials are per-user records encrypted with `APP_ENCRYPTION_SECRET`; legacy shared credential fallbacks are not used. The frontend `.env` contains only public origins:

```env
VITE_API_URL=http://localhost:8000
VITE_AUTH_URL=http://localhost:3001
```

## Routes

- Public: `/`, `/login`, `/invite`, `/reset-password`
- Primary workspace: `/app`, `/capture`
- Trackers: `/trackers/dsa`, `/trackers/projects`, `/trackers/projects/:projectId`, `/trackers/subjects`, `/trackers/subjects/:subjectId`
- Knowledge: `/knowledge/entities`, `/knowledge/entities/:entityId`, `/knowledge/graph`, `/knowledge/tags`, `/knowledge/recall`
- Agents: `/agents/assistant`, `/agents/ask-graph`, `/agents/review-inbox`, `/agents/ideas`, `/agents/analyst`
- System: `/settings`, `/admin` (administrators only)
- Secondary: `/insights/weekly`, `/knowledge/recall/comprehension`

Legacy routes redirect to these locations.

## Soft Delete and Restore

`DELETE /entities/{id}` permanently deletes the entity, its descendants, links, history, reviews, and comprehension checks. Entities with children or links require exact-title confirmation at the API boundary.

## Subject Metadata

Subjects and topics remain `subject_topic` entities. A subject has `parent_id=null`; a topic uses its subject as `parent_id`. Supported subject metadata includes `exam_date`, `status`, `priority`, `syllabus_units`, `progress_percent`, `target_confidence`, `study_sessions_planned`, `course_code`, `term`, `instructor`, `location`, `color`, and `credits`; topics may also use `exam_weightage`. Legacy exam-date-only entities receive safe read defaults.

Academic assignments, exams, revision, readings, and projects remain `task` entities parented by a subject or topic. Their metadata can include `academic_kind`, `due_at`, `estimated_minutes`, `recurrence`, `points_earned`, `points_possible`, and `weight_percent`. Study blocks use session actions `study_planned` and `study_completed` with their duration in session metadata. `GET /subjects/tracker` derives workload, progress, mastery, grade, review debt, and rolling study totals without rewriting stored subject metadata.

Full private LeetCode imports use a user-bound browser-extension token. Username-only synchronization remains limited to public recent submissions; there is no shared backend cookie fallback.
