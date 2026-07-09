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
- No embeddings pipeline, no agents, no graph UI, no DSA/project-specific tracker screens

## Prerequisites

- Docker Desktop
- Python 3.13+ with `pip`
- Node.js 22+
- npm 11+

## 1. Start local services

From the repo root:

```powershell
docker compose up -d
```

This starts:
- Postgres on `localhost:5433`
- Redis on `localhost:6379`

## 2. Backend setup

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

## 3. Frontend setup

From `apps/web`:

```powershell
copy .env.example .env
npm install
npm run dev
```

Frontend URL:
- App: `http://localhost:5173`

The frontend expects the API at `VITE_API_URL`, which defaults to `http://localhost:8000` in the example env file.

## 4. End-to-end Phase 0 flow

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
- AI/agent features are intentionally not implemented in this phase.
