import { useEffect, useMemo, useState } from "react"
import { Link, useOutletContext, useSearchParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { getAgentStatus, getRecallDue, gradeRecall, type AgentStatus, type RecallDueItem, type RecallGradeResult } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load recall mode."
}

function getConfidenceVariant(score: number): "success" | "warning" | "danger" {
  if (score >= 0.75) {
    return "success"
  }
  if (score >= 0.45) {
    return "warning"
  }
  return "danger"
}

type RecallQueueFilter = "all" | "urgent" | "exam"

function getRecallDraftKey(entityId: string) {
  return `personal-dev-kg:recall-draft:${entityId}`
}

function getRecallScoreVariant(score: number): "success" | "warning" | "danger" {
  if (score >= 4) {
    return "success"
  }
  if (score >= 3) {
    return "warning"
  }
  return "danger"
}

export function RecallPage() {
  const { refreshEntities } = useOutletContext<EntitiesLayoutContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTagFilter = searchParams.get("tag") ?? ""
  const [dueItems, setDueItems] = useState<RecallDueItem[]>([])
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [selectedItem, setSelectedItem] = useState<RecallDueItem | null>(null)
  const [answer, setAnswer] = useState("")
  const [selfScore, setSelfScore] = useState("")
  const [result, setResult] = useState<RecallGradeResult | null>(null)
  const [showOriginalContent, setShowOriginalContent] = useState(false)
  const [queueQuery, setQueueQuery] = useState("")
  const [queueFilter, setQueueFilter] = useState<RecallQueueFilter>("all")
  const [completedCount, setCompletedCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const fallbackMode = agentStatus?.provider_ready !== true

  async function loadRecallState() {
    setIsLoading(true)
    setError(null)

    const [dueResult, agentResult] = await Promise.allSettled([getRecallDue(100, selectedTagFilter || undefined), getAgentStatus()])

    if (dueResult.status === "fulfilled") {
      setDueItems(dueResult.value)
    } else {
      setDueItems([])
      setError(getErrorMessage(dueResult.reason))
    }

    if (agentResult.status === "fulfilled") {
      setAgentStatus(agentResult.value)
    } else {
      setAgentStatus(null)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    void loadRecallState()
  }, [selectedTagFilter])

  const filteredDueItems = useMemo(() => {
    const normalizedQuery = queueQuery.trim().toLowerCase()
    return dueItems.filter((item) => {
      if (selectedTagFilter && !item.entity.tags.includes(selectedTagFilter)) {
        return false
      }
      if (queueFilter === "urgent" && item.due_score < 3) {
        return false
      }
      if (queueFilter === "exam" && (item.days_until_exam === null || item.days_until_exam > 7)) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }
      const searchable = [item.entity.title, item.entity.type, ...item.entity.tags].filter(Boolean).join(" ").toLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [dueItems, queueFilter, queueQuery, selectedTagFilter])

  const queueSummary = useMemo(() => {
    const dueNow = dueItems.filter((item) => item.days_until_exam !== null && item.days_until_exam <= 7).length
    return {
      total: dueItems.length,
      urgent: dueItems.filter((item) => item.due_score >= 3).length,
      examSoon: dueNow,
      visible: filteredDueItems.length,
    }
  }, [dueItems, filteredDueItems.length])

  const nextItem = useMemo(
    () => filteredDueItems.find((item) => item.entity.id !== selectedItem?.entity.id) ?? null,
    [filteredDueItems, selectedItem?.entity.id],
  )

  useEffect(() => {
    if (!selectedItem || result) {
      return
    }
    const key = getRecallDraftKey(selectedItem.entity.id)
    if (answer.trim()) {
      window.localStorage.setItem(key, answer)
    } else {
      window.localStorage.removeItem(key)
    }
  }, [answer, result, selectedItem])

  async function handleSubmitReview() {
    if (!selectedItem) {
      return
    }
    if (!answer.trim()) {
      setSubmitError("Write your answer from memory before grading.")
      return
    }
    if (fallbackMode && !selfScore) {
      setSubmitError("Select a self-score from 1 to 5 while AI grading is disabled.")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const gradeResult = await gradeRecall(selectedItem.entity.id, {
        answer: answer.trim(),
        self_score: fallbackMode ? Number(selfScore) : undefined,
      })
      window.localStorage.removeItem(getRecallDraftKey(selectedItem.entity.id))
      setResult(gradeResult)
      setCompletedCount((current) => current + 1)
      setShowOriginalContent(false)
      await Promise.all([loadRecallState(), refreshEntities()])
    } catch (gradeError) {
      setSubmitError(getErrorMessage(gradeError))
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetReviewState(nextItem: RecallDueItem | null = null) {
    setSelectedItem(nextItem)
    setAnswer(nextItem ? window.localStorage.getItem(getRecallDraftKey(nextItem.entity.id)) ?? "" : "")
    setSelfScore("")
    setResult(null)
    setShowOriginalContent(false)
    setSubmitError(null)
  }

  function clearTagFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete("tag")
    setSearchParams(next)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recall</CardTitle>
          <CardDescription>Loading due review items...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recall</CardTitle>
          <CardDescription>Unable to load recall mode.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-300">{error}</p>
          <Button type="button" variant="outline" onClick={() => void loadRecallState()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Recall Queue</CardTitle>
              {completedCount > 0 ? <Badge variant="success">{completedCount} reviewed</Badge> : null}
            </div>
            <CardDescription>Content stays hidden until after grading. Due items lean amber because this is about fading knowledge, not finished work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Due items</p>
                <p className="mt-2 font-mono text-sm text-zinc-100">{queueSummary.total}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Urgent</p>
                <p className="mt-2 font-mono text-sm text-amber-300">{queueSummary.urgent}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Exams soon</p>
                <p className="mt-2 font-mono text-sm text-amber-300">{queueSummary.examSoon}</p>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-500">
              {fallbackMode
                ? "AI grading is unavailable or its status is unknown, so this screen uses self-grading while still storing reviews and updating confidence."
                : "AI grading is available. The grader uses only the hidden entity context and your answer."}
            </div>

            {selectedTagFilter ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <p className="text-sm text-blue-200">Filtered to #{selectedTagFilter}</p>
                <Button type="button" size="sm" variant="ghost" onClick={clearTagFilter}>Clear</Button>
              </div>
            ) : null}

            <div className="grid gap-3">
              <Input value={queueQuery} onChange={(event) => setQueueQuery(event.target.value)} placeholder="Search review queue..." aria-label="Search review queue" />
              <Select value={queueFilter} onValueChange={(value) => setQueueFilter(value as RecallQueueFilter)}>
                <SelectTrigger aria-label="Filter recall queue"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All due items</SelectItem>
                  <SelectItem value="urgent">Urgent only</SelectItem>
                  <SelectItem value="exam">Exam within 7 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">Showing {queueSummary.visible} of {queueSummary.total} due items.</p>
            </div>

            {dueItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
                No review items are due right now.
              </div>
            ) : filteredDueItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
                No due items match the current queue filters.
              </div>
            ) : null}

            <div className="space-y-3">
              {filteredDueItems.map((item) => (
                <button
                  key={item.entity.id}
                  type="button"
                  onClick={() => resetReviewState(item)}
                  className={`w-full rounded-lg border bg-zinc-950 px-4 py-4 text-left transition-colors hover:border-amber-500/40 ${selectedItem?.entity.id === item.entity.id ? "border-amber-500/70 ring-1 ring-amber-500/30" : "border-zinc-800"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{item.entity.title ?? "Untitled entity"}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">due {item.due_score.toFixed(1)}</Badge>
                      <Badge variant={getConfidenceVariant(item.entity.confidence_score)}>{item.entity.confidence_score.toFixed(2)}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{item.entity.type ?? "unknown"}</Badge>
                    {item.entity.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-zinc-500">
                    {item.due_reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{selectedItem ? "Review Workspace" : "Start a Review"}</CardTitle>
          <CardDescription>
            {selectedItem
              ? "Explain the concept from memory first. The original content stays hidden until after grading."
              : "Pick a due item from the queue to begin a recall attempt."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!selectedItem ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">Choose an entity from the recall queue to begin.</p>
              {filteredDueItems[0] ? <Button type="button" onClick={() => resetReviewState(filteredDueItems[0])}>Start highest-priority review</Button> : null}
            </div>
          ) : null}

          {selectedItem ? (
            <>
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">due</Badge>
                  <Badge>{selectedItem.entity.type ?? "unknown"}</Badge>
                  {selectedItem.entity.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                <h2 className="text-xl font-semibold text-zinc-100">{selectedItem.entity.title ?? "Untitled entity"}</h2>
                <div className="flex flex-wrap gap-3 font-mono text-xs text-zinc-500">
                  <span>confidence {selectedItem.entity.confidence_score.toFixed(2)}</span>
                  {selectedItem.days_since_review !== null ? <span>{selectedItem.days_since_review} days since review</span> : null}
                  {selectedItem.days_until_exam !== null ? <span>{selectedItem.days_until_exam} days to exam</span> : null}
                </div>
              </div>

              {!result ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recall-answer">Explain this from memory</Label>
                    <Textarea
                      id="recall-answer"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Write the idea in your own words without opening the original content."
                      className="min-h-[220px]"
                      maxLength={12000}
                    />
                    <p className="text-right font-mono text-xs text-zinc-500">{answer.trim() ? answer.trim().split(/\s+/).length : 0} words · {answer.length}/12000</p>
                  </div>

                  {fallbackMode ? (
                    <div className="space-y-2">
                      <Label>Self-grade</Label>
                      <Select value={selfScore} onValueChange={setSelfScore}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select 1 to 5" />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <SelectItem key={score} value={String(score)}>
                              {score}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {submitError ? <p className="text-sm text-red-300">{submitError}</p> : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={() => void handleSubmitReview()} disabled={isSubmitting}>
                      {isSubmitting ? "Grading..." : fallbackMode ? "Save self-grade" : "Submit for grading"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => resetReviewState(null)}>
                      Back to queue
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={getRecallScoreVariant(result.recalled_score)}>score {result.recalled_score}/5</Badge>
                      <Badge variant={getConfidenceVariant(result.updated_confidence_score)}>confidence {result.updated_confidence_score.toFixed(2)}</Badge>
                      {result.used_fallback ? <Badge variant="warning">self-graded</Badge> : <Badge variant="blue">AI-graded</Badge>}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{result.feedback}</p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Next action</p>
                      <p className="mt-2 font-mono text-sm text-zinc-100">{result.next_action}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Reviewed at</p>
                      <p className="mt-2 font-mono text-sm text-zinc-100">{new Date(result.reviewed_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Missed points</p>
                    {result.missed_points.length > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                        {result.missed_points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-zinc-500">No missed points were returned.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" onClick={() => setShowOriginalContent((current) => !current)}>
                      {showOriginalContent ? "Hide original content" : "Reveal original content"}
                    </Button>
                    <Button type="button" onClick={() => resetReviewState(nextItem)}>
                      {nextItem ? "Review next item" : "Finish session"}
                    </Button>
                    <Button asChild type="button" variant="ghost">
                      <Link to={`/knowledge/entities/${selectedItem.entity.id}`}>Open entity detail</Link>
                    </Button>
                  </div>

                  {showOriginalContent ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                        {selectedItem.entity.content?.trim() || "No original content was stored for this entity."}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
