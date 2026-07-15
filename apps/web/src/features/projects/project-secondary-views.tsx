import { Activity, ExternalLink, Github } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { activityLabel, displayLabel, formatDate, metaString, taskBoardStatus } from "@/features/projects/project-utils"
import type { Entity, ProjectWorkspace } from "@/lib/api"

export function ProjectTimeline({ workspace, onSelectTask }: { workspace: ProjectWorkspace; onSelectTask: (task: Entity) => void }) {
  return <div className="space-y-4">{workspace.milestones.slice().sort((left, right) => metaString(left, "target_at", "9999").localeCompare(metaString(right, "target_at", "9999"))).map((milestone) => <Card key={milestone.id}><CardHeader><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>{milestone.title}</CardTitle><CardDescription>{metaString(milestone, "outcome", milestone.content || "No milestone outcome")}</CardDescription></div><div className="flex items-center gap-2"><Badge>{displayLabel(metaString(milestone, "status", "planned"))}</Badge><span className="text-sm text-muted-foreground">{formatDate(metaString(milestone, "target_at") || null)}</span></div></div></CardHeader><CardContent className="space-y-2">{workspace.tasks.filter((task) => task.parent_id === milestone.id).sort((left, right) => metaString(left, "due_at", "9999").localeCompare(metaString(right, "due_at", "9999"))).map((task) => <button key={task.id} onClick={() => onSelectTask(task)} className="grid w-full gap-2 rounded-lg border border-border bg-background p-3 text-left sm:grid-cols-[1fr_130px_110px]"><span className="text-sm text-foreground">{task.title}</span><span className="text-xs text-muted-foreground">{formatDate(metaString(task, "due_at") || null)}</span><Badge variant={taskBoardStatus(task) === "blocked" ? "warning" : taskBoardStatus(task) === "done" ? "success" : "default"}>{displayLabel(taskBoardStatus(task))}</Badge></button>)}{workspace.tasks.every((task) => task.parent_id !== milestone.id) ? <p className="text-sm text-muted-foreground">No tasks in this milestone.</p> : null}</CardContent></Card>)}{workspace.milestones.length === 0 ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Add a milestone to build the project timeline.</CardContent></Card> : null}</div>
}

export function ProjectActivity({ workspace }: { workspace: ProjectWorkspace }) {
  const entityById = new Map([workspace.summary.project, ...workspace.milestones, ...workspace.tasks].map((item) => [item.id, item]))
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thisWeek = workspace.activity.filter((item) => item.date && new Date(item.date).getTime() >= weekAgo)
  const completedThisWeek = workspace.tasks.filter((task) => {
    const completedAt = metaString(task, "completed_at")
    return completedAt ? new Date(completedAt).getTime() >= weekAgo : false
  }).length
  const workMinutes = thisWeek.reduce((total, item) => total + (typeof item.meta.duration_minutes === "number" ? item.meta.duration_minutes : 0), 0)

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Weekly delivery review</CardTitle><CardDescription>A deterministic review from the last seven days of tracked work.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Tasks completed", completedThisWeek],
      ["Shipping events", workspace.summary.shipped_this_week],
      ["Work logged", `${workMinutes}m`],
      ["Learning coverage", `${workspace.summary.til_coverage_percent}%`],
    ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-background p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div>)}</div><div className="mt-4 rounded-lg border border-border p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Review focus</p><p className="mt-2 text-sm text-secondary">{workspace.summary.health_reasons[0] ?? "Choose the next concrete delivery outcome."}</p></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Delivery evidence</CardTitle><CardDescription>Project changes, work logs, commits, pull requests, and deployments.</CardDescription></CardHeader><CardContent className="space-y-2">{workspace.activity.map((item) => { const entity = item.entity_id ? entityById.get(item.entity_id) : workspace.summary.project; const url = typeof item.meta.github_url === "string" ? item.meta.github_url : null; return <div key={item.id} className="flex gap-3 rounded-lg border border-border bg-background p-3"><div className="rounded-md bg-surface p-2">{item.action?.startsWith("pr_") || item.action === "push" ? <Github className="h-4 w-4 text-primary" /> : <Activity className="h-4 w-4 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-foreground">{activityLabel(item.action)}</p><span className="font-mono text-xs text-muted-foreground">{formatDate(item.date, true)}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{entity?.title ?? workspace.summary.project.title}</p>{typeof item.meta.summary === "string" ? <p className="mt-2 text-sm text-secondary">{item.meta.summary}</p> : null}</div>{url ? <a href={url} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="h-4 w-4" /></a> : null}</div> })}{workspace.activity.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No project activity has been recorded yet.</p> : null}</CardContent></Card>
  </div>
}

export function ProjectKnowledge({ workspace }: { workspace: ProjectWorkspace }) {
  return <div className="grid gap-6 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>Captured learning</CardTitle><CardDescription>TILs and knowledge connected to this project’s work.</CardDescription></CardHeader><CardContent className="space-y-3">{workspace.knowledge.map((entity) => <Link key={entity.id} to={`/knowledge/entities/${entity.id}`} className="block rounded-lg border border-border bg-background p-4 hover:border-border-strong"><div className="flex items-center justify-between"><p className="font-medium text-foreground">{entity.title}</p><Badge>{entity.type}</Badge></div><p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{entity.content || "No content"}</p></Link>)}{workspace.knowledge.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Complete a task to capture the first project TIL.</p> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>Comprehension checks</CardTitle><CardDescription>Verification for AI-assisted project work.</CardDescription></CardHeader><CardContent className="space-y-3">{workspace.comprehension_checks.map((check) => <div key={check.id} className="rounded-lg border border-border bg-background p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-foreground">{check.entity?.title ?? "Project task"}</p><Badge variant={check.ai_grade === "flagged" || !check.answered_at ? "warning" : "success"}>{check.answered_at ? check.ai_grade ?? "answered" : "pending"}</Badge></div><p className="mt-2 text-sm text-secondary">{check.question}</p>{!check.answered_at ? <Button asChild className="mt-3" size="sm" variant="outline"><Link to="/knowledge/recall/comprehension">Answer check</Link></Button> : null}</div>)}{workspace.comprehension_checks.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No comprehension debt for this project.</p> : null}</CardContent></Card>
  </div>
}
