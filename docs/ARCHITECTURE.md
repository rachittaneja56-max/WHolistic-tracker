# Architecture

## One substrate, many lenses

Personal Dev KG stores DSA problems, tasks, project notes, subject topics, TILs, canvases, and ideas in one `entities` table. Tracker pages are filtered views over the same substrate, not separate databases or separate domain models.

## Stable schema

The stable schema is:
- `entities`
- `links`
- `sessions`
- `reviews`
- `comprehension_checks`

No separate tables are created for DSA problems, projects, milestones, tasks, notes, canvases, ideas, tags, commits, PRs, or CI runs.

## Entities table

`entities` is the center of the product.

Important columns:
- `type`: category such as `dsa_problem`, `project`, `task`, `note`, `canvas`, `til`
- `parent_id`: hierarchy only
- `content`: markdown, block JSON, canvas JSON, or code string
- `content_type`: `markdown`, `blocks`, `canvas_json`, or `code`
- `tags`: flat tag array
- `embedding`: `vector(384)` for pgvector search
- `confidence_score`: decay and recall signal
- `metadata`: type-specific fields such as `difficulty`, `status`, `repo_url`, or `exam_date`

## Hierarchy vs graph

These are intentionally separate:
- `parent_id` means nesting such as project -> milestone -> task
- `links` means graph relationships such as `prerequisite` or `reminds_me_of`

The graph view should not silently treat hierarchy edges as graph links.

## Embeddings vs LLM reasoning

Embeddings are used for retrieval and candidate generation:
- similar entities
- link candidates
- future graph-scoped retrieval

LLM reasoning is separate:
- agent prompts only operate on retrieved or explicitly supplied context
- agents suggest but do not auto-confirm links or write final knowledge
- deterministic fallback remains available when AI is disabled

## Confidence decay

`confidence_score` is a lightweight freshness signal.
- decay uses time since `last_revisited_at`
- if `last_revisited_at` is null, the system uses `created_at`
- graph node opacity uses the current confidence score
- revisiting bumps confidence back toward 1.0 instead of deleting or rewriting content

## Recall mode

Recall mode uses existing rows instead of a separate study subsystem:
- `reviews` stores recall outcomes
- `entities.confidence_score` reflects fading or reinforcement
- due-item surfaces are derived from entity timestamps, confidence, deadlines, and review history

## GitHub sessions

GitHub events are stored in `sessions` with action names such as:
- `push`
- `pr_opened`
- `pr_merged`
- `workflow_run`
- `check_run`

Metadata on the session stores repo and event details. Matching back to a project happens through `project.metadata.repo_url`.
## System settings and archived entities

`app_settings` is the only non-learning table added after the stable Phase 0 schema. It stores system preferences plus encrypted owner-entered AI provider credentials. AI keys are encrypted using a key derived from `APP_SESSION_SECRET`, are never returned by the API, and fall back to process configuration when no database credential exists.

Entity deletion is a reversible metadata state. Central SQLAlchemy loader criteria hide entities with `metadata.deleted_at` from ordinary queries, including tracker, graph, retrieval, and agent entity loads. Explicit authenticated archive/restore paths opt into archived visibility. Hierarchy and graph data are never cascaded or rewritten.
