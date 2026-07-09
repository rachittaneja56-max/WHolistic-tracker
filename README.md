# Personal Dev KG

Phase 0 foundation for a monorepo with:
- `apps/api`: FastAPI + SQLAlchemy + Alembic
- `apps/web`: React + TypeScript + Vite + Tailwind + shadcn-style UI components
- `docker-compose.yml`: Postgres with pgvector and Redis

## What is included

This repo currently implements only the Phase 0 foundation requested in `PROJECT_BRIEF.md`:
- Stable schema tables: `entities`, `links`, `sessions`, `reviews`, `comprehension_checks`
- FastAPI CRUD for entities, links, and sessions
- Alembic migration that enables `pgvector` and creates the stable schema
- React UI with a unified capture form, entity list view, and entity detail view
- No embeddings pipeline, no agents, no graph UI, no DSA-specific screens, and no project kanban

## Project shape

### Backend
- `app/main.py`
- `app/core/config.py`
- `app/db/base.py`
- `app/db/session.py`
- `app/models/`
- `app/schemas/`
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

## Phase 0 local runbook

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

### 4. Verify the Phase 0 flow

1. Start Docker services.
2. Run Alembic migrations.
3. Start the FastAPI server.
4. Start the Vite frontend.
5. Open `http://localhost:5173`.
6. Create an entity from the capture form.
7. Confirm it appears in the entity list.
8. Open the entity detail view.

## Environment variables

### `apps/api/.env`

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5433/personal_dev_kg
APP_NAME=Personal Dev KG API
APP_ENV=development
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173
```

### `apps/web/.env`

```env
VITE_API_URL=http://localhost:8000
```

## Notes

- `parent_id` is used only for hierarchy.
- `links` is reserved for graph-style relationships.
- The `embedding vector(384)` column exists in the schema, but no embedding generation runs in Phase 0.
- AI and agent features are intentionally not implemented in this phase.
- No schema changes are needed beyond the existing Phase 0 migration.
