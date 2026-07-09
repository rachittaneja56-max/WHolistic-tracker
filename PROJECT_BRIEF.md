# Personal Dev Knowledge Graph — Full Build Plan

*A lifelong companion platform: DSA tracker + project tracker + notes + whiteboard + idea validator, all sitting on one connected knowledge graph, with an agent layer that guides, recalls, and reasons over your own learning history.*

---

## 1. Core Idea (one paragraph)

Everything you learn — a DSA problem, a networking concept, a project TIL, a whiteboard sketch — is stored as the **same kind of object** (an `entity`) in one system. Two structures sit on top: a **hierarchy** (projects → milestones → tasks) for things that nest, and a **graph** (`links`) for cross-cutting connections an agent discovers between entities that have no hierarchical relationship at all (e.g., "Git" ↔ "Linked List" because both are chains of nodes referencing a previous state). Agents run on top of this substrate to guide your daily study, detect duplicates, decay confidence on stale knowledge, and let you chat with — and be quizzed on — only your own notes.

---

## 2. Architectural Principles (keep these pinned)

1. **One substrate, many lenses.** DSA tracker, project tracker, notes, whiteboard are *views* into the same `entities`/`links` tables — not separate apps.
2. **Hierarchy vs. graph are different problems.** `parent_id` = nesting. `links` table = discovery. Don't conflate them.
3. **Embeddings find topical similarity. LLM reasoning finds conceptual similarity.** Use embeddings as a cheap candidate filter, use an agent call for the actual "why do these connect" reasoning.
4. **Never auto-write knowledge you didn't confirm.** Agents *suggest* links, tags, and TILs — you approve or reject. Agents *never* auto-purchase, auto-send, or auto-merge anything either, if you ever extend this pattern elsewhere.
5. **Inner ring vs. outer ring for AI usage.** Inner ring (schema decisions, agent reasoning logic, decay math, comprehension-check design) — you draft, AI refines. Outer ring (CRUD, routes, shadcn wiring, webhook boilerplate) — AI drafts freely, you review.
6. **Recall > storage.** A note you never get quizzed on is just a bookmark. Confidence decay + recall mode exist to fight that.
7. **Don't build what already exists as a good library.** Rich text editor, whiteboard, code display, UI components — use BlockNote, Excalidraw, shiki, shadcn. Spend your engineering effort on the graph and agents, which are actually yours.

---

## 3. Data Model (stable from Phase 0 onward — nothing here gets thrown away later)

```sql
entities (
  id uuid primary key,
  type text,                 -- 'dsa_problem' | 'concept' | 'subject_topic' | 'til'
                              -- | 'project' | 'milestone' | 'task' | 'note' | 'canvas' | 'idea'
  parent_id uuid references entities(id),   -- hierarchy (nullable)
  title text,
  content text,               -- markdown / blocks json / canvas json depending on content_type
  content_type text,           -- 'markdown' | 'blocks' | 'canvas_json' | 'code'
  tags text[],
  embedding vector(384),
  confidence_score float default 1.0,
  last_revisited_at timestamptz,
  created_at timestamptz default now(),
  metadata jsonb              -- difficulty/url, exam_date, repo_url, status, etc.
);

links (
  id uuid primary key,
  from_id uuid references entities(id),
  to_id uuid references entities(id),
  relation_type text,          -- 'structural_analogy' | 'prerequisite' | 'used_in' | 'reminds_me_of'
  explanation text,             -- the one-sentence "why" — the most important column in the schema
  status text,                  -- 'agent_suggested' | 'confirmed' | 'rejected'
  created_at timestamptz default now()
);

sessions (
  id uuid primary key,
  entity_id uuid references entities(id),
  action text,                  -- 'created' | 'revisited' | 'linked' | 'pr_opened' | 'pr_merged'
  date timestamptz default now(),
  meta jsonb
);

reviews (                        -- Recall Mode history
  id uuid primary key,
  entity_id uuid references entities(id),
  recalled_score int,            -- 1-5, agent-graded
  reviewed_at timestamptz default now()
);

comprehension_checks (            -- AI-usage comprehension gate
  id uuid primary key,
  entity_id uuid references entities(id),   -- usually a 'task'
  ai_assist_level text,          -- 'handwritten' | 'ai-scaffolded' | 'ai-generated' | 'ai-paired'
  question text,
  your_answer text,
  ai_grade text,                  -- 'passed' | 'flagged'
  created_at timestamptz default now(),
  answered_at timestamptz
);
```

---

## 4. Tech Stack (final)

| Layer | Choice | Why |
|---|---|---|
| Backend / agents | Python + FastAPI | Agent orchestration, embeddings, background jobs |
| DB | Postgres + pgvector | Relational + vector in one place, recursive CTEs handle the graph traversal |
| Frontend | React + TypeScript | Dashboard, capture UI, graph view |
| UI components | shadcn/ui (Radix + Tailwind) | You own the component code, still fast — right fit for "know it in and out" |
| Rich notes | BlockNote | Notion-style blocks without building an editor from scratch |
| Whiteboard | Excalidraw (`@excalidraw/excalidraw`) | Official embeddable React component |
| Code display | shiki / react-syntax-highlighter | Read-only highlighted code block — no editor state needed |
| Graph visualization | Cytoscape.js | Handles large interactive graphs + per-node styling (confidence-based fade) better than raw d3 here |
| Background jobs | Celery + Redis, or simple cron | Nightly connection agent, daily guidance agent, decay job |
| Embeddings | sentence-transformers (local) or an embedding API | Candidate generation for links |
| Reasoning agent | Direct Anthropic API calls (build your own loop first), optionally LangGraph later if you need branching/retries | Owning the loop = owning the learning |
| AI coding assistance | Codex subscription | Outer-ring work: boilerplate, CRUD, webhook handlers, shadcn wiring |
| GitHub integration | Single webhook (not a GitHub App) | You only need events from your own repos |

---

## 5. Phase-Wise Plan

### **Phase 0 — Foundation** (Weeks 1–2)
**Goal:** A deployed, boring, working skeleton. No AI yet.

- [ ] Postgres schema above as real migration files (Alembic)
- [ ] FastAPI project structure: `/entities`, `/links`, `/sessions` CRUD endpoints
- [ ] Auth (even basic JWT/session — just you, but do it properly)
- [ ] React app scaffold, shadcn installed and themed
- [ ] One unified **capture form**: title, type dropdown, markdown textarea, tags input
- [ ] Basic list + detail view per entity
- [ ] Deploy end-to-end (even to a $5 VPS or Render/Fly.io) — get the full loop working early

**AI usage:** Let Codex generate almost all of this — it's pure outer ring. Your job is to read every migration and route once, understand it, move on.

**Definition of done:** You can add a DSA problem, a TIL, and a project note through one form, and see them listed and openable.

---

### **Phase 1 — Core Trackers** (Weeks 3–5)
**Goal:** The three trackers people would actually use daily, on top of the same schema.

- [ ] **DSA tracker**: problem entity view — title, difficulty, tags, read-only code block (shiki) for your solution, markdown notes below it
- [ ] **Project tracker**: `project` → `milestone` → `task` via `parent_id`; kanban view grouping tasks by status
- [ ] **Subject/topic tracker**: `subject_topic` entities with exam_date in metadata
- [ ] "Today" dashboard: simple aggregation — recent activity, upcoming exam dates, open tasks
- [ ] Task completion → prompt "what did you learn?" → creates a `til` entity `linked` (not nested) to the task

**AI usage:** Outer ring (kanban UI, form wiring) → Codex. Inner ring: the decision of what goes in `metadata` per type, and the task→TIL linking logic — draft yourself first.

**Definition of done:** You're using this instead of your old spreadsheet/Notion for daily DSA + project tracking.

---

### **Phase 2 — Graph Substrate** (Weeks 6–8)
**Goal:** Turn the flat entity list into an actual knowledge graph.

- [ ] Embedding pipeline: on entity create/update, generate + store embedding
- [ ] Stage-1 candidate link suggestions (nearest neighbors on save) — simple version, agent not required yet
- [ ] Cytoscape graph view: nodes = entities, edges = confirmed `links`, click a node to see its explanation-annotated connections
- [ ] Confidence decay job (nightly cron): exponential decay of `confidence_score` since `last_revisited_at`; graph node opacity maps to this score

**AI usage:** The embedding similarity math and decay formula — write and understand this yourself, it's small and it's the core mechanic of the whole product. UI wiring for Cytoscape → Codex-assisted is fine.

**Definition of done:** Adding a new entity shows you "similar things you've written before," and the graph view visibly shows old/stale nodes fading.

---

### **Phase 3 — Agent Layer** (Weeks 9–12)
**Goal:** This is where it becomes genuinely agentic, not just a smart CRUD app.

- [ ] **Duplicate/pattern detector**: on new DSA problem entry, semantic search + LLM check — "have you solved something like this before?"
- [ ] **Stage-2 deep connection agent** (nightly): broader candidate set (same tags / same time window) → LLM reasons about non-obvious conceptual links (the "Git ↔ Linked List" case) → writes `explanation`, status `agent_suggested`, sits in a review inbox
- [ ] **Daily guidance agent**: combines spaced-repetition due items + upcoming exam/project deadlines + newly suggested connections into one short daily nudge
- [ ] **Recall mode**: due entities get content hidden, you explain in your own words, agent grades 1–5 (SM-2-style), updates `reviews` + `confidence_score` + next-due date
- [ ] **RAG chat scoped to your graph**: vector search your entities (+ 1-hop link expansion) → answer only from retrieved content, cite which entity each claim came from, explicitly say "you haven't written about this yet" if nothing relevant is found

**AI usage:** This entire phase is inner ring. Write the prompts, the retrieval logic, and the grading logic yourself first — this is the part of the project that's actually "yours." Use Codex only to clean up/refactor once the logic works.

**Definition of done:** You get a daily nudge you didn't ask for, get quizzed on fading knowledge, and can ask "how does indexing work again" and get an answer sourced only from your own notes.

---

### **Phase 4 — Rich Content + GitHub Integration** (Weeks 13–15)
**Goal:** Make capture frictionless and pull in real dev activity.

- [ ] Swap plain markdown → BlockNote for `note` entities (Notion-style blocks)
- [ ] Excalidraw embed for `canvas` entities
- [ ] **Idea validator**: input a rough project idea → agent web-searches for existing similar products + cross-references your own graph for prerequisite coverage → proposes an MVP milestone breakdown
- [ ] **GitHub webhook**: single webhook per repo → `pull_request`/`push` events → stored as `sessions` linked to matching `project` entity via `repo_url` in metadata → PR feed panel on dashboard
- [ ] On PR merged: trigger the "what did you learn?" prompt automatically; agent drafts a starter TIL from the diff for you to approve/edit
- [ ] **AI-usage toggle + comprehension checks**: `ai_assist_level` on tasks; above `handwritten` triggers agent-generated, diff-specific leading questions → graded like Recall Mode → "comprehension debt" tasks get scheduled back into Recall Mode if flagged
- [ ] **Capture hook**: small CLI (`klog "..."`) hitting your API directly, optionally wired to a git `post-commit` hook, auto-linking to the matching project

**AI usage:** Webhook handler, GitHub API client, BlockNote/Excalidraw wiring → Codex, pure outer ring. The comprehension-check question generator (needs to read a real diff and ask something *specific*, not generic) → inner ring, write it yourself.

**Definition of done:** Merging a PR on GitHub shows up on your dashboard, prompts a TIL, and (if AI-assisted) queues a comprehension check you can't skip forever.

---

### **Phase 5 — Polish & Lifelong-Companion Features** (Week 16+, ongoing)
**Goal:** The stuff that makes this feel alive over months/years, not urgent to build early.

- [ ] Weekly digest email: new connections found, topics fading, deadlines this week
- [ ] Tag taxonomy view: hierarchy of tags to spot coverage gaps at a glance
- [ ] Commit heatmap next to learnings heatmap (spot "shipping code without capturing learning")
- [ ] CI status on dashboard (via `workflow_run`/`check_run` webhook events)
- [ ] Analyst agent: weekly solve-rate trends, gap detection (concepts referenced everywhere but with no dedicated note)
- [ ] Optional: Judge0 API integration if you ever want "run this DSA solution" instead of read-only display

---


## 6. Realistic Timeline

~16 weeks to a genuinely complete, daily-usable v1 across all modules, working roughly 8–12 focused hours/week. Phase 0–1 alone (4–5 weeks) is already a usable product — everything after that is depth, not a prerequisite to using it.