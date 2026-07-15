import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { BookOpenCheck, CheckCircle2, FileText, Lightbulb, ListTodo } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { deriveCaptureTitle, isQuickCaptureType, isValidQuickTaskParent, parseCaptureTags, type QuickCaptureType } from "@/features/capture/capture-prefill"
import type { CaptureEntityDraft } from "@/features/entities/components/capture-entity-form"
import { createEntity, type Entity } from "@/lib/api"

type Props = {
  draft: CaptureEntityDraft
  availableEntities: Entity[]
  onDraftChange: (draft: CaptureEntityDraft) => void
  onCreated: (entity: Entity) => void
}

const typeOptions: Array<{ type: QuickCaptureType; label: string; icon: typeof FileText }> = [
  { type: "note", label: "Note", icon: FileText },
  { type: "idea", label: "Idea", icon: Lightbulb },
  { type: "til", label: "TIL", icon: BookOpenCheck },
  { type: "task", label: "Task", icon: ListTodo },
]

export function QuickCaptureForm({ draft, availableEntities, onDraftChange, onCreated }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<Entity | null>(null)
  const selectedType = isQuickCaptureType(draft.type || "note") ? draft.type as QuickCaptureType : "note"
  const taskParents = availableEntities.filter((entity) => entity.type === "project" || entity.type === "milestone" || entity.type === "subject_topic")

  function update(values: Partial<CaptureEntityDraft>) {
    setError(null)
    onDraftChange({ ...draft, ...values })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!window.navigator.onLine) {
      setError("A connection is required to save this capture. Your content has not been queued or uploaded.")
      return
    }

    const title = draft.title.trim() || deriveCaptureTitle(draft.content)
    if (!title) {
      setError("Add some content or enter a title.")
      return
    }
    if (selectedType === "task" && !isValidQuickTaskParent(draft.parentId, availableEntities)) {
      setError("Choose the project, milestone, subject, or topic this task belongs to.")
      return
    }

    setIsSubmitting(true)
    try {
      const entity = await createEntity({
        title,
        type: selectedType,
        parent_id: draft.parentId || null,
        content: draft.content,
        content_type: "markdown",
        tags: parseCaptureTags(draft.tags),
        metadata: selectedType === "task" ? { status: "backlog" } : {},
      })
      setLastCreated(entity)
      onCreated(entity)
      onDraftChange({ title: "", content: "", type: "note", contentType: "markdown", parentId: "", tags: "" })
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to save this capture.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return <div className="space-y-4">
    {lastCreated ? <div role="status" className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="truncate">Saved {lastCreated.title ?? "capture"}</span></span>
      <Button asChild size="sm" variant="outline"><Link to={`/knowledge/entities/${lastCreated.id}`}>View entity</Link></Button>
    </div> : null}

    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Quick capture</CardTitle><CardDescription className="mt-1">Write first. Add structure only when it helps.</CardDescription></div>
          <Badge variant="blue">Markdown</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit} noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Capture as</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {typeOptions.map((option) => {
                const Icon = option.icon
                const selected = selectedType === option.type
                return <Button
                  key={option.type}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  className="justify-start"
                  onClick={() => update({ type: option.type, contentType: "markdown" })}
                >
                  <Icon className="mr-2 h-4 w-4" />{option.label}
                </Button>
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="quick-content">What do you want to keep?</Label>
            <Textarea
              id="quick-content"
              autoFocus
              className="min-h-56 resize-y sm:min-h-64"
              value={draft.content}
              onChange={(event) => update({ content: event.target.value })}
              placeholder="Paste a link, write a note, record an idea, or describe a task…"
            />
            <p className="text-xs text-muted-foreground">If the title is empty, the first non-empty line becomes the title.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-title">Title <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="quick-title" value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="Derived automatically when blank" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-tags">Tags <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="quick-tags" value={draft.tags} onChange={(event) => update({ tags: event.target.value })} placeholder="fastapi, reading, follow-up" />
            </div>
          </div>

          {selectedType === "task" ? <div className="space-y-2">
            <Label>Task parent</Label>
            <Select value={draft.parentId} onValueChange={(value) => update({ parentId: value })}>
              <SelectTrigger aria-invalid={Boolean(error && !draft.parentId)}><SelectValue placeholder="Choose a project, milestone, subject, or topic" /></SelectTrigger>
              <SelectContent>{taskParents.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.title ?? "Untitled"} · {entity.type}</SelectItem>)}</SelectContent>
            </Select>
            {!taskParents.length ? <p className="text-xs text-warning">Create a project, milestone, subject, or topic in Advanced capture before adding a task.</p> : null}
          </div> : null}

          {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}

          <div className="sticky bottom-0 z-10 -mx-2 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur">
            <p className="hidden text-xs text-muted-foreground sm:block">Nothing is saved until you tap the button.</p>
            <Button type="submit" className="w-full sm:ml-auto sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save capture"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
}
