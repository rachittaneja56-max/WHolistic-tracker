import { useEffect, useMemo, useState } from "react"
import { BookOpen, BriefcaseBusiness, CheckSquare2, Code2, Lightbulb, LockKeyhole, NotebookPen } from "lucide-react"
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { buildCapturePayload, type CaptureFlow } from "@/features/capture/capture-payload"
import { academicKindOptions, normalizeCapturePrefill, type AcademicKind } from "@/features/capture/capture-prefill"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { createEntity, recordProductEvent } from "@/lib/api"

const flows: Array<{
  id: CaptureFlow
  label: string
  description: string
  icon: typeof NotebookPen
  titlePlaceholder: string
  contentLabel: string
  contentPlaceholder: string
}> = [
  { id: "note", label: "Note", description: "Save an explanation, reference, or learning.", icon: NotebookPen, titlePlaceholder: "What is this note about?", contentLabel: "What do you want to remember?", contentPlaceholder: "Write the useful part in your own words..." },
  { id: "practice_problem", label: "Practice problem", description: "Track a DSA problem and your approach.", icon: Code2, titlePlaceholder: "Problem title", contentLabel: "Approach, mistakes, and review cues", contentPlaceholder: "What did you try? What should future-you notice?" },
  { id: "assignment", label: "Assignment", description: "Capture coursework with a due date.", icon: CheckSquare2, titlePlaceholder: "Assignment title", contentLabel: "Requirements and next step", contentPlaceholder: "What is expected, and what will you do first?" },
  { id: "project", label: "Project", description: "Create a goal you can plan and ship.", icon: BriefcaseBusiness, titlePlaceholder: "Project name", contentLabel: "Outcome and motivation", contentPlaceholder: "What will exist when this is complete?" },
  { id: "subject", label: "Subject", description: "Organize a course or learning area.", icon: BookOpen, titlePlaceholder: "Subject or course name", contentLabel: "Scope and learning goals", contentPlaceholder: "What are you learning, and why?" },
  { id: "idea", label: "Idea", description: "Keep a possibility without committing yet.", icon: Lightbulb, titlePlaceholder: "Idea in one line", contentLabel: "Why might this be useful?", contentPlaceholder: "Add the observation, audience, or problem behind it..." },
]

const topLevelSubjectValue = "__top_level_subject__"

const noteTemplates: Record<string, string> = {
  lecture: "## Key ideas\n\n- \n\n## Examples\n\n## Questions to revisit\n\n## Connections\n",
  lab: "## Goal\n\n## Setup\n\n## Observations\n\n## Results\n\n## Fixes / follow-up\n",
  reading: "## Source and thesis\n\n## Evidence and notes\n\n## What changed my mind\n\n## Connections\n",
  debugging: "## Symptom\n\n## Hypothesis\n\n## Investigation\n\n## Resolution\n\n## Prevention\n",
  "project-decision": "## Context\n\n## Options considered\n\n## Decision\n\n## Consequences and follow-up\n",
  "exam-summary": "## Concept map\n\n## High-confidence topics\n\n## Weak areas\n\n## Revision prompts\n",
}

function flowFromQuery(value: string | null): CaptureFlow {
  if (value === "dsa_problem" || value === "practice_problem") return "practice_problem"
  if (value === "task" || value === "assignment") return "assignment"
  if (value === "subject_topic" || value === "subject") return "subject"
  if (value === "project" || value === "idea" || value === "note") return value
  return "note"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "This item could not be saved."
}

export function CapturePage() {
  const navigate = useNavigate()
  const { entities, isEntitiesLoading, entitiesError, refreshEntities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()
  const [searchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const prefill = useMemo(() => normalizeCapturePrefill(new URLSearchParams(searchKey)), [searchKey])
  const templateContent = noteTemplates[searchParams.get("template") ?? ""] ?? ""
  const initialFlow = flowFromQuery(searchParams.get("type"))
  const [flow, setFlow] = useState<CaptureFlow>(initialFlow)
  const [title, setTitle] = useState(prefill.title)
  const [content, setContent] = useState(prefill.content || templateContent)
  const [tags, setTags] = useState(prefill.tags)
  const [parentId, setParentId] = useState(prefill.parentId)
  const [academicKind, setAcademicKind] = useState<AcademicKind>(prefill.academicKind ?? "assignment")
  const [dueAt, setDueAt] = useState("")
  const [examDate, setExamDate] = useState("")
  const [difficulty, setDifficulty] = useState("unset")
  const [status, setStatus] = useState("unsolved")
  const [priority, setPriority] = useState("medium")
  const [sourceUrl, setSourceUrl] = useState(searchParams.get("url") ?? "")
  const [aiExclude, setAiExclude] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(() => flows.find((item) => item.id === flow) ?? flows[0], [flow])
  const taskParents = useMemo(
    () => entities.filter((entity) => entity.type === "project" || entity.type === "milestone" || entity.type === "subject_topic"),
    [entities],
  )
  const subjectParents = useMemo(
    () => entities.filter((entity) => entity.type === "subject_topic"),
    [entities],
  )
  const activeParentOptions = flow === "assignment" ? taskParents : subjectParents
  const hasUnlistedParent = Boolean(parentId && !activeParentOptions.some((entity) => entity.id === parentId))

  useEffect(() => {
    void refreshEntities()
  }, [refreshEntities])

  function chooseFlow(nextFlow: CaptureFlow) {
    setFlow(nextFlow)
    setError(null)
    if (nextFlow !== "assignment" && nextFlow !== "subject") setParentId("")
    if (nextFlow === "subject" && parentId && !subjectParents.some((entity) => entity.id === parentId)) setParentId("")
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError("Add a clear title before saving.")
      return
    }
    if (flow === "assignment" && !parentId) {
      setError("Choose the project, milestone, subject, or topic this assignment belongs to.")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const entity = await createEntity(buildCapturePayload({
        flow,
        title,
        content,
        tags,
        parentId,
        academicKind,
        dueAt,
        examDate,
        difficulty,
        problemStatus: status,
        priority,
        sourceUrl,
        aiExclude,
      }))
      addEntityToList(entity)
      void recordProductEvent("first_capture", { item_type: flow, source: "web" }).catch(() => undefined)
      navigate(`/knowledge/entities/${entity.id}`)
    } catch (saveError) {
      setError(errorMessage(saveError))
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Global capture</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">What are you working on?</h1>
        <p className="mt-2 max-w-2xl text-sm text-secondary">Choose a familiar activity. Personal Dev KG derives the entity and content format for you.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Capture type">
        {flows.map((item) => {
          const Icon = item.icon
          const selected = flow === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseFlow(item.id)}
              className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/40"}`}
            >
              <Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-foreground">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capture a {active.label.toLowerCase()}</CardTitle>
          <CardDescription>Start with the essentials. Optional fields stay out of the way until you need them.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="capture-title">Title</Label>
              <Input id="capture-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={active.titlePlaceholder} maxLength={300} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capture-content">{active.contentLabel}</Label>
              <Textarea id="capture-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder={active.contentPlaceholder} className="min-h-[200px]" maxLength={50000} />
              <p className="text-right text-xs text-muted-foreground">{content.length.toLocaleString()} / 50,000</p>
            </div>

            {flow === "assignment" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Work type</Label>
                    <Select value={academicKind} onValueChange={(value) => setAcademicKind(value as AcademicKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{academicKindOptions.map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label htmlFor="assignment-due">Due date</Label><Input id="assignment-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "urgent"].map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-2">
                  <Label>Belongs to</Label>
                  <Select value={parentId} onValueChange={setParentId} disabled={isEntitiesLoading && !parentId}>
                    <SelectTrigger aria-required="true"><SelectValue placeholder={isEntitiesLoading ? "Loading projects and subjects..." : "Choose a project, milestone, subject, or topic"} /></SelectTrigger>
                    <SelectContent>
                      {hasUnlistedParent ? <SelectItem value={parentId}>Linked parent ({parentId})</SelectItem> : null}
                      {taskParents.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.title ?? "Untitled"} ({entity.type})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {entitiesError ? <p className="text-xs text-warning">Parent choices could not be loaded. Try again before saving.</p> : null}
                  {!isEntitiesLoading && !entitiesError && !taskParents.length ? <p className="text-xs text-warning">Create a project, milestone, subject, or topic before adding an assignment.</p> : null}
                </div>
              </div>
            ) : null}

            {flow === "subject" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="subject-exam">Exam date (optional)</Label><Input id="subject-exam" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Parent subject or topic (optional)</Label>
                  <Select value={parentId || topLevelSubjectValue} onValueChange={(value) => setParentId(value === topLevelSubjectValue ? "" : value)} disabled={isEntitiesLoading && !parentId}>
                    <SelectTrigger><SelectValue placeholder={isEntitiesLoading ? "Loading subjects..." : "Create a top-level subject"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={topLevelSubjectValue}>No parent (top-level subject)</SelectItem>
                      {hasUnlistedParent ? <SelectItem value={parentId}>Linked parent ({parentId})</SelectItem> : null}
                      {subjectParents.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.title ?? "Untitled"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {entitiesError ? <p className="text-xs text-warning">Parent choices could not be loaded. The prefilled relationship will still be preserved.</p> : null}
                </div>
              </div>
            ) : null}

            {flow === "practice_problem" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Difficulty</Label><Select value={difficulty} onValueChange={setDifficulty}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Not set</SelectItem><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unsolved">Not solved</SelectItem><SelectItem value="review">Needs review</SelectItem><SelectItem value="solved">Solved</SelectItem></SelectContent></Select></div>
              </div>
            ) : null}

            <details className="rounded-xl border border-border bg-background p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">Optional details</summary>
              <div className="mt-5 space-y-5">
                <div className="space-y-2"><Label htmlFor="capture-tags">Tags</Label><Input id="capture-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="algorithms, semester-3, backend" /><p className="text-xs text-muted-foreground">Separate tags with commas.</p></div>
                {flow === "practice_problem" ? <div className="space-y-2"><Label htmlFor="problem-url">Problem URL</Label><Input id="problem-url" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://leetcode.com/problems/..." /></div> : null}
                <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-4">
                  <input type="checkbox" checked={aiExclude} onChange={(event) => setAiExclude(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                  <span><span className="flex items-center gap-2 text-sm font-medium text-foreground"><LockKeyhole className="h-4 w-4" aria-hidden="true" />Exclude from AI</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">This item remains in your workspace but is omitted from AI prompts, retrieval, grading, and suggestions.</span></span>
                </label>
              </div>
            </details>

            {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim()}>{saving ? "Saving..." : `Save ${active.label.toLowerCase()}`}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
