import { useMemo, useState, type FormEvent } from "react"

import {
  aiAssistLevelOptions,
  createEntity,
  difficultyOptions,
  entityTypeOptions,
  taskStatusOptions,
  type AiAssistLevel,
  type ContentType,
  type DsaDifficulty,
  type Entity,
  type EntityType,
  type TaskStatus,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EntityEditor } from "@/features/entities/components/entity-editor"
import { convertEntityContent, getDefaultContentTypeForEntityType } from "@/features/entities/content"

type CaptureEntityFormProps = {
  onCreated: (entity: Entity) => void
  availableEntities: Entity[]
  initialTitle?: string
  initialContent?: string
  initialType?: EntityType
  initialContentType?: ContentType
  initialParentId?: string
  initialAcademicKind?: AcademicKind
}

type FieldErrors = {
  title?: string
  type?: string
  contentType?: string
  parentId?: string
}

type CreateShortcut = {
  label: string
  type: EntityType
  contentType: ContentType
}

export type AcademicKind = "assignment" | "exam" | "revision" | "reading" | "project"
type AcademicRecurrence = "none" | "daily" | "weekly" | "monthly"

const createShortcuts: CreateShortcut[] = [
  { label: "New Note", type: "note", contentType: "blocks" },
  { label: "New Canvas", type: "canvas", contentType: "canvas_json" },
  { label: "New DSA Problem", type: "dsa_problem", contentType: "markdown" },
  { label: "New TIL", type: "til", contentType: "markdown" },
]

export const academicKindOptions: AcademicKind[] = ["assignment", "exam", "revision", "reading", "project"]
const academicRecurrenceOptions: AcademicRecurrence[] = ["none", "daily", "weekly", "monthly"]
const topLevelParentValue = "__top_level_subject__"

function getSubmitErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to create entity."
}

function addOptionalNumberMetadata(
  metadata: Record<string, unknown>,
  key: string,
  rawValue: string,
  options: { minimum?: number; maximum?: number; integer?: boolean } = {},
) {
  if (!rawValue.trim()) {
    return
  }

  const value = Number(rawValue)
  const minimum = options.minimum ?? Number.NEGATIVE_INFINITY
  const maximum = options.maximum ?? Number.POSITIVE_INFINITY
  if (!Number.isFinite(value) || value < minimum || value > maximum || (options.integer && !Number.isInteger(value))) {
    return
  }

  metadata[key] = value
}

export function CaptureEntityForm({
  onCreated,
  availableEntities,
  initialTitle = "",
  initialContent = "",
  initialType,
  initialContentType,
  initialParentId = "",
  initialAcademicKind = "assignment",
}: CaptureEntityFormProps) {
  const [title, setTitle] = useState(initialTitle)
  const [type, setType] = useState<EntityType | "">(initialType ?? "")
  const [parentId, setParentId] = useState(initialParentId)
  const [content, setContent] = useState(initialContent)
  const [tags, setTags] = useState("")
  const [contentType, setContentType] = useState<ContentType | "">(initialContentType ?? "")
  const [difficulty, setDifficulty] = useState<DsaDifficulty | "">("")
  const [solutionCode, setSolutionCode] = useState("")
  const [subjectStatus, setSubjectStatus] = useState("active")
  const [subjectPriority, setSubjectPriority] = useState("medium")
  const [progressPercent, setProgressPercent] = useState("0")
  const [targetConfidence, setTargetConfidence] = useState("0.8")
  const [studySessionsPlanned, setStudySessionsPlanned] = useState("0")
  const [syllabusUnits, setSyllabusUnits] = useState("")
  const [examWeightage, setExamWeightage] = useState("")
  const [courseCode, setCourseCode] = useState("")
  const [term, setTerm] = useState("")
  const [instructor, setInstructor] = useState("")
  const [location, setLocation] = useState("")
  const [subjectColor, setSubjectColor] = useState("#6366f1")
  const [credits, setCredits] = useState("")
  const [status, setStatus] = useState<TaskStatus | "">("")
  const [examDate, setExamDate] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [aiAssistLevel, setAiAssistLevel] = useState<AiAssistLevel>("handwritten")
  const [academicKind, setAcademicKind] = useState<AcademicKind>(initialAcademicKind)
  const [dueAt, setDueAt] = useState("")
  const [estimatedMinutes, setEstimatedMinutes] = useState("")
  const [recurrence, setRecurrence] = useState<AcademicRecurrence>("none")
  const [pointsEarned, setPointsEarned] = useState("")
  const [pointsPossible, setPointsPossible] = useState("")
  const [weightPercent, setWeightPercent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const parentOptions = useMemo(() => {
    if (type === "milestone") {
      return availableEntities.filter((entity) => entity.type === "project")
    }
    if (type === "task") {
      return availableEntities.filter((entity) => entity.type === "milestone" || entity.type === "subject_topic")
    }
    if (type === "subject_topic") {
      return availableEntities.filter((entity) => entity.type === "subject_topic" && !entity.parent_id)
    }
    return []
  }, [availableEntities, type])

  const selectedParent = useMemo(
    () => availableEntities.find((entity) => entity.id === parentId) ?? null,
    [availableEntities, parentId],
  )
  const isAcademicTask = type === "task" && selectedParent?.type === "subject_topic"

  const parentFieldLabel = useMemo(() => {
    if (type === "milestone") {
      return "Parent Project"
    }
    if (type === "subject_topic") {
      return "Parent Subject (optional)"
    }
    if (type === "task" && selectedParent?.type === "subject_topic") {
      return selectedParent.parent_id ? "Parent Topic" : "Parent Subject"
    }
    if (type === "task" && selectedParent?.type === "milestone") {
      return "Parent Milestone"
    }
    return "Parent milestone, subject, or topic"
  }, [selectedParent, type])

  const requiresParent = type === "milestone" || type === "task"
  const supportsParent = requiresParent || type === "subject_topic"

  function resetSubjectFields() {
    setSubjectStatus("active")
    setSubjectPriority("medium")
    setProgressPercent("0")
    setTargetConfidence("0.8")
    setStudySessionsPlanned("0")
    setSyllabusUnits("")
    setExamWeightage("")
    setCourseCode("")
    setTerm("")
    setInstructor("")
    setLocation("")
    setSubjectColor("#6366f1")
    setCredits("")
    setExamDate("")
  }

  function resetAcademicFields() {
    setAcademicKind("assignment")
    setDueAt("")
    setEstimatedMinutes("")
    setRecurrence("none")
    setPointsEarned("")
    setPointsPossible("")
    setWeightPercent("")
  }

  function resetConditionalFields(nextType: EntityType | "") {
    if (nextType !== "dsa_problem") {
      setDifficulty("")
      setSolutionCode("")
    }
    if (nextType !== "subject_topic") {
      resetSubjectFields()
    }
    if (nextType !== "project" && nextType !== "milestone" && nextType !== "task") {
      setStatus("")
    }
    setParentId("")
    if (nextType !== "project") {
      setRepoUrl("")
    }
    if (nextType !== "task") {
      setAiAssistLevel("handwritten")
      resetAcademicFields()
    }
  }

  function applyEntityType(nextType: EntityType) {
    setType(nextType)
    resetConditionalFields(nextType)
    const suggestedContentType = getDefaultContentTypeForEntityType(nextType)
    if (!contentType || suggestedContentType) {
      const nextContentType = suggestedContentType ?? contentType
      if (nextContentType) {
        setContent((current) => convertEntityContent(current, contentType, nextContentType))
        setContentType(nextContentType)
      }
    }
  }

  function applyShortcut(shortcut: CreateShortcut) {
    setType(shortcut.type)
    resetConditionalFields(shortcut.type)
    setContent((current) => convertEntityContent(current, contentType, shortcut.contentType))
    setContentType(shortcut.contentType)
    setSubmitError(null)
    setFieldErrors({})
  }

  function validateForm() {
    const nextErrors: FieldErrors = {}

    if (!title.trim()) {
      nextErrors.title = "Title is required."
    }
    if (!type) {
      nextErrors.type = "Type is required."
    }
    if (!contentType) {
      nextErrors.contentType = "Content type is required."
    }
    if (requiresParent && !parentId) {
      nextErrors.parentId = type === "milestone"
        ? "Select a parent project."
        : "Select a parent milestone, subject, or topic."
    } else if (parentId && !parentOptions.some((entity) => entity.id === parentId)) {
      nextErrors.parentId = type === "subject_topic"
        ? "Select a top-level subject."
        : "Select a valid parent for this entity type."
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    if (!validateForm()) {
      return
    }

    const metadata: Record<string, unknown> = {}

    if (type === "dsa_problem") {
      if (difficulty) {
        metadata.difficulty = difficulty
      }
      if (solutionCode.trim()) {
        metadata.solution_code = solutionCode.trim()
      }
    }

    if (type === "project" || type === "milestone" || type === "task") {
      metadata.status = status || "todo"
    }

    if (type === "task") {
      metadata.ai_assist_level = aiAssistLevel
    }

    if (type === "project" && repoUrl.trim()) {
      metadata.repo_url = repoUrl.trim()
    }

    if (type === "subject_topic") {
      metadata.status = subjectStatus
      metadata.priority = subjectPriority
      metadata.progress_percent = Number(progressPercent)
      metadata.target_confidence = Number(targetConfidence)
      metadata.study_sessions_planned = Number(studySessionsPlanned)
      metadata.syllabus_units = syllabusUnits
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)

      if (examDate) {
        metadata.exam_date = examDate
      }
      if (parentId && examWeightage.trim()) {
        addOptionalNumberMetadata(metadata, "exam_weightage", examWeightage, { minimum: 0, maximum: 100 })
      }
      if (!parentId) {
        if (courseCode.trim()) metadata.course_code = courseCode.trim()
        if (term.trim()) metadata.term = term.trim()
        if (instructor.trim()) metadata.instructor = instructor.trim()
        if (location.trim()) metadata.location = location.trim()
        metadata.color = subjectColor
        addOptionalNumberMetadata(metadata, "credits", credits, { minimum: 0 })
      }
    }

    if (isAcademicTask) {
      metadata.academic_kind = academicKind
      metadata.recurrence = recurrence
      if (dueAt) {
        metadata.due_at = dueAt
      }
      addOptionalNumberMetadata(metadata, "estimated_minutes", estimatedMinutes, { minimum: 0, integer: true })
      addOptionalNumberMetadata(metadata, "points_earned", pointsEarned, { minimum: 0 })
      addOptionalNumberMetadata(metadata, "points_possible", pointsPossible, { minimum: 0 })
      addOptionalNumberMetadata(metadata, "weight_percent", weightPercent, { minimum: 0, maximum: 100 })
    }

    setIsSubmitting(true)

    try {
      const entity = await createEntity({
        title: title.trim(),
        type: type as EntityType,
        parent_id: parentId || null,
        content,
        content_type: contentType as ContentType,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        metadata,
      })

      setTitle("")
      setType("")
      setParentId("")
      setContent("")
      setTags("")
      setContentType("")
      setDifficulty("")
      setSolutionCode("")
      setStatus("")
      resetSubjectFields()
      setRepoUrl("")
      setAiAssistLevel("handwritten")
      resetAcademicFields()
      setFieldErrors({})
      onCreated(entity)
    } catch (error) {
      setSubmitError(getSubmitErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture Entity</CardTitle>
        <CardDescription>
          Notes and canvases stay in the shared entities table. `content_type` decides whether the editor is markdown, blocks, canvas JSON, or code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div className="space-y-3">
            <Label>Create shortcut</Label>
            <div className="flex flex-wrap gap-2">
              {createShortcuts.map((shortcut) => (
                <Button key={shortcut.label} type="button" variant="outline" size="sm" onClick={() => applyShortcut(shortcut)}>
                  {shortcut.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                if (fieldErrors.title) {
                  setFieldErrors((currentErrors) => ({ ...currentErrors, title: undefined }))
                }
              }}
              placeholder="Write the thing you want to keep."
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title ? <p className="text-sm text-red-300">{fieldErrors.title}</p> : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  const nextType = value as EntityType
                  applyEntityType(nextType)
                  if (fieldErrors.type) {
                    setFieldErrors((currentErrors) => ({ ...currentErrors, type: undefined }))
                  }
                }}
              >
                <SelectTrigger aria-invalid={Boolean(fieldErrors.type)}>
                  <SelectValue placeholder="Select entity type" />
                </SelectTrigger>
                <SelectContent>
                  {entityTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.type ? <p className="text-sm text-red-300">{fieldErrors.type}</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Content Type</Label>
              <Select
                value={contentType}
                onValueChange={(value) => {
                  const nextContentType = value as ContentType
                  setContent((current) => convertEntityContent(current, contentType, nextContentType))
                  setContentType(nextContentType)
                  if (fieldErrors.contentType) {
                    setFieldErrors((currentErrors) => ({ ...currentErrors, contentType: undefined }))
                  }
                }}
              >
                <SelectTrigger aria-invalid={Boolean(fieldErrors.contentType)}>
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">markdown</SelectItem>
                  <SelectItem value="blocks">blocks</SelectItem>
                  <SelectItem value="canvas_json">canvas_json</SelectItem>
                  <SelectItem value="code">code</SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.contentType ? <p className="text-sm text-red-300">{fieldErrors.contentType}</p> : null}
            </div>
          </div>

          {supportsParent ? (
            <div className="space-y-2">
              <Label>{parentFieldLabel}</Label>
              <Select
                value={type === "subject_topic" && !parentId ? topLevelParentValue : parentId}
                onValueChange={(value) => {
                  const nextParentId = value === topLevelParentValue ? "" : value
                  const nextParent = availableEntities.find((entity) => entity.id === nextParentId)
                  setParentId(nextParentId)
                  if (type === "task" && nextParent?.type !== "subject_topic") {
                    resetAcademicFields()
                  }
                  if (fieldErrors.parentId) {
                    setFieldErrors((currentErrors) => ({ ...currentErrors, parentId: undefined }))
                  }
                }}
              >
                <SelectTrigger aria-invalid={Boolean(fieldErrors.parentId)}>
                  <SelectValue placeholder={type === "milestone" ? "Select parent project" : "Select milestone, subject, or topic"} />
                </SelectTrigger>
                <SelectContent>
                  {type === "subject_topic" ? (
                    <SelectItem value={topLevelParentValue}>No parent (top-level subject)</SelectItem>
                  ) : null}
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {type === "task"
                        ? `${option.type === "milestone" ? "Milestone" : option.parent_id ? "Topic" : "Subject"} · ${option.title ?? option.id}`
                        : option.title ?? option.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.parentId ? <p className="text-sm text-red-300">{fieldErrors.parentId}</p> : null}
            </div>
          ) : null}

          {type === "project" ? (
            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repo or owner/repo"
              />
              <p className="text-sm text-zinc-500">Used for GitHub webhook matching against `metadata.repo_url`.</p>
            </div>
          ) : null}

          {type === "dsa_problem" ? (
            <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(value) => setDifficulty(value as DsaDifficulty)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    {difficultyOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="solution-code">Solution Code</Label>
                <EntityEditor contentType="code" value={solutionCode} onChange={setSolutionCode} resetKey="capture-solution-code" />
              </div>
            </div>
          ) : null}

          {type === "project" || type === "milestone" || type === "task" ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status || "todo"} onValueChange={(value) => setStatus(value as TaskStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatusOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {type === "task" ? (
                <div className="space-y-2">
                  <Label>AI Assist Level</Label>
                  <Select value={aiAssistLevel} onValueChange={(value) => setAiAssistLevel(value as AiAssistLevel)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select AI assist level" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiAssistLevelOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-zinc-500">Non-handwritten tasks will ask for a comprehension check when marked done.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAcademicTask ? (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <div>
                <p className="text-sm font-medium text-zinc-200">Academic details</p>
                <p className="text-xs text-zinc-500">Tracked against {selectedParent?.title ?? "the selected subject"}.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Kind</Label>
                  <Select value={academicKind} onValueChange={(value) => setAcademicKind(value as AcademicKind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {academicKindOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="academic-due-at">Due</Label>
                  <Input id="academic-due-at" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimated-minutes">Estimated minutes</Label>
                  <Input id="estimated-minutes" type="number" min="0" step="15" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Recurrence</Label>
                  <Select value={recurrence} onValueChange={(value) => setRecurrence(value as AcademicRecurrence)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {academicRecurrenceOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="points-earned">Points earned</Label>
                  <Input id="points-earned" type="number" min="0" step="0.5" value={pointsEarned} onChange={(event) => setPointsEarned(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="points-possible">Points possible</Label>
                  <Input id="points-possible" type="number" min="0" step="0.5" value={pointsPossible} onChange={(event) => setPointsPossible(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight-percent">Weight percent</Label>
                  <Input id="weight-percent" type="number" min="0" max="100" step="0.5" value={weightPercent} onChange={(event) => setWeightPercent(event.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          {type === "subject_topic" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {!parentId ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="course-code">Course code</Label>
                    <Input id="course-code" value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="CS 301" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject-term">Term</Label>
                    <Input id="subject-term" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Fall 2026" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject-credits">Credits</Label>
                    <Input id="subject-credits" type="number" min="0" step="0.5" value={credits} onChange={(event) => setCredits(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject-instructor">Instructor</Label>
                    <Input id="subject-instructor" value={instructor} onChange={(event) => setInstructor(event.target.value)} placeholder="Instructor name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject-location">Location</Label>
                    <Input id="subject-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room or meeting URL" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject-color">Color</Label>
                    <Input id="subject-color" type="color" value={subjectColor} onChange={(event) => setSubjectColor(event.target.value)} className="cursor-pointer p-1" />
                  </div>
                </>
              ) : null}
              <div className="space-y-2"><Label htmlFor="exam-date">Exam Date</Label><Input id="exam-date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></div>
              <div className="space-y-2"><Label>Status</Label><Select value={subjectStatus} onValueChange={setSubjectStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">active</SelectItem><SelectItem value="paused">paused</SelectItem><SelectItem value="completed">completed</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Priority</Label><Select value={subjectPriority} onValueChange={setSubjectPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">low</SelectItem><SelectItem value="medium">medium</SelectItem><SelectItem value="high">high</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="subject-progress">Progress percent</Label><Input id="subject-progress" type="number" min="0" max="100" value={progressPercent} onChange={(event) => setProgressPercent(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="target-confidence">Target confidence</Label><Input id="target-confidence" type="number" min="0" max="1" step="0.05" value={targetConfidence} onChange={(event) => setTargetConfidence(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="planned-sessions">Planned sessions</Label><Input id="planned-sessions" type="number" min="0" value={studySessionsPlanned} onChange={(event) => setStudySessionsPlanned(event.target.value)} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="syllabus-units">Syllabus units</Label><Input id="syllabus-units" value={syllabusUnits} onChange={(event) => setSyllabusUnits(event.target.value)} placeholder="Unit 1, Unit 2" /></div>
              {parentId ? <div className="space-y-2"><Label htmlFor="exam-weightage">Exam weightage</Label><Input id="exam-weightage" type="number" min="0" max="100" value={examWeightage} onChange={(event) => setExamWeightage(event.target.value)} /></div> : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <EntityEditor contentType={contentType || "markdown"} value={content} onChange={setContent} resetKey={`capture-${type || "unknown"}-${contentType || "markdown"}`} />
            <p className="text-sm text-zinc-500">BlockNote stores serialized block JSON. Excalidraw stores serialized scene JSON. Markdown and code continue as strings.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="fastapi, postgres, linked-list" />
            <p className="text-sm text-zinc-500">Comma-separated tags stay shared across every tracker view.</p>
          </div>

          {submitError ? <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">{submitError}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">Required fields: title, type, and content type.</p>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Create Entity"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
