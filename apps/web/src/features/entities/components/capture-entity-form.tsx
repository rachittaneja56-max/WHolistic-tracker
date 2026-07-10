import { useMemo, useState, type FormEvent } from "react"

import {
  createEntity,
  difficultyOptions,
  entityTypeOptions,
  taskStatusOptions,
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
import { getDefaultContentTypeForEntityType } from "@/features/entities/content"

type CaptureEntityFormProps = {
  onCreated: (entity: Entity) => void
  availableEntities: Entity[]
  initialTitle?: string
  initialContent?: string
  initialType?: EntityType
  initialContentType?: ContentType
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

const createShortcuts: CreateShortcut[] = [
  { label: "New Note", type: "note", contentType: "blocks" },
  { label: "New Canvas", type: "canvas", contentType: "canvas_json" },
  { label: "New DSA Problem", type: "dsa_problem", contentType: "markdown" },
  { label: "New TIL", type: "til", contentType: "markdown" },
]

function getSubmitErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to create entity."
}

export function CaptureEntityForm({
  onCreated,
  availableEntities,
  initialTitle = "",
  initialContent = "",
  initialType,
  initialContentType,
}: CaptureEntityFormProps) {
  const [title, setTitle] = useState(initialTitle)
  const [type, setType] = useState<EntityType | "">(initialType ?? "")
  const [parentId, setParentId] = useState("")
  const [content, setContent] = useState(initialContent)
  const [tags, setTags] = useState("")
  const [contentType, setContentType] = useState<ContentType | "">(initialContentType ?? "")
  const [difficulty, setDifficulty] = useState<DsaDifficulty | "">("")
  const [solutionCode, setSolutionCode] = useState("")
  const [status, setStatus] = useState<TaskStatus | "">("")
  const [examDate, setExamDate] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const parentOptions = useMemo(() => {
    if (type === "milestone") {
      return availableEntities.filter((entity) => entity.type === "project")
    }
    if (type === "task") {
      return availableEntities.filter((entity) => entity.type === "milestone")
    }
    return []
  }, [availableEntities, type])

  const requiresParent = type === "milestone" || type === "task"

  function resetConditionalFields(nextType: EntityType | "") {
    if (nextType !== "dsa_problem") {
      setDifficulty("")
      setSolutionCode("")
    }
    if (nextType !== "subject_topic") {
      setExamDate("")
    }
    if (nextType !== "project" && nextType !== "milestone" && nextType !== "task") {
      setStatus("")
    }
    if (nextType !== "milestone" && nextType !== "task") {
      setParentId("")
    }
    if (nextType !== "project") {
      setRepoUrl("")
    }
  }

  function applyEntityType(nextType: EntityType) {
    setType(nextType)
    resetConditionalFields(nextType)
    const suggestedContentType = getDefaultContentTypeForEntityType(nextType)
    if (!contentType || suggestedContentType) {
      setContentType(suggestedContentType ?? contentType)
    }
  }

  function applyShortcut(shortcut: CreateShortcut) {
    setType(shortcut.type)
    resetConditionalFields(shortcut.type)
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
      nextErrors.parentId = type === "milestone" ? "Select a parent project." : "Select a parent milestone."
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
      if (status) {
        metadata.status = status
      }
    }

    if (type === "project" && repoUrl.trim()) {
      metadata.repo_url = repoUrl.trim()
    }

    if (type === "subject_topic" && examDate) {
      metadata.exam_date = examDate
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
      setExamDate("")
      setRepoUrl("")
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
                  setContentType(value as ContentType)
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

          {requiresParent ? (
            <div className="space-y-2">
              <Label>{type === "milestone" ? "Parent Project" : "Parent Milestone"}</Label>
              <Select
                value={parentId}
                onValueChange={(value) => {
                  setParentId(value)
                  if (fieldErrors.parentId) {
                    setFieldErrors((currentErrors) => ({ ...currentErrors, parentId: undefined }))
                  }
                }}
              >
                <SelectTrigger aria-invalid={Boolean(fieldErrors.parentId)}>
                  <SelectValue placeholder={type === "milestone" ? "Select parent project" : "Select parent milestone"} />
                </SelectTrigger>
                <SelectContent>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.title ?? option.id}
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
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
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
          ) : null}

          {type === "subject_topic" ? (
            <div className="space-y-2">
              <Label htmlFor="exam-date">Exam Date</Label>
              <Input id="exam-date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} />
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
