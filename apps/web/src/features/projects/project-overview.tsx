import { AlertTriangle, CheckCircle2, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { displayLabel, formatDate, metaString, taskBoardStatus } from "@/features/projects/project-utils"
import type { Entity, ProjectWorkspace } from "@/lib/api"

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-lg border border-border bg-background p-4"><p className="text-2xl font-semibold text-foreground">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p>{detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}</div>
}

export function ProjectOverview({ workspace, onSelectTask, onAddMilestone }: { workspace: ProjectWorkspace; onSelectTask: (task: Entity) => void; onAddMilestone: () => void }) {
  const { summary } = workspace
  const milestoneById = new Map(workspace.milestones.map((item) => [item.id, item]))
  const nextWork = workspace.tasks.filter((task) => ["ready", "in_progress", "blocked"].includes(taskBoardStatus(task))).slice(0, 6)

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Progress" value={`${summary.progress_percent}%`} detail={`${summary.completed_task_count} of ${summary.task_count} tasks`} />
      <Metric label="Blocked" value={summary.blocked_task_count} detail={summary.blocked_task_count ? "Needs intervention" : "No blockers"} />
      <Metric label="Overdue" value={summary.overdue_task_count} />
      <Metric label="Shipped this week" value={summary.shipped_this_week} />
      <Metric label="Learning coverage" value={`${summary.til_coverage_percent}%`} detail={`${summary.comprehension_debt_count} comprehension debt`} />
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card><CardHeader><CardTitle>Project health</CardTitle><CardDescription>Explainable signals derived from the work, not an opaque AI score.</CardDescription></CardHeader><CardContent className="space-y-3">{summary.health_reasons.map((reason) => <div key={reason} className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm text-secondary">{summary.health === "on_track" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}<span>{reason}</span></div>)}<div className="grid gap-3 pt-2 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Success metric</p><p className="mt-1 text-sm text-secondary">{metaString(summary.project, "success_metric", "Not defined")}</p></div><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Next deadline</p><p className="mt-1 text-sm text-secondary">{formatDate(summary.next_deadline)}</p></div></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Next work</CardTitle><CardDescription>Ready, active, and blocked items requiring attention.</CardDescription></CardHeader><CardContent className="space-y-2">{nextWork.map((task) => <button key={task.id} onClick={() => onSelectTask(task)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left hover:border-border-strong"><div className="min-w-0"><p className="truncate text-sm text-foreground">{task.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{milestoneById.get(task.parent_id ?? "")?.title}</p></div><Badge variant={taskBoardStatus(task) === "blocked" ? "warning" : "default"}>{displayLabel(taskBoardStatus(task))}</Badge></button>)}{nextWork.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No committed next work yet.</p> : null}</CardContent></Card>
    </div>
    <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Milestones</CardTitle><CardDescription>Outcome checkpoints for this project.</CardDescription></div><Button size="sm" variant="outline" onClick={onAddMilestone}><Plus className="mr-2 h-4 w-4" />Add</Button></div></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{workspace.milestones.map((milestone) => { const tasks = workspace.tasks.filter((task) => task.parent_id === milestone.id); const done = tasks.filter((task) => taskBoardStatus(task) === "done").length; return <div key={milestone.id} className="rounded-lg border border-border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-foreground">{milestone.title}</p><p className="mt-1 text-xs text-muted-foreground">{metaString(milestone, "outcome", milestone.content || "No outcome defined")}</p></div><Badge>{displayLabel(metaString(milestone, "status", "planned"))}</Badge></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{done}/{tasks.length} tasks</span><span>{formatDate(metaString(milestone, "target_at") || null)}</span></div></div> })}{workspace.milestones.length === 0 ? <button onClick={onAddMilestone} className="rounded-lg border border-dashed border-border-strong p-8 text-sm text-muted-foreground hover:border-primary hover:text-secondary">Add the first milestone</button> : null}</CardContent></Card>
  </div>
}
