# Personal Dev KG

Foundation monorepo for a personal knowledge graph with:
- `apps/api`: FastAPI + SQLAlchemy + Alembic
- `apps/web`: React + TypeScript + Vite + Tailwind + shadcn-style UI components
- `docker-compose.yml`: Postgres with pgvector and Redis

## What is included

This repo currently covers the core foundation plus the requested Phase 1, Phase 2, and Phase 3 layers from `PROJECT_BRIEF.md`:
- Stable schema tables: `entities`, `links`, `sessions`, `reviews`, `comprehension_checks`
- FastAPI CRUD for entities, links, and sessions
- Dashboard and tracker views built on the shared `entities` table
- Embedding generation pipeline using the existing `entities.embedding` column
- Vector similarity search foundation for candidate retrieval only
- Cytoscape graph view with confidence decay support
- Reviewable agent infrastructure with provider abstraction and prompt files
- Daily guidance endpoint with deterministic fallback when AI is unavailable
- Recall Mode with stored review history and self-grade fallback when AI is unavailable
- Graph-scoped RAG chat that answers only from retrieved graph context
- No duplicate merges, no auto-confirmed links, no GitHub integration, and no external-web answering

## Project shape

### Backend
- `app/main.py`
- `app/core/config.py`
- `app/db/base.py`
- `app/db/session.py`
- `app/models/`
- `app/schemas/`
- `app/services/`
- `app/agents/`
- `app/api/routes/`

### Frontend
- `src/components/`
- `src/features/entities/`
- `src/lib/api.ts`
- `src/layouts/`
- `src/pages/`

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

This project uses:
- Postgres on `localhost:5433`
- Redis on `localhost:6379`

`5433` is intentional so this repo does not collide with another local Postgres already using `5432`.

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

By default, `EMBEDDING_BACKEND=auto`:
- uses `sentence-transformers/all-MiniLM-L6-v2` if the optional dependency is installed and the model can load
- otherwise falls back to a deterministic 384-dimension local hash embedding backend so entity writes still succeed

By default, `AI_ENABLED=false`:
- the backend still starts normally without `OPENAI_API_KEY`
- `GET /agents/status` reports safe configuration state
- `GET /agents/daily-guidance` falls back to deterministic guidance
- `POST /recall/{entity_id}/grade` accepts `self_score` fallback grading
- `POST /chat/graph` remains disabled until AI is enabled

Backend URLs:
- API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`
- OpenAPI docs: `http://localhost:8000/docs`

If port `8000` is already in use, run:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

If you use `8001`, also update `apps/web/.env` to point `VITE_API_URL` at `http://localhost:8001`.

### 3. Set up and run the frontend

From `apps/web`:

```powershell
copy .env.example .env
npm install
npm run dev
```

Frontend URL:
- App: `http://localhost:5173`

### 4. Refresh embeddings for existing entities

Refresh one entity:

```powershell
Invoke-WebRequest -Method Post http://localhost:8000/entities/{ENTITY_ID}/embedding/refresh
```

Refresh every entity:

```powershell
Invoke-WebRequest -Method Post http://localhost:8000/entities/embedding/refresh-all
```

Check similar candidates for one entity:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/entities/{ENTITY_ID}/similar
```

### 5. Verify the current entity and graph flow

1. Start Docker services.
2. Run Alembic migrations.
3. Start the FastAPI server.
4. Start the Vite frontend.
5. Open `http://localhost:5173`.
6. Create an entity from the capture form.
7. Confirm it appears in the entity list.
8. Open the entity detail view.
9. Confirm embedding status appears on the detail page.
10. Use the `Refresh embedding` button if the embedding is missing.
11. Confirm the similar entities panel loads candidate matches.
12. Create a confirmed link and verify it appears in the graph view.

### 6. Verify daily guidance and recall mode

1. Create a few entities with low confidence or older revisit dates.
2. Add a `subject_topic` entity with `metadata.exam_date` in the near future.
3. Open `Today` and confirm the `Today's Guidance` card recommends real due items.
4. Open `Recall` and start a review from the queue.
5. Confirm the content is hidden before grading.
6. Submit an answer.
7. Confirm a `reviews` row is created and the entity confidence updates.
8. Set `AI_ENABLED=false` and repeat the review flow using self-grade fallback.

### 7. Verify graph chat grounding

1. Create or refresh embeddings for a few related notes.
2. Open `Ask Graph`.
3. Ask a question covered by your entities.
4. Confirm the answer includes citations that link back to entity detail pages.
5. Ask a question your notes do not cover.
6. Confirm the app says `You have not written enough about this yet.`

### 8. Verify AI safety infrastructure

1. Start the backend without setting `OPENAI_API_KEY`.
2. Confirm the app still starts and `GET /agents/status` reports a missing key instead of crashing.
3. Set `AI_ENABLED=false` and call:

```powershell
Invoke-WebRequest -Method Post -Uri http://localhost:8000/agents/test-json -ContentType 'application/json' -Body '{}'
```

4. Confirm the endpoint returns a clear disabled message.
5. Set `AI_ENABLED=true` and configure `OPENAI_API_KEY`.
6. Call `POST /agents/test-json` again with a small JSON body:

```powershell
Invoke-WebRequest -Method Post -Uri http://localhost:8000/agents/test-json -ContentType 'application/json' -Body '{"prompt":"Return a short structured output test response."}'
```

7. Confirm the response is valid JSON and that no entities or links were created or changed.

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
```

### `apps/web/.env`

```env
VITE_API_URL=http://localhost:8000
```

## Notes

- `parent_id` is used only for hierarchy.
- `links` is reserved for graph-style relationships.
- Embeddings are used for candidate retrieval, not final reasoning.
- Daily guidance and recall fall back safely when AI is unavailable.
- Graph chat is grounded in retrieved graph context only and should refuse unsupported questions.
- Agents never auto-confirm links, auto-delete entities, or write knowledge without user review.
- Entity create and update still succeed if embedding generation fails; the entity remains saved with a missing embedding.
- No schema changes were required beyond the existing Phase 0 migration.
