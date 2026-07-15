import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate, useOutletContext } from "react-router-dom"
import { AlertTriangle, Archive, CalendarDays, CheckCircle2, CircleDot, FolderKanban, Plus, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import {
  createEntity,
  getProjectTracker,
  priorityOptions,
  projectStatusOptions,
  type ProjectHealth,
  type ProjectTrackerItem,
  type WorkPriority,
} from "@/lib/api"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load projects."
}

function metaString(item: ProjectTrackerItem, key: string, fallback = "") {
  const value = item.project.metadata[key]
  return typeof value === "string" ? value : fallback
}

function dateLabel(value: string | null) {
  if (!value) return "No deadline"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed)
}

function healthLabel(health: ProjectHealth) {
  return health.replace("_", " ")
}

function healthVariant(health: ProjectHealth): "default" | "success" | "warning" | "blue" {
  if (health === "completed") return "success"
  if (health === "on_track") return "blue"
  if (health === "at_risk" || health === "stalled") return "warning"
  return "default"
}

function StatCard({ label, value, icon: Icon, tone = "text-secondary" }: { label: string; value: number; icon: typeof FolderKanban; tone?: string }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-2xl font-semibold text-foreground">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div><Icon className={`h-5 w-5 ${tone}`} /></CardContent></Card>
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const { addEntityToList } = useOutletContext<EntitiesLayoutContext>()
  const [rows, setRows] = useState<ProjectTrackerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("active")
  const [healthFilter, setHealthFilter] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [objective, setObjective] = useState("")
  const [successMetric, setSuccessMetric] = useState("")
  const [targetAt, setTargetAt] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [tags, setTags] = useState("")
  const [priority, setPriority] = useState<WorkPriority>("medium")
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setRows(await getProjectTracker())
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = `${row.project.title ?? ""} ${row.project.content ?? ""} ${row.project.tags.join(" ")}`.toLowerCase()
    const status = metaString(row, "status", "active")
    return haystack.includes(search.trim().toLowerCase())
      && (statusFilter === "all" || status === statusFilter || (statusFilter === "active" && ["in_progress", "todo"].includes(status)))
      && (healthFilter === "all" || row.health === healthFilter)
  }), [healthFilter, rows, search, statusFilter])

  const activeCount = rows.filter((row) => ["active", "in_progress", "todo"].includes(metaString(row, "status", "active"))).length
  const riskCount = rows.filter((row) => row.health === "at_risk" || row.health === "stalled").length
  const blockedCount = rows.reduce((total, row) => total + row.blocked_task_count, 0)
  const shippedCount = rows.reduce((total, row) => total + row.shipped_this_week, 0)

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError(null)
    try {
      const project = await createEntity({
        type: "project",
        title: title.trim(),
        content: objective.trim(),
        content_type: "markdown",
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        metadata: {
          status: "active",
          priority,
          objective: objective.trim(),
          success_metric: successMetric.trim(),
          ...(targetAt ? { target_at: targetAt } : {}),
          ...(repoUrl.trim() ? { repo_url: repoUrl.trim() } : {}),
        },
      })
      addEntityToList(project)
      navigate(`/trackers/projects/${project.id}`)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Delivery + learning</p><h1 className="mt-2 text-3xl font-semibold text-foreground">Project portfolio</h1><p className="mt-2 max-w-3xl text-sm text-secondary">Plan outcomes, move work, verify shipping evidence, and retain what you learned.</p></div>
      <Button type="button" onClick={() => setShowCreate((current) => !current)}><Plus className="mr-2 h-4 w-4" />New project</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Active projects" value={activeCount} icon={FolderKanban} tone="text-primary" />
      <StatCard label="Need attention" value={riskCount} icon={AlertTriangle} tone="text-warning" />
      <StatCard label="Blocked tasks" value={blockedCount} icon={CircleDot} tone="text-danger" />
      <StatCard label="Shipped this week" value={shippedCount} icon={CheckCircle2} tone="text-success" />
    </div>

    {showCreate ? <Card className="border-primary/30"><CardHeader><CardTitle>Create project</CardTitle><CardDescription>Start with the outcome. Milestones and tasks can be added inside the workspace.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={(event) => void createProject(event)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="project-title">Project name</Label><Input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></div>
        <div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="project-objective">Objective</Label><Textarea id="project-objective" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What outcome should this project create?" /></div>
        <div className="space-y-2"><Label htmlFor="success-metric">Success metric</Label><Input id="success-metric" value={successMetric} onChange={(event) => setSuccessMetric(event.target.value)} placeholder="Example: usable by me every day" /></div>
        <div className="space-y-2"><Label htmlFor="target-date">Target date</Label><Input id="target-date" type="date" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="repo-url">Repository</Label><Input id="repo-url" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="owner/repo or GitHub URL" /></div>
        <div className="space-y-2"><Label htmlFor="project-tags">Tags</Label><Input id="project-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="web, personal, ai" /></div>
      </div>
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" disabled={creating || !title.trim()}>{creating ? "Creating..." : "Create workspace"}</Button></div>
    </form></CardContent></Card> : null}

    <Card><CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_180px_180px]">
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search projects or tags" /></div>
      <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{projectStatusOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      <Select value={healthFilter} onValueChange={setHealthFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All health</SelectItem>{["on_track", "at_risk", "stalled", "paused", "completed"].map((item) => <SelectItem key={item} value={item}>{item.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
    </CardContent></Card>

    {error ? <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div> : null}
    {loading ? <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">Loading project health...</div> : null}
    {!loading && !error && filtered.length === 0 ? <Card><CardContent className="flex flex-col items-center p-12 text-center"><FolderKanban className="h-9 w-9 text-muted-foreground" /><p className="mt-4 font-medium text-foreground">No projects match this view</p><p className="mt-1 text-sm text-muted-foreground">Create a project or adjust the filters.</p><Button className="mt-5" onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />Create project</Button></CardContent></Card> : null}

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {filtered.map((row) => <Link key={row.project.id} to={`/trackers/projects/${row.project.id}`} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full transition-colors group-hover:border-border-strong"><CardHeader>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate">{row.project.title ?? "Untitled project"}</CardTitle><CardDescription className="mt-2 line-clamp-2">{metaString(row, "objective", row.project.content || "No objective yet.")}</CardDescription></div><Badge variant={healthVariant(row.health)}>{healthLabel(row.health)}</Badge></div>
      </CardHeader><CardContent className="space-y-4">
        <div><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Progress</span><span className="font-mono text-secondary">{row.progress_percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${row.progress_percent}%` }} /></div></div>
        <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-md bg-background p-2"><p className="font-mono text-sm text-foreground">{row.open_task_count}</p><p className="text-[11px] text-muted-foreground">open</p></div><div className="rounded-md bg-background p-2"><p className="font-mono text-sm text-warning">{row.blocked_task_count}</p><p className="text-[11px] text-muted-foreground">blocked</p></div><div className="rounded-md bg-background p-2"><p className="font-mono text-sm text-success">{row.shipped_this_week}</p><p className="text-[11px] text-muted-foreground">shipped</p></div></div>
        <div className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground"><div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /><span>{dateLabel(row.next_deadline)}</span></div><div className="flex items-center gap-2"><CircleDot className="h-3.5 w-3.5" /><span className="truncate">{row.current_milestone?.title ?? "No active milestone"}</span></div>{metaString(row, "status") === "archived" ? <div className="flex items-center gap-2"><Archive className="h-3.5 w-3.5" />Archived</div> : null}</div>
      </CardContent></Card></Link>)}
    </div>
  </div>
}
