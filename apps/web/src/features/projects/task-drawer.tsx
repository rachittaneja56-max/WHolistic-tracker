import { useEffect, useState } from "react"
import { ChevronRight, Clock3, Network, Timer, X } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { boardColumns, metaNumber, metaString, taskBoardStatus, type BoardStatus } from "@/features/projects/project-utils"
import {
  aiAssistLevelOptions,
  createLink,
  createSession,
  priorityOptions,
  type AiAssistLevel,
  type Entity,
  type ProjectWorkspace,
  type UpdateEntityPayload,
  type WorkPriority,
} from "@/lib/api"

type Props = {
  task: Entity
  milestones: Entity[]
  tasks: Entity[]
  relationships: ProjectWorkspace["relationships"]
  onClose: () => void
  onSave: (payload: UpdateEntityPayload, nextStatus: BoardStatus) => void | Promise<void>
  onStatus: (status: BoardStatus) => void
  onRefresh: () => void | Promise<void>
}

export function TaskDrawer({ task, milestones, tasks, relationships, onClose, onSave, onStatus, onRefresh }: Props) {
  const [title, setTitle] = useState(task.title ?? "")
  const [content, setContent] = useState(task.content ?? "")
  const [milestoneId, setMilestoneId] = useState(task.parent_id ?? "")
  const [status, setStatus] = useState<BoardStatus>(taskBoardStatus(task))
  const [priority, setPriority] = useState<WorkPriority>(metaString(task, "priority", "medium") as WorkPriority)
  const [dueAt, setDueAt] = useState(metaString(task, "due_at"))
  const [estimated, setEstimated] = useState(String(metaNumber(task, "estimated_minutes", 0) || ""))
  const [actual, setActual] = useState(String(metaNumber(task, "actual_minutes", 0) || ""))
  const [blockedReason, setBlockedReason] = useState(metaString(task, "blocked_reason"))
  const [acceptance, setAcceptance] = useState(metaString(task, "acceptance_criteria"))
  const [aiAssist, setAiAssist] = useState<AiAssistLevel>(metaString(task, "ai_assist_level", "handwritten") as AiAssistLevel)
  const [dependencyId, setDependencyId] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(task.title ?? "")
    setContent(task.content ?? "")
    setMilestoneId(task.parent_id ?? "")
    setStatus(taskBoardStatus(task))
    setPriority(metaString(task, "priority", "medium") as WorkPriority)
    setDueAt(metaString(task, "due_at"))
    setEstimated(String(metaNumber(task, "estimated_minutes", 0) || ""))
    setActual(String(metaNumber(task, "actual_minutes", 0) || ""))
    setBlockedReason(metaString(task, "blocked_reason"))
    setAcceptance(metaString(task, "acceptance_criteria"))
    setAiAssist(metaString(task, "ai_assist_level", "handwritten") as AiAssistLevel)
  }, [task])

  const dependencies = relationships.filter((link) =>
    (link.from_id === task.id || link.to_id === task.id) && ["depends_on", "blocks"].includes(link.relation_type ?? ""),
  )

  async function save() {
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        content,
        parent_id: milestoneId,
        metadata: {
          status,
          priority,
          due_at: dueAt,
          estimated_minutes: estimated ? Number(estimated) : 0,
          actual_minutes: actual ? Number(actual) : 0,
          blocked_reason: blockedReason,
          acceptance_criteria: acceptance,
          ai_assist_level: aiAssist,
        },
      }, status)
    } finally {
      setSaving(false)
    }
  }

  async function addDependency() {
    if (!dependencyId) return
    await createLink({
      from_id: task.id,
      to_id: dependencyId,
      relation_type: "depends_on",
      explanation: `${task.title ?? "This task"} depends on ${tasks.find((item) => item.id === dependencyId)?.title ?? "another task"}.`,
      status: "confirmed",
    })
    setDependencyId("")
    await onRefresh()
  }

  async function logWork(action: "work_started" | "work_logged") {
    await createSession({ entity_id: task.id, action, meta: action === "work_logged" ? { duration_minutes: 30 } : {} })
    await onRefresh()
  }

  return <div className="fixed inset-0 z-40">
    <button className="absolute inset-0 bg-black/60" aria-label="Close task details" onClick={onClose} />
    <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-400">Task details</p><h2 className="mt-2 text-xl font-semibold text-zinc-100">{task.title}</h2></div><Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button></div>
      <div className="mt-6 space-y-5">
        <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-28" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Milestone</Label><Select value={milestoneId} onValueChange={setMilestoneId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{milestones.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={(value) => setStatus(value as BoardStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{boardColumns.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Due</Label><Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div>
          <div className="space-y-2"><Label>Estimate (minutes)</Label><Input type="number" min="0" value={estimated} onChange={(event) => setEstimated(event.target.value)} /></div>
          <div className="space-y-2"><Label>Actual (minutes)</Label><Input type="number" min="0" value={actual} onChange={(event) => setActual(event.target.value)} /></div>
        </div>
        {status === "blocked" ? <div className="space-y-2"><Label>Blocked reason</Label><Textarea value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} placeholder="What needs to change before work can continue?" /></div> : null}
        <div className="space-y-2"><Label>Acceptance criteria</Label><Textarea value={acceptance} onChange={(event) => setAcceptance(event.target.value)} placeholder="How will you know this task is correctly finished?" /></div>
        <div className="space-y-2"><Label>AI assist level</Label><Select value={aiAssist} onValueChange={(value) => setAiAssist(value as AiAssistLevel)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{aiAssistLevelOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div><p className="text-sm font-medium text-zinc-200">Dependencies</p><p className="text-xs text-zinc-600">Use graph links for cross-task ordering.</p></div>
          {dependencies.map((link) => { const otherId = link.from_id === task.id ? link.to_id : link.from_id; return <div key={link.id} className="flex items-center gap-2 text-sm text-zinc-400"><Network className="h-4 w-4 text-zinc-600" />{tasks.find((item) => item.id === otherId)?.title ?? "Linked task"}</div> })}
          <div className="flex gap-2"><Select value={dependencyId} onValueChange={setDependencyId}><SelectTrigger><SelectValue placeholder="Select dependency" /></SelectTrigger><SelectContent>{tasks.filter((item) => item.id !== task.id).map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" onClick={() => void addDependency()} disabled={!dependencyId}>Link</Button></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void logWork("work_started")}><Timer className="mr-2 h-4 w-4" />Start work</Button><Button variant="outline" onClick={() => void logWork("work_logged")}><Clock3 className="mr-2 h-4 w-4" />Log 30m</Button><Button variant="ghost" onClick={() => onStatus(status)}>Move now</Button></div>
        <div className="flex justify-between border-t border-zinc-800 pt-5"><Button asChild variant="outline"><Link to={`/knowledge/entities/${task.id}`}>Open full entity<ChevronRight className="ml-2 h-4 w-4" /></Link></Button><Button onClick={() => void save()} disabled={saving || !title.trim()}>{saving ? "Saving..." : "Save task"}</Button></div>
      </div>
    </aside>
  </div>
}
