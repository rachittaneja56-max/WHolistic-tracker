import { useEffect, useState } from "react"
import { Link, useOutletContext } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { formatEntityDate, getEntityAiAssistLevel } from "@/features/entities/metadata"
import {
  answerComprehensionCheck,
  comprehensionGradeOptions,
  getAgentStatus,
  getComprehensionChecks,
  type AgentStatus,
  type AnswerComprehensionCheckResult,
  type ComprehensionCheck,
  type ComprehensionGrade,
} from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load comprehension debt."
}

function getGradeVariant(grade: string | null): "default" | "success" | "warning" | "danger" {
  if (grade === "passed") {
    return "success"
  }
  if (grade === "flagged") {
    return "warning"
  }
  return "default"
}

export function ComprehensionChecksPage() {
  const { refreshEntities } = useOutletContext<EntitiesLayoutContext>()
  const [checks, setChecks] = useState<ComprehensionCheck[]>([])
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [selectedCheck, setSelectedCheck] = useState<ComprehensionCheck | null>(null)
  const [answer, setAnswer] = useState("")
  const [selfGrade, setSelfGrade] = useState<ComprehensionGrade | "">("")
  const [lastResult, setLastResult] = useState<AnswerComprehensionCheckResult | null>(null)
  const [lastResultTitle, setLastResultTitle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const fallbackMode = agentStatus?.provider_ready === false

  async function loadChecks() {
    setIsLoading(true)
    setError(null)

    const [checksResult, agentResult] = await Promise.allSettled([getComprehensionChecks("pending"), getAgentStatus()])

    if (checksResult.status === "fulfilled") {
      setChecks(checksResult.value)
    } else {
      setChecks([])
      setError(getErrorMessage(checksResult.reason))
    }

    if (agentResult.status === "fulfilled") {
      setAgentStatus(agentResult.value)
    } else {
      setAgentStatus(null)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    void loadChecks()
  }, [])

  async function handleSubmit() {
    if (!selectedCheck) {
      return
    }
    if (!answer.trim()) {
      setSubmitError("Write your answer before submitting the comprehension check.")
      return
    }
    if (fallbackMode && !selfGrade) {
      setSubmitError("Choose passed or flagged while AI grading is unavailable.")
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const result = await answerComprehensionCheck(selectedCheck.id, {
        your_answer: answer.trim(),
        self_grade: fallbackMode ? (selfGrade as ComprehensionGrade) : undefined,
      })
      setLastResult(result)
      setLastResultTitle(selectedCheck.entity?.title ?? "Untitled task")
      setSelectedCheck(null)
      setAnswer("")
      setSelfGrade("")
      await Promise.all([loadChecks(), refreshEntities()])
    } catch (answerError) {
      setSubmitError(getErrorMessage(answerError))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comprehension Debt</CardTitle>
          <CardDescription>Loading pending checks...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Comprehension Debt</CardTitle>
          <CardDescription>AI-assisted tasks should prove understanding after the work ships. Flagged answers stay muted amber and add review pressure through lower confidence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-500">
            {fallbackMode
              ? "AI grading is unavailable, so you can still record a manual self-check with a conservative passed/flagged result."
              : "AI grading is available. Questions and grades stay grounded in the task context you provide."}
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {checks.length === 0 ? <p className="text-sm text-zinc-500">No pending comprehension checks right now.</p> : null}

          <div className="space-y-3">
            {checks.map((check) => {
              const aiAssistLevel = check.entity ? getEntityAiAssistLevel(check.entity) : null
              return (
                <button
                  key={check.id}
                  type="button"
                  onClick={() => {
                    setSelectedCheck(check)
                    setAnswer(check.your_answer ?? "")
                    setSelfGrade("")
                    setSubmitError(null)
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4 text-left transition-colors hover:border-amber-500/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{check.entity?.title ?? "Untitled task"}</p>
                    <Badge variant={getGradeVariant(check.ai_grade)}>{check.ai_grade ?? "pending"}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{aiAssistLevel ?? check.ai_assist_level ?? "unknown"}</Badge>
                    {check.entity?.type ? <Badge>{check.entity.type}</Badge> : null}
                  </div>
                  <p className="mt-3 text-sm text-zinc-300">{check.question ?? "No question stored."}</p>
                  <p className="mt-3 font-mono text-xs text-zinc-500">{formatEntityDate(check.created_at)}</p>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedCheck ? "Answer Check" : lastResult ? "Latest Result" : "Select a Pending Check"}</CardTitle>
          <CardDescription>
            {selectedCheck
              ? "Answer why the change was made and what tradeoff mattered. The goal is understanding, not trivia."
              : lastResult
                ? "Your latest comprehension-check result stays visible here so you can act on the feedback immediately."
                : "Pick a comprehension check from the queue to answer it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!selectedCheck && !lastResult ? <p className="text-sm text-zinc-500">Choose a pending comprehension check to continue.</p> : null}

          {selectedCheck ? (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">pending</Badge>
                  <Badge>{selectedCheck.ai_assist_level ?? "unknown"}</Badge>
                  {selectedCheck.entity ? <Badge>{selectedCheck.entity.type ?? "task"}</Badge> : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-zinc-100">{selectedCheck.entity?.title ?? "Untitled task"}</h2>
                <p className="mt-3 text-sm text-zinc-300">{selectedCheck.question}</p>
                {selectedCheck.entity ? (
                  <p className="mt-3 font-mono text-xs text-zinc-500">
                    confidence {selectedCheck.entity.confidence_score.toFixed(2)} · {formatEntityDate(selectedCheck.entity.created_at)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="comprehension-answer">Your answer</Label>
                <Textarea
                  id="comprehension-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Explain the reasoning behind the task in your own words."
                  className="min-h-[220px]"
                />
              </div>

              {fallbackMode ? (
                <div className="space-y-2">
                  <Label>Manual self-check</Label>
                  <Select value={selfGrade} onValueChange={(value) => setSelfGrade(value as ComprehensionGrade)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select passed or flagged" />
                    </SelectTrigger>
                    <SelectContent>
                      {comprehensionGradeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {submitError ? <p className="text-sm text-red-300">{submitError}</p> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : fallbackMode ? "Save self-check" : "Submit answer"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setSelectedCheck(null)}>
                  Back to queue
                </Button>
                {selectedCheck.entity ? (
                  <Button asChild type="button" variant="ghost">
                    <Link to={`/entities/${selectedCheck.entity.id}`}>Open task entity</Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}

          {!selectedCheck && lastResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={getGradeVariant(lastResult.ai_grade)}>{lastResult.ai_grade}</Badge>
                  <Badge variant={lastResult.used_fallback ? "warning" : "blue"}>{lastResult.used_fallback ? "manual fallback" : "AI graded"}</Badge>
                  <span className="font-mono text-xs text-zinc-500">{formatEntityDate(lastResult.answered_at)}</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-zinc-100">{lastResultTitle ?? "Latest check"}</h2>
                <p className="mt-3 text-sm text-zinc-300">{lastResult.feedback}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Follow-up</p>
                  <p className="mt-2 text-sm text-zinc-300">{lastResult.follow_up}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Updated confidence</p>
                  <p className="mt-2 font-mono text-sm text-zinc-100">{lastResult.updated_confidence_score.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
