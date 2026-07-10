import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { askGraph, getAgentStatus, type AgentStatus, type GraphChatResult } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to answer from the graph."
}

export function GraphChatPage() {
  const [question, setQuestion] = useState("")
  const [result, setResult] = useState<GraphChatResult | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadStatus() {
      try {
        const status = await getAgentStatus()
        if (isMounted) {
          setAgentStatus(status)
        }
      } catch {
        if (isMounted) {
          setAgentStatus(null)
        }
      } finally {
        if (isMounted) {
          setIsLoadingStatus(false)
        }
      }
    }

    void loadStatus()

    return () => {
      isMounted = false
    }
  }, [])

  const captureHref = useMemo(() => {
    const searchParams = new URLSearchParams({
      title: question.trim() || "New note from graph question",
      type: "note",
      content_type: "markdown",
      content: `Question to explore:\n${question.trim() || ""}\n\nWhat I know so far:\n`,
    })
    return `/capture?${searchParams.toString()}`
  }, [question])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) {
      setError("Write a question first.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await askGraph(question.trim())
      setResult(response)
    } catch (requestError) {
      setResult(null)
      setError(getErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isChatDisabled = agentStatus?.provider_ready === false

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ask Graph</CardTitle>
          <CardDescription>
            This answer path uses only retrieved entities from your own graph plus one-hop confirmed links and optional hierarchy context. It does not use the web.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="graph-question">Question</Label>
              <Textarea
                id="graph-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="How does indexing work again?"
                className="min-h-[140px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSubmitting || isChatDisabled}>
                {isSubmitting ? "Searching graph..." : "Ask graph"}
              </Button>
              {!isLoadingStatus ? (
                <Badge variant={agentStatus?.provider_ready ? "blue" : "warning"}>{agentStatus?.provider_ready ? "AI ready" : "AI unavailable"}</Badge>
              ) : null}
            </div>
          </form>

          {isChatDisabled ? (
            <div className="rounded-lg border border-amber-500/30 bg-zinc-950 px-4 py-3 text-sm text-amber-300">
              {agentStatus?.disabled_reason ?? "Graph chat is unavailable until AI is configured."}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>Answer</CardTitle>
              {result.missing ? <Badge variant="warning">insufficient context</Badge> : <Badge variant="blue">grounded answer</Badge>}
            </div>
            <CardDescription>Claims should be traceable to the cited entities below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">{result.answer}</p>
            </div>

            {result.citations.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-zinc-100">Citations</p>
                <div className="grid gap-3 xl:grid-cols-2">
                  {result.citations.map((citation) => (
                    <Link key={citation.entity_id} to={`/entities/${citation.entity_id}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4 transition-colors hover:border-blue-500/40">
                      <p className="text-sm font-medium text-zinc-100">{citation.title}</p>
                      <p className="mt-2 text-sm text-zinc-300">{citation.reason_used}</p>
                      <p className="mt-3 font-mono text-xs text-zinc-500">entity {citation.entity_id}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {result.missing ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
                <p className="text-sm text-zinc-300">You have not written enough about this yet.</p>
                <Button asChild className="mt-4">
                  <Link to={captureHref}>Create a note from this question</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
