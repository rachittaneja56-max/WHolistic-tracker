import { useState } from "react"
import { Link, useNavigate, useOutletContext } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { approveIdea, validateIdea, type IdeaValidationResult } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to validate idea."
}

export function IdeasPage() {
  const navigate = useNavigate()
  const { addEntityToList } = useOutletContext<EntitiesLayoutContext>()
  const [idea, setIdea] = useState("")
  const [saveTitle, setSaveTitle] = useState("")
  const [saveTags, setSaveTags] = useState("")
  const [result, setResult] = useState<IdeaValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleValidate() {
    if (!idea.trim()) {
      setError("Write a rough idea first.")
      return
    }

    setIsValidating(true)
    setError(null)
    setSaveError(null)

    try {
      const validation = await validateIdea({ idea: idea.trim() })
      setResult(validation)
      setSaveTitle(validation.idea_summary)
    } catch (validationError) {
      setResult(null)
      setError(getErrorMessage(validationError))
    } finally {
      setIsValidating(false)
    }
  }

  async function handleSave() {
    if (!result) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const saved = await approveIdea({
        idea: idea.trim(),
        validation: result,
        title: saveTitle.trim() || result.idea_summary,
        tags: saveTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      addEntityToList(saved.entity)
      navigate(`/entities/${saved.entity.id}`)
    } catch (approvalError) {
      setSaveError(getErrorMessage(approvalError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Idea Validator</CardTitle>
          <CardDescription>
            Validate a rough idea against your own graph first. Similar products are optional external context, but the app never saves an idea entity until you approve it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="idea-input">Rough idea</Label>
            <Textarea
              id="idea-input"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="Describe the product idea, target user, and what you think the first version might do."
              className="min-h-[180px]"
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleValidate()} disabled={isValidating}>
              {isValidating ? "Validating..." : "Validate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                <CardDescription>Graph-based candidate review with optional web-search market context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-300">
                <p>{result.idea_summary}</p>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-500">
                  graph candidates considered: {result.graph_candidates_considered}
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                  {result.web_search_note ?? (result.web_search_configured ? "Web search configured." : "Web search not configured.")}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Similar Products</CardTitle>
                <CardDescription>Optional external context. Treat this as market signal, not product truth.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.similar_products.length > 0 ? (
                  result.similar_products.map((product) => (
                    <div key={`${product.name}-${product.url ?? "none"}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                      <p className="text-sm font-medium text-zinc-100">{product.name}</p>
                      <p className="mt-2 text-sm text-zinc-300">{product.note}</p>
                      {product.url ? (
                        <a href={product.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-xs text-blue-300 hover:text-blue-200">
                          {product.url}
                        </a>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No similar products were returned.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Existing Strengths</CardTitle>
                <CardDescription>These come from your existing graph only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.your_existing_strengths.length > 0 ? (
                  result.your_existing_strengths.map((strength) => (
                    <Link key={strength.entity_id} to={`/entities/${strength.entity_id}`} className="block rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 transition-colors hover:border-blue-500/40">
                      <p className="text-sm font-medium text-zinc-100">{strength.title ?? "Untitled entity"}</p>
                      <p className="mt-2 text-sm text-zinc-300">{strength.reason}</p>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No strong graph matches were identified.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Missing Prerequisites</CardTitle>
                <CardDescription>Topics that look under-covered relative to this idea.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.missing_prerequisites.length > 0 ? (
                  result.missing_prerequisites.map((item) => (
                    <div key={item.topic} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                      <p className="text-sm font-medium text-zinc-100">{item.topic}</p>
                      <p className="mt-2 text-sm text-zinc-300">{item.why_needed}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No missing prerequisites were returned.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Suggested MVP</CardTitle>
                <CardDescription>Small milestones only. This is a planning draft, not an auto-created project hierarchy.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.suggested_mvp.map((milestone) => (
                  <div key={milestone.milestone} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                    <p className="text-sm font-medium text-zinc-100">{milestone.milestone}</p>
                    <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                      {milestone.tasks.map((task) => (
                        <li key={task}>- {task}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Notes</CardTitle>
                <CardDescription>Use these as friction points to think through before saving the idea.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.risk_notes.map((note) => (
                  <div key={note} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                    {note}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Save as Idea</CardTitle>
              <CardDescription>Approval is the only step that creates an `idea` entity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="idea-title">Title</Label>
                  <Input id="idea-title" value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="idea-tags">Tags</Label>
                  <Input id="idea-tags" value={saveTags} onChange={(event) => setSaveTags(event.target.value)} placeholder="ideas, api, graph" />
                </div>
              </div>
              {saveError ? <p className="text-sm text-red-300">{saveError}</p> : null}
              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save as Idea"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
