import { useEffect, useState } from "react"
import { Activity, ArrowLeft, BookOpenCheck, CalendarDays, Github, LayoutDashboard, ListChecks, Plus, Settings2, X } from "lucide-react"
import { Link, useOutletContext, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { ProjectBoard } from "@/features/projects/project-board"
import { MilestoneForm, ProjectSettings, TaskForm } from "@/features/projects/project-forms"
import { ProjectOverview } from "@/features/projects/project-overview"
import { ProjectActivity, ProjectKnowledge, ProjectTimeline } from "@/features/projects/project-secondary-views"
import { displayLabel, errorMessage, formatDate, healthVariant, metaString, taskBoardStatus, type BoardStatus, type WorkspaceTab } from "@/features/projects/project-utils"
import { TaskDrawer } from "@/features/projects/task-drawer"
import { useModalFocus } from "@/hooks/use-modal-focus"
import {
  createEntity,
  createLink,
  generateComprehensionCheck,
  getProjectWorkspace,
  updateEntity,
  type Entity,
  type ProjectWorkspace,
  type UpdateEntityPayload,
} from "@/lib/api"

const tabs: Array<{ value: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "board", label: "Board", icon: ListChecks },
  { value: "timeline", label: "Timeline", icon: CalendarDays },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "knowledge", label: "Knowledge", icon: BookOpenCheck },
  { value: "settings", label: "Settings", icon: Settings2 },
]

export function ProjectWorkspacePage() {
  const { projectId } = useParams()
  const { addEntityToList, upsertEntityInList } = useOutletContext<EntitiesLayoutContext>()
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<WorkspaceTab>("overview")
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [defaultTaskMilestoneId, setDefaultTaskMilestoneId] = useState<string | undefined>()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [pendingCompletionTask, setPendingCompletionTask] = useState<Entity | null>(null)
  const [tilContent, setTilContent] = useState("")
  const [savingTil, setSavingTil] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { dialogRef, onDialogKeyDown } = useModalFocus(Boolean(pendingCompletionTask), () => {
    if (!savingTil) setPendingCompletionTask(null)
  })

  async function loadWorkspace() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const result = await getProjectWorkspace(projectId)
      setWorkspace(result)
      setSelectedTaskId((current) => current && result.tasks.some((task) => task.id === current) ? current : null)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadWorkspace() }, [projectId])
  const selectedTask = workspace?.tasks.find((task) => task.id === selectedTaskId) ?? null

  async function patchEntity(entityId: string, payload: UpdateEntityPayload) {
    try {
      const updated = await updateEntity(entityId, payload)
      upsertEntityInList(updated)
      await loadWorkspace()
      return updated
    } catch (updateError) {
      setError(errorMessage(updateError))
      return null
    }
  }

  async function changeTaskStatus(task: Entity, nextStatus: BoardStatus) {
    if (taskBoardStatus(task) === nextStatus) return
    if (nextStatus === "done") {
      setPendingCompletionTask(task)
      setTilContent("")
      setMessage(null)
      return
    }
    await patchEntity(task.id, { metadata: { status: nextStatus, ...(nextStatus !== "blocked" ? { blocked_reason: "" } : {}) } })
  }

  async function completeTask() {
    if (!pendingCompletionTask || !tilContent.trim()) return
    setSavingTil(true)
    try {
      const completed = await updateEntity(pendingCompletionTask.id, { metadata: { status: "done", completed_at: new Date().toISOString() } })
      const til = await createEntity({
        type: "til",
        title: `TIL: ${completed.title ?? "Completed task"}`,
        parent_id: null,
        content: tilContent.trim(),
        content_type: "markdown",
        tags: completed.tags,
        metadata: { source_task_id: completed.id, source_project_id: projectId },
      })
      await createLink({ from_id: completed.id, to_id: til.id, relation_type: "used_in", explanation: "Learning captured when this project task was completed.", status: "confirmed" })
      upsertEntityInList(completed)
      addEntityToList(til)
      if (metaString(completed, "ai_assist_level", "handwritten") !== "handwritten") {
        const check = await generateComprehensionCheck({ task_entity_id: completed.id, diff_or_summary: tilContent.trim() })
        setMessage(check.status === "generated" ? "Task completed, TIL saved, and a comprehension check was added." : "Task completed and learning saved.")
      } else {
        setMessage("Task completed and learning saved.")
      }
      setPendingCompletionTask(null)
      setTilContent("")
      await loadWorkspace()
    } catch (completeError) {
      setError(errorMessage(completeError))
    } finally {
      setSavingTil(false)
    }
  }

  function openTaskForm(milestoneId?: string) {
    setDefaultTaskMilestoneId(milestoneId ?? workspace?.milestones[0]?.id)
    setShowTaskForm(true)
  }

  if (loading && !workspace) return <div className="rounded-lg border border-border p-10 text-center text-sm text-muted-foreground">Loading the project workspace...</div>
  if (!workspace) return <div className="space-y-4"><Button asChild variant="outline"><Link to="/trackers/projects"><ArrowLeft className="mr-2 h-4 w-4" />Projects</Link></Button><div className="rounded-lg border border-danger/30 bg-danger/5 p-5 text-danger">{error ?? "Project not found."}</div></div>

  const { summary } = workspace
  const project = summary.project

  return <div className="space-y-6">
    <div className="flex flex-col gap-4">
      <Link to="/trackers/projects" className="flex w-fit items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" />Project portfolio</Link>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-3xl font-semibold text-foreground">{project.title ?? "Untitled project"}</h1><Badge variant={healthVariant(summary.health)}>{displayLabel(summary.health)}</Badge><Badge>{displayLabel(metaString(project, "status", "active"))}</Badge></div><p className="mt-2 max-w-4xl text-sm text-secondary">{metaString(project, "objective", project.content || "Add an objective in project settings.")}</p><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>{summary.progress_percent}% complete</span><span>{summary.open_task_count} open tasks</span><span>Target {formatDate(metaString(project, "target_at") || null)}</span>{metaString(project, "repo_url") ? <a className="flex items-center gap-1 text-primary hover:text-primary" href={metaString(project, "repo_url").startsWith("http") ? metaString(project, "repo_url") : `https://github.com/${metaString(project, "repo_url")}`} target="_blank" rel="noreferrer"><Github className="h-3.5 w-3.5" />Repository</a> : null}</div></div>
        <div className="flex gap-3"><Button variant="outline" onClick={() => setShowMilestoneForm(true)}><Plus className="mr-2 h-4 w-4" />Milestone</Button><Button onClick={() => openTaskForm()} disabled={workspace.milestones.length === 0}><Plus className="mr-2 h-4 w-4" />Task</Button></div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${summary.progress_percent}%` }} /></div>
    </div>

    <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">{tabs.map((item) => { const Icon = item.icon; return <button key={item.value} type="button" onClick={() => setTab(item.value)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors ${tab === item.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{item.label}</button> })}</div>
    {error ? <Notice tone="error" message={error} onClose={() => setError(null)} /> : null}
    {message ? <Notice tone="success" message={message} onClose={() => setMessage(null)} /> : null}

    {showMilestoneForm ? <MilestoneForm projectId={project.id} onCancel={() => setShowMilestoneForm(false)} onCreated={async (entity) => { addEntityToList(entity); setShowMilestoneForm(false); await loadWorkspace() }} /> : null}
    {showTaskForm ? <TaskForm key={defaultTaskMilestoneId} milestones={workspace.milestones} defaultMilestoneId={defaultTaskMilestoneId} onCancel={() => setShowTaskForm(false)} onCreated={async (entity) => { addEntityToList(entity); setShowTaskForm(false); await loadWorkspace() }} /> : null}

    {tab === "overview" ? <ProjectOverview workspace={workspace} onSelectTask={(task) => setSelectedTaskId(task.id)} onAddMilestone={() => setShowMilestoneForm(true)} /> : null}
    {tab === "board" ? <ProjectBoard tasks={workspace.tasks} milestones={workspace.milestones} onSelectTask={(task) => setSelectedTaskId(task.id)} onStatus={(task, status) => void changeTaskStatus(task, status)} onAddTask={openTaskForm} /> : null}
    {tab === "timeline" ? <ProjectTimeline workspace={workspace} onSelectTask={(task) => setSelectedTaskId(task.id)} /> : null}
    {tab === "activity" ? <ProjectActivity workspace={workspace} /> : null}
    {tab === "knowledge" ? <ProjectKnowledge workspace={workspace} /> : null}
    {tab === "settings" ? <ProjectSettings project={project} onSave={async (payload) => { await patchEntity(project.id, payload) }} /> : null}

    {selectedTask ? <TaskDrawer task={selectedTask} milestones={workspace.milestones} tasks={workspace.tasks} relationships={workspace.relationships} onClose={() => setSelectedTaskId(null)} onSave={async (payload, nextStatus) => { if (nextStatus === "done" && taskBoardStatus(selectedTask) !== "done") { const updated = await patchEntity(selectedTask.id, { ...payload, metadata: { ...(payload.metadata ?? {}), status: metaString(selectedTask, "status", "backlog") } }); if (updated) setPendingCompletionTask(updated) } else { await patchEntity(selectedTask.id, payload) } }} onStatus={(status) => void changeTaskStatus(selectedTask, status)} onRefresh={loadWorkspace} /> : null}
    {pendingCompletionTask ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingTil) setPendingCompletionTask(null) }}><Card ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-learning-title" tabIndex={-1} onKeyDown={onDialogKeyDown} className="w-full max-w-2xl outline-none"><CardHeader><CardTitle id="project-learning-title">What did you learn?</CardTitle><CardDescription>Complete {pendingCompletionTask.title} and connect durable learning to the work.</CardDescription></CardHeader><CardContent className="space-y-4"><Textarea aria-label="Learning retained from this task" value={tilContent} onChange={(event) => setTilContent(event.target.value)} className="min-h-40" placeholder="Key decision, tradeoff, bug, or concept you want to retain" /><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setPendingCompletionTask(null)} disabled={savingTil}>Cancel</Button><Button onClick={() => void completeTask()} disabled={!tilContent.trim() || savingTil}>{savingTil ? "Saving..." : "Complete + save TIL"}</Button></div></CardContent></Card></div> : null}
  </div>
}

function Notice({ tone, message, onClose }: { tone: "error" | "success"; message: string; onClose: () => void }) {
  return <div className={`flex items-center justify-between rounded-lg border p-4 text-sm ${tone === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}><span>{message}</span><button onClick={onClose} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>
}
