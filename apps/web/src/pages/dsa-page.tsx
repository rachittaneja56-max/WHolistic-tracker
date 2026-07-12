import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Braces, ChevronLeft, ChevronRight, FileCode2, Link2, Plus, Search, Settings2, StickyNote, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/toast-provider"
import { DsaIntegrationDrawer } from "@/features/dsa/dsa-integration-drawer"
import { formatEntityDate, getEntityDifficulty, getEntitySolutionCode } from "@/features/entities/metadata"
import { getDsaProblems, updateEntity, type DsaProblemPage, type Entity } from "@/lib/api"

const pageSize = 50
const tabs = ["Overview", "My Notes", "Solution", "LeetCode Note", "History", "Connections"] as const
type DetailTab = (typeof tabs)[number]

function metadataString(entity: Entity, key: string) {
  const value = entity.metadata[key]
  return typeof value === "string" ? value : null
}

function integration(entity: Entity) {
  const value = entity.metadata.integration
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function integrationString(entity: Entity, key: string) {
  const value = integration(entity)[key]
  return typeof value === "string" ? value : null
}

function problemStatus(entity: Entity) {
  return metadataString(entity, "status") || (integration(entity).accepted ? "solved" : "unsolved")
}

function updatedAt(entity: Entity) {
  return integrationString(entity, "last_submitted_at") || integrationString(entity, "source_updated_at") || entity.created_at
}

function platform(entity: Entity) {
  return integrationString(entity, "platform") || "manual"
}

function difficultyVariant(value: string | null) {
  if (value === "easy") return "success"
  if (value === "medium") return "warning"
  if (value === "hard") return "danger"
  return "default"
}

function ProblemBadges({ problem }: { problem: Entity }) {
  const remaining = Math.max(0, problem.tags.length - 2)
  return <div className="flex min-w-0 flex-wrap gap-1.5">{problem.tags.slice(0, 2).map((tag) => <Badge key={tag}>{tag}</Badge>)}{remaining ? <Badge>+{remaining}</Badge> : null}</div>
}

function DetailDrawer({ problem, onClose, onSaved }: { problem: Entity; onClose: () => void; onSaved: (entity: Entity) => void }) {
  const { show } = useToast()
  const [tab, setTab] = useState<DetailTab>("Overview")
  const [title, setTitle] = useState(problem.title || "")
  const [difficulty, setDifficulty] = useState(getEntityDifficulty(problem) || "unset")
  const [status, setStatus] = useState(problemStatus(problem))
  const [tags, setTags] = useState(problem.tags.join(", "))
  const [notes, setNotes] = useState(problem.content || "")
  const [code, setCode] = useState(getEntitySolutionCode(problem) || "")
  const [reviewDate, setReviewDate] = useState(metadataString(problem, "review_date") || "")
  const [saving, setSaving] = useState(false)
  const sourceNote = integrationString(problem, "source_notes")

  async function save() {
    setSaving(true)
    try {
      const entity = await updateEntity(problem.id, {
        title,
        content: notes,
        tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
        metadata: {
          difficulty: difficulty === "unset" ? null : difficulty,
          status,
          solution_code: code,
          review_date: reviewDate || null,
        },
      })
      onSaved(entity)
      show({ message: "Problem changes saved." })
    } catch {
      show({ message: "Unable to save this problem." })
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-40 bg-black/60" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="ml-auto flex h-full w-full flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl md:max-w-[540px]">
      <header className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500"><span className="capitalize">{platform(problem)}</span>{platform(problem) !== "manual" ? <Badge variant="blue">From {platform(problem)}</Badge> : null}</div><h2 className="mt-1 truncate text-lg font-semibold text-zinc-100">{problem.title || "Untitled problem"}</h2></div><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close problem"><X className="h-4 w-4" /></Button></div>
        <nav className="mt-4 flex gap-1 overflow-x-auto pb-1">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs ${tab === item ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>{item}</button>)}</nav>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "Overview" ? <div className="space-y-4">
          <label className="grid gap-2 text-xs text-zinc-500">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-xs text-zinc-500">Difficulty<Select value={difficulty} onValueChange={setDifficulty}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Unset</SelectItem><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent></Select></label>
            <label className="grid gap-2 text-xs text-zinc-500">Status<Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="solved">Solved</SelectItem><SelectItem value="review">Review</SelectItem><SelectItem value="unsolved">Unsolved</SelectItem></SelectContent></Select></label>
          </div>
          <label className="grid gap-2 text-xs text-zinc-500">Tracker tags<Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="arrays, sliding-window" /></label>
          <label className="grid gap-2 text-xs text-zinc-500">Review date<Input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} /></label>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm"><dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-zinc-500">Platform</dt><dd className="mt-1 capitalize text-zinc-200">{platform(problem)}</dd></div><div><dt className="text-xs text-zinc-500">Last submitted</dt><dd className="mt-1 text-zinc-200">{formatEntityDate(updatedAt(problem), { timeStyle: undefined })}</dd></div><div><dt className="text-xs text-zinc-500">Language</dt><dd className="mt-1 text-zinc-200">{integrationString(problem, "language") || "Unknown"}</dd></div><div><dt className="text-xs text-zinc-500">Source</dt><dd className="mt-1">{integrationString(problem, "url") ? <a className="text-blue-400 hover:underline" href={integrationString(problem, "url")!} target="_blank" rel="noreferrer">Open problem</a> : "Manual"}</dd></div></dl></div>
        </div> : null}
        {tab === "My Notes" ? <label className="grid gap-2 text-xs text-zinc-500">Personal tracker notes<Textarea className="min-h-[360px]" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Write your approach, mistakes, and review cues…" /></label> : null}
        {tab === "Solution" ? <label className="grid gap-2 text-xs text-zinc-500">Solution code<textarea className="min-h-[440px] w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} /></label> : null}
        {tab === "LeetCode Note" ? <div><div className="mb-3 flex items-center gap-2"><Badge variant="blue">From LeetCode</Badge><span className="text-xs text-zinc-500">Read-only source note</span></div><div className="min-h-[240px] whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm leading-7 text-zinc-300">{sourceNote || "No LeetCode note was available during the last import."}</div></div> : null}
        {tab === "History" ? <div className="space-y-3">{[["First solved", integrationString(problem, "first_solved_at")], ["Last submitted", integrationString(problem, "last_submitted_at")], ["Source updated", integrationString(problem, "source_updated_at")], ["Last imported", integrationString(problem, "last_imported_at")], ["Created in tracker", problem.created_at]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-zinc-800 pb-3 text-sm"><span className="text-zinc-500">{label}</span><span className="text-right text-zinc-200">{formatEntityDate(value, { timeStyle: undefined })}</span></div>)}</div> : null}
        {tab === "Connections" ? <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"><div className="flex items-center gap-2 text-sm font-medium text-zinc-200"><Link2 className="h-4 w-4" />Knowledge graph connections</div><p className="mt-2 text-sm text-zinc-500">Open the full entity to inspect, add, or confirm graph links.</p><Button asChild variant="outline" className="mt-4"><Link to={`/knowledge/entities/${problem.id}`}>Open full entity</Link></Button></div> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-zinc-800 p-4"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => void save()} disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save changes"}</Button></footer>
    </aside>
  </div>
}

export function DsaPage() {
  const [params, setParams] = useSearchParams()
  const { show } = useToast()
  const [data, setData] = useState<DsaProblemPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Entity | null>(null)
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const page = Math.max(1, Number(params.get("page") || "1"))
  const query = useMemo(() => ({
    search: params.get("search") || undefined,
    platform: params.get("platform") || undefined,
    difficulty: params.get("difficulty") || undefined,
    status: params.get("status") || undefined,
    tag: params.get("tag") || undefined,
    sort: (params.get("sort") || "updated_desc") as "updated_desc" | "updated_asc" | "title_asc" | "difficulty_asc",
    limit: pageSize,
    offset: (page - 1) * pageSize,
  }), [params, page])

  async function load() {
    setLoading(true)
    try {
      setData(await getDsaProblems(query))
    } catch {
      show({ message: "Unable to load DSA problems." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  function setFilter(key: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value && value !== "all") next.set(key, value)
      else next.delete(key)
      if (key !== "page") next.delete("page")
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize))
  const stats = data?.stats || { solved: 0, this_week: 0, review_due: 0, platforms: 0 }
  return <div className="space-y-5">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h1 className="text-2xl font-semibold text-zinc-100">DSA Tracker</h1><p className="mt-1 text-sm text-zinc-500">Review imported problems without mixing source notes and your own work.</p></div><div className="flex gap-2"><Button asChild><Link to="/capture"><Plus className="mr-2 h-4 w-4" />Add problem</Link></Button><Button variant="outline" onClick={() => setConnectionsOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Connect</Button></div></header>

    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 md:grid-cols-4">{[["Solved", stats.solved], ["This week", stats.this_week], ["Review due", stats.review_due], ["Platforms", stats.platforms]].map(([label, value]) => <div key={label} className="bg-zinc-950 px-4 py-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold text-zinc-100">{value}</p></div>)}</section>

    <section className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3 md:grid-cols-[minmax(200px,1fr)_repeat(4,minmax(120px,auto))]">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-600" /><Input className="pl-9" placeholder="Search problems" value={params.get("search") || ""} onChange={(event) => setFilter("search", event.target.value)} /></div>
      <Select value={params.get("platform") || "all"} onValueChange={(value) => setFilter("platform", value)}><SelectTrigger><SelectValue placeholder="Platform" /></SelectTrigger><SelectContent><SelectItem value="all">All platforms</SelectItem><SelectItem value="leetcode">LeetCode</SelectItem><SelectItem value="codeforces">Codeforces</SelectItem><SelectItem value="codechef">CodeChef</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent></Select>
      <Select value={params.get("difficulty") || "all"} onValueChange={(value) => setFilter("difficulty", value)}><SelectTrigger><SelectValue placeholder="Difficulty" /></SelectTrigger><SelectContent><SelectItem value="all">All difficulties</SelectItem><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent></Select>
      <Select value={params.get("status") || "all"} onValueChange={(value) => setFilter("status", value)}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="solved">Solved</SelectItem><SelectItem value="review">Review</SelectItem><SelectItem value="unsolved">Unsolved</SelectItem></SelectContent></Select>
      <Select value={params.get("sort") || "updated_desc"} onValueChange={(value) => setFilter("sort", value)}><SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger><SelectContent><SelectItem value="updated_desc">Recently updated</SelectItem><SelectItem value="updated_asc">Oldest updated</SelectItem><SelectItem value="title_asc">Title A–Z</SelectItem><SelectItem value="difficulty_asc">Difficulty</SelectItem></SelectContent></Select>
    </section>

    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="hidden grid-cols-[minmax(220px,2fr)_120px_110px_100px_minmax(150px,1fr)_120px_64px] gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500 md:grid"><span>Problem</span><span>Platform</span><span>Difficulty</span><span>Status</span><span>Tags</span><span>Updated</span><span>Data</span></div>
      {loading ? <div className="px-4 py-16 text-center text-sm text-zinc-500">Loading problems…</div> : null}
      {!loading && !data?.items.length ? <div className="px-4 py-16 text-center"><Braces className="mx-auto h-6 w-6 text-zinc-700" /><p className="mt-3 text-sm text-zinc-400">No problems match these filters.</p><p className="mt-1 text-xs text-zinc-600">Capture one manually or connect the LeetCode extension.</p></div> : null}
      {!loading ? data?.items.map((problem) => <button key={problem.id} type="button" onClick={() => setSelected(problem)} className="block w-full border-b border-zinc-800/80 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-900/60 md:grid md:grid-cols-[minmax(220px,2fr)_120px_110px_100px_minmax(150px,1fr)_120px_64px] md:items-center md:gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-100">{problem.title || "Untitled problem"}</p><p className="mt-1 truncate text-xs text-zinc-600 md:hidden">{platform(problem)} · {formatEntityDate(updatedAt(problem), { timeStyle: undefined })}</p></div>
        <span className="hidden text-sm capitalize text-zinc-400 md:block">{platform(problem)}</span>
        <span className="mt-2 inline-block md:mt-0"><Badge variant={difficultyVariant(getEntityDifficulty(problem))}>{getEntityDifficulty(problem) || "unset"}</Badge></span>
        <span className="ml-2 text-xs capitalize text-zinc-400 md:ml-0">{problemStatus(problem)}</span>
        <div className="mt-2 md:mt-0"><ProblemBadges problem={problem} /></div>
        <span className="hidden text-xs text-zinc-500 md:block">{formatEntityDate(updatedAt(problem), { timeStyle: undefined })}</span>
        <span className="hidden items-center gap-2 text-zinc-600 md:flex">{getEntitySolutionCode(problem) ? <FileCode2 className="h-4 w-4" aria-label="Code available" /> : null}{problem.content || integrationString(problem, "source_notes") ? <StickyNote className="h-4 w-4" aria-label="Note available" /> : null}</span>
      </button>) : null}
    </section>

    <footer className="flex items-center justify-between"><p className="text-xs text-zinc-500">{data?.total || 0} problems · page {page} of {totalPages}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setFilter("page", String(page + 1))}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></footer>

    {selected ? <DetailDrawer problem={selected} onClose={() => setSelected(null)} onSaved={(entity) => { setSelected(entity); setData((current) => current ? { ...current, items: current.items.map((item) => item.id === entity.id ? entity : item) } : current) }} /> : null}
    <DsaIntegrationDrawer open={connectionsOpen} onClose={() => setConnectionsOpen(false)} onSynced={() => void load()} />
  </div>
}
