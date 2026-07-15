import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { boardColumns, metaString, type BoardStatus } from "@/features/projects/project-utils"
import {
  createEntity,
  priorityOptions,
  projectStatusOptions,
  type CreateEntityPayload,
  type Entity,
  type UpdateEntityPayload,
  type WorkPriority,
} from "@/lib/api"

export function MilestoneForm({ projectId, onCancel, onCreated }: { projectId: string; onCancel: () => void; onCreated: (entity: Entity) => void | Promise<void> }) {
  const [title, setTitle] = useState("")
  const [outcome, setOutcome] = useState("")
  const [targetAt, setTargetAt] = useState("")
  const [priority, setPriority] = useState<WorkPriority>("medium")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const entity = await createEntity({
        type: "milestone",
        parent_id: projectId,
        title: title.trim(),
        content: outcome.trim(),
        content_type: "markdown",
        tags: [],
        metadata: { status: "planned", priority, outcome: outcome.trim(), ...(targetAt ? { target_at: targetAt } : {}) },
      })
      await onCreated(entity)
    } finally {
      setSaving(false)
    }
  }

  return <Card className="border-primary/30"><CardHeader><CardTitle>New milestone</CardTitle><CardDescription>Define an outcome checkpoint, not just a bucket of tasks.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void submit(event)} className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></div><div className="space-y-2"><Label>Target date</Label><Input type="date" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label>Outcome</Label><Textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} /></div><div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end justify-end gap-3"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!title.trim() || saving}>{saving ? "Adding..." : "Add milestone"}</Button></div></form></CardContent></Card>
}

export function TaskForm({ milestones, defaultMilestoneId, onCancel, onCreated }: { milestones: Entity[]; defaultMilestoneId?: string; onCancel: () => void; onCreated: (entity: Entity) => void | Promise<void> }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [milestoneId, setMilestoneId] = useState(defaultMilestoneId ?? milestones[0]?.id ?? "")
  const [status, setStatus] = useState<BoardStatus>("backlog")
  const [priority, setPriority] = useState<WorkPriority>("medium")
  const [dueAt, setDueAt] = useState("")
  const [estimate, setEstimate] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !milestoneId) return
    setSaving(true)
    try {
      const payload: CreateEntityPayload = {
        type: "task",
        parent_id: milestoneId,
        title: title.trim(),
        content: description.trim(),
        content_type: "markdown",
        tags: [],
        metadata: {
          status,
          priority,
          ai_assist_level: "handwritten",
          ...(dueAt ? { due_at: dueAt } : {}),
          ...(estimate ? { estimated_minutes: Number(estimate) } : {}),
        },
      }
      await onCreated(await createEntity(payload))
    } finally {
      setSaving(false)
    }
  }

  return <Card className="border-primary/30"><CardHeader><CardTitle>New task</CardTitle><CardDescription>Add executable work with enough context to finish it.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void submit(event)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2 md:col-span-2"><Label>Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></div><div className="space-y-2"><Label>Milestone</Label><Select value={milestoneId} onValueChange={setMilestoneId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{milestones.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={(value) => setStatus(value as BoardStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{boardColumns.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Due</Label><Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div><div className="space-y-2"><Label>Estimate (minutes)</Label><Input type="number" min="0" step="15" value={estimate} onChange={(event) => setEstimate(event.target.value)} /></div><div className="flex items-end justify-end gap-3 xl:col-span-3"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!title.trim() || !milestoneId || saving}>{saving ? "Adding..." : "Add task"}</Button></div></form></CardContent></Card>
}

export function ProjectSettings({ project, onSave }: { project: Entity; onSave: (payload: UpdateEntityPayload) => void | Promise<void> }) {
  const [title, setTitle] = useState(project.title ?? "")
  const [objective, setObjective] = useState(metaString(project, "objective", project.content ?? ""))
  const [metric, setMetric] = useState(metaString(project, "success_metric"))
  const [status, setStatus] = useState(metaString(project, "status", "active"))
  const [priority, setPriority] = useState<WorkPriority>(metaString(project, "priority", "medium") as WorkPriority)
  const [startAt, setStartAt] = useState(metaString(project, "start_at"))
  const [targetAt, setTargetAt] = useState(metaString(project, "target_at"))
  const [repo, setRepo] = useState(metaString(project, "repo_url"))
  const [production, setProduction] = useState(metaString(project, "production_url"))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        content: objective,
        metadata: {
          status,
          priority,
          objective,
          success_metric: metric,
          start_at: startAt,
          target_at: targetAt,
          repo_url: repo,
          production_url: production,
          ...(status === "archived" ? { archived_at: new Date().toISOString() } : {}),
        },
      })
    } finally {
      setSaving(false)
    }
  }

  return <Card><CardHeader><CardTitle>Project settings</CardTitle><CardDescription>Strategy, delivery dates, repository matching, and lifecycle.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Project name</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{projectStatusOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2 md:col-span-2"><Label>Objective</Label><Textarea value={objective} onChange={(event) => setObjective(event.target.value)} /></div><div className="space-y-2"><Label>Success metric</Label><Input value={metric} onChange={(event) => setMetric(event.target.value)} /></div><div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={(value) => setPriority(value as WorkPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Start date</Label><Input type="date" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></div><div className="space-y-2"><Label>Target date</Label><Input type="date" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} /></div><div className="space-y-2"><Label>Repository</Label><Input value={repo} onChange={(event) => setRepo(event.target.value)} /></div><div className="space-y-2"><Label>Production URL</Label><Input value={production} onChange={(event) => setProduction(event.target.value)} /></div><div className="flex justify-end md:col-span-2"><Button onClick={() => void save()} disabled={saving || !title.trim()}>{saving ? "Saving..." : "Save project"}</Button></div></CardContent></Card>
}
