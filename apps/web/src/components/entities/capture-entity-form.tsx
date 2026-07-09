import { useState, type FormEvent } from "react"

import { contentTypeOptions, createEntity, entityTypeOptions, type Entity } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type CaptureEntityFormProps = {
  onCreated: (entity: Entity) => void
}

export function CaptureEntityForm({ onCreated }: CaptureEntityFormProps) {
  const [title, setTitle] = useState("")
  const [type, setType] = useState<(typeof entityTypeOptions)[number]>("note")
  const [content, setContent] = useState("")
  const [tags, setTags] = useState("")
  const [contentType, setContentType] = useState<(typeof contentTypeOptions)[number]>("markdown")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const entity = await createEntity({
        title,
        type,
        content,
        content_type: contentType,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      setTitle("")
      setContent("")
      setTags("")
      setType("note")
      setContentType("markdown")
      onCreated(entity)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create entity.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture Entity</CardTitle>
        <CardDescription>Everything in Phase 0 lands in the shared entities table, regardless of what lens it belongs to later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write the thing you want to keep." required />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as (typeof entityTypeOptions)[number])}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label>Content Type</Label>
              <Select value={contentType} onValueChange={(value) => setContentType(value as (typeof contentTypeOptions)[number])}>
                <SelectTrigger>
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea id="content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Capture the note, sketch, summary, or project context here." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="fastapi, postgres, linked-list" />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Create Entity"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
