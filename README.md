# Personal Dev KG

Foundation monorepo for a personal knowledge graph with:
- `apps/api`: FastAPI + SQLAlchemy + Alembic
- `apps/web`: React + TypeScript + Vite + Tailwind + shadcn-style UI components
- `docker-compose.yml`: Postgres with pgvector and Redis

## What is included

This repo currently covers the core foundation plus the early Phase 1 and Phase 2 substrate pieces requested in `PROJECT_BRIEF.md`:
- Stable schema tables: `entities`, `links`, `sessions`, `reviews`, `comprehension_checks`
- FastAPI CRUD for entities, links, and sessions
- Dashboard and tracker views built on the shared `entities` table
- Embedding generation pipeline using the existing `entities.embedding` column
- Vector similarity search foundation for candidate retrieval only
- React UI with capture, list, detail, tracker, and similar-entity views
- No agents, no deep connection reasoning, no recall mode, no RAG chat, and no GitHub integration

## Project shape

### Backend
- `app/main.py`
- `app/core/config.py`
- `app/db/base.py`
- `app/db/session.py`
- `app/models/`
- `app/schemas/`
- `app/services/`
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

### 5. Verify the current flow

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

### 6. Verify the graph and confidence flow

1. Create at least two entities with overlapping tags or related content.
2. Open each entity detail page and refresh embeddings if the status is still missing.
3. Use the Suggested connections panel to create a confirmed link with an explanation.
4. Open the Graph page from the sidebar.
5. Confirm the linked entities appear as nodes with a blue confirmed edge between them.
6. Click the edge and confirm the explanation is visible in the inspector panel.
7. Run Run confidence decay on the graph page.
8. Confirm older nodes become more faded as confidence_score drops.
9. Click a node and use Mark revisited.
10. Confirm the node confidence returns to 1.0 and the node becomes more visible again.

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
```

### `apps/web/.env`

```env
VITE_API_URL=http://localhost:8000
```

## Notes

- `parent_id` is used only for hierarchy.
- `links` is reserved for graph-style relationships.
- Embeddings are used only for candidate retrieval in Phase 2, not for final reasoning.
- Entity create and update still succeed if embedding generation fails; the entity remains saved with a missing embedding.
- No schema changes were required beyond the existing Phase 0 migration.


