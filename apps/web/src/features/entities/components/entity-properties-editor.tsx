import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { difficultyOptions, milestoneStatusOptions, priorityOptions, projectStatusOptions, taskStatusOptions, updateEntity, type DsaDifficulty, type Entity } from "@/lib/api"

function value(entity: Entity, key: string, fallback = "") {
  const current = entity.metadata[key]
  return current === undefined || current === null ? fallback : String(current)
}

export function EntityPropertiesEditor({ entity, onSaved }: { entity: Entity; onSaved: (entity: Entity) => void }) {
  const [title, setTitle] = useState(entity.title ?? "")
  const [tags, setTags] = useState(entity.tags.join(", "))
  const [metadata, setMetadata] = useState<Record<string, unknown>>(entity.metadata)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const baseStatusOptions = entity.type === "project" ? projectStatusOptions : entity.type === "milestone" ? milestoneStatusOptions : taskStatusOptions
  const currentStatus = value({ ...entity, metadata }, "status", entity.type === "project" ? "active" : entity.type === "milestone" ? "planned" : "backlog")
  const statusOptions = baseStatusOptions.some((item) => item === currentStatus) ? [...baseStatusOptions] : [currentStatus, ...baseStatusOptions]

  useEffect(() => {
    setTitle(entity.title ?? "")
    setTags(entity.tags.join(", "))
    setMetadata(entity.metadata)
  }, [entity.id, entity.title, entity.tags, entity.metadata])

  function setField(key: string, next: unknown) {
    setMetadata((current) => ({ ...current, [key]: next }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateEntity(entity.id, {
        title: title.trim(),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        metadata,
      })
      onSaved(updated)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save properties.")
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-4 rounded-lg border border-border bg-background p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Editable properties</p><p className="text-xs text-muted-foreground">Changes are saved to the same entity used by the tracker.</p></div><Badge>{entity.type ?? "entity"}</Badge></div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="space-y-2"><Label>Tags</Label><Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Comma-separated tags" /></div>
      {entity.type === "dsa_problem" ? <>
        <div className="space-y-2"><Label>Difficulty</Label><Select value={value({ ...entity, metadata }, "difficulty", "")} onValueChange={(next) => setField("difficulty", next as DsaDifficulty)}><SelectTrigger><SelectValue placeholder="Difficulty" /></SelectTrigger><SelectContent>{difficultyOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2 md:col-span-2"><Label>Solution code</Label><Textarea value={value({ ...entity, metadata }, "solution_code")} onChange={(event) => setField("solution_code", event.target.value)} /></div>
      </> : null}
      {entity.type === "project" ? <>
        <div className="space-y-2"><Label>Repository URL</Label><Input value={value({ ...entity, metadata }, "repo_url")} onChange={(event) => setField("repo_url", event.target.value)} /></div>
        <div className="space-y-2"><Label>Production URL</Label><Input value={value({ ...entity, metadata }, "production_url")} onChange={(event) => setField("production_url", event.target.value)} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Objective</Label><Textarea value={value({ ...entity, metadata }, "objective", entity.content ?? "")} onChange={(event) => setField("objective", event.target.value)} /></div>
        <div className="space-y-2"><Label>Success metric</Label><Input value={value({ ...entity, metadata }, "success_metric")} onChange={(event) => setField("success_metric", event.target.value)} /></div>
        <div className="space-y-2"><Label>Target date</Label><Input type="date" value={value({ ...entity, metadata }, "target_at")} onChange={(event) => setField("target_at", event.target.value)} /></div>
      </> : null}
      {entity.type === "milestone" ? <><div className="space-y-2 md:col-span-2"><Label>Outcome</Label><Textarea value={value({ ...entity, metadata }, "outcome", entity.content ?? "")} onChange={(event) => setField("outcome", event.target.value)} /></div><div className="space-y-2"><Label>Target date</Label><Input type="date" value={value({ ...entity, metadata }, "target_at")} onChange={(event) => setField("target_at", event.target.value)} /></div></> : null}
      {entity.type === "project" || entity.type === "milestone" || entity.type === "task" ? <>
        <div className="space-y-2"><Label>Status</Label><Select value={currentStatus} onValueChange={(next) => setField("status", next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Priority</Label><Select value={value({ ...entity, metadata }, "priority", "medium")} onValueChange={(next) => setField("priority", next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      </> : null}
      {entity.type === "task" ? <>
        <div className="space-y-2"><Label>Due date</Label><Input type="date" value={value({ ...entity, metadata }, "due_at")} onChange={(event) => setField("due_at", event.target.value)} /></div>
        <div className="space-y-2"><Label>Estimated minutes</Label><Input type="number" min="0" value={value({ ...entity, metadata }, "estimated_minutes", "0")} onChange={(event) => setField("estimated_minutes", Number(event.target.value))} /></div>
        <div className="space-y-2"><Label>Actual minutes</Label><Input type="number" min="0" value={value({ ...entity, metadata }, "actual_minutes", "0")} onChange={(event) => setField("actual_minutes", Number(event.target.value))} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Acceptance criteria</Label><Textarea value={value({ ...entity, metadata }, "acceptance_criteria")} onChange={(event) => setField("acceptance_criteria", event.target.value)} /></div>
        {currentStatus === "blocked" ? <div className="space-y-2 md:col-span-2"><Label>Blocked reason</Label><Textarea value={value({ ...entity, metadata }, "blocked_reason")} onChange={(event) => setField("blocked_reason", event.target.value)} /></div> : null}
      </> : null}
      {entity.type === "subject_topic" ? <>
        <div className="space-y-2"><Label>Exam date</Label><Input type="date" value={value({ ...entity, metadata }, "exam_date")} onChange={(event) => setField("exam_date", event.target.value)} /></div>
        <div className="space-y-2"><Label>Priority</Label><Select value={value({ ...entity, metadata }, "priority", "medium")} onValueChange={(next) => setField("priority", next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Progress %</Label><Input type="number" min="0" max="100" value={value({ ...entity, metadata }, "progress_percent", "0")} onChange={(event) => setField("progress_percent", Number(event.target.value))} /></div>
        <div className="space-y-2"><Label>Study sessions planned</Label><Input type="number" min="0" value={value({ ...entity, metadata }, "study_sessions_planned", "0")} onChange={(event) => setField("study_sessions_planned", Number(event.target.value))} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Syllabus units</Label><Input value={Array.isArray(metadata.syllabus_units) ? metadata.syllabus_units.join(", ") : ""} onChange={(event) => setField("syllabus_units", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></div>
      </> : null}
      <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-4 md:col-span-2">
        <input type="checkbox" checked={metadata.ai_exclude === true} onChange={(event) => setField("ai_exclude", event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
        <span><span className="text-sm font-medium text-foreground">Exclude from AI</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Keep this item out of AI prompts, retrieval, grading, and suggestions.</span></span>
      </label>
    </div>
    <div className="flex items-center gap-3"><Button type="button" onClick={() => void save()} disabled={saving || !title.trim()}>{saving ? "Saving..." : "Save properties"}</Button>{error ? <p className="text-sm text-danger">{error}</p> : null}</div>
  </div>
}
