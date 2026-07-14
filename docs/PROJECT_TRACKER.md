# Project Tracker

The project tracker turns the shared entity graph into a delivery workspace without adding parallel project-management tables.

## Data model

- A `project` is a top-level entity.
- A `milestone` is parented by a project.
- A new project `task` is parented by a milestone. Existing tasks parented directly by a project remain supported and visible; they can be moved into milestones during review. Tasks used by the subject tracker may still be parented by a subject or topic.
- Hierarchy uses `parent_id`. Dependencies and knowledge connections use `links`.
- Work and shipping evidence uses `sessions`.
- Durable learning uses linked knowledge entities and `comprehension_checks`.

Project metadata supports `status`, `priority`, `objective`, `success_metric`, `start_at`, `target_at`, `repo_url`, `production_url`, and an optional `health_override`.

Milestone metadata supports `status`, `priority`, `outcome`, `start_at`, `target_at`, `completed_at`, and `progress_weight`.

Task metadata supports delivery statuses from `backlog` through `done`, `priority`, start and due dates, estimate and actual minutes, completion time, blocked reason, acceptance criteria, branch and PR references, and AI-assist level.

## Health and progress

Progress is the percentage of completed tasks. If a project has milestones but no tasks, completed milestones provide the fallback progress signal.

Health is computed in this order:

1. An explicit project health override.
2. Completed, archived, or paused project state.
3. Stalled when open work has no tracked activity for more than 14 days.
4. At risk when work is overdue or blocked.
5. At risk when the project target is within seven days and progress is below 70%.
6. On track otherwise.

The portfolio also derives the current milestone, next deadline, last activity, shipping events from the last seven days, completed-task TIL coverage, and unanswered or flagged comprehension debt.

## User workflow

1. Create a project from the portfolio and define its outcome and success metric.
2. Add milestones with target dates and clear outcomes.
3. Add tasks with priority, estimate, due date, and acceptance criteria.
4. Use the board to limit work in progress and expose blockers.
5. Link dependencies with `depends_on`; record work sessions and GitHub delivery evidence.
6. Complete tasks through the learning checkpoint, which creates a linked TIL. AI-assisted tasks also generate a comprehension check.
7. Review project health from Today and use the activity and knowledge views for a weekly delivery review.

## API

- `GET /projects/tracker` returns portfolio summaries ordered by attention required.
- `GET /projects/{project_id}/tracker` returns one project summary, milestones, tasks, relationships, activity, connected knowledge, and comprehension checks.

These are derived read models. CRUD continues to use the existing entity, link, session, and comprehension endpoints.
