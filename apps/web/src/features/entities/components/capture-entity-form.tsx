import { useState, type FormEvent } from "react"

import { contentTypeOptions, createEntity, entityTypeOptions, type ContentType, type Entity, type EntityType } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type CaptureEntityFormProps = {
  onCreated: (entity: Entity) => void
}

type FieldErrors = {
  title?: string
  type?: string
  contentType?: string
}

function getSubmitErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to create entity."
}

export function CaptureEntityForm({ onCreated }: CaptureEntityFormProps) {
  const [title, setTitle] = useState("")
  const [type, setType] = useState<EntityType | "">("")
  const [content, setContent] = useState("")
  const [tags, setTags] = useState("")
  const [contentType, setContentType] = useState<ContentType | "">("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

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

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const entity = await createEntity({
        title: title.trim(),
        type: type as EntityType,
        content,
        content_type: contentType as ContentType,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      setTitle("")
      setType("")
      setContent("")
      setTags("")
      setContentType("")
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
          Everything in Phase 0 lands in the shared entities table, regardless of what lens it belongs to later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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
                  setType(value as EntityType)
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
                  {contentTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.contentType ? <p className="text-sm text-red-300">{fieldErrors.contentType}</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Capture the note, sketch, summary, or project context here."
            />
            <p className="text-sm text-zinc-500">Use markdown for now. Rich editors and whiteboards stay out of Phase 0.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="fastapi, postgres, linked-list" />
            <p className="text-sm text-zinc-500">Comma-separated tags keep capture lightweight without adding schema complexity.</p>
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
