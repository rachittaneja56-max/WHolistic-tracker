import { useEffect, useState } from "react"
import { CheckCircle2, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
 import { formatEntityDate, getEntityAiAssistLevel } from "@/features/entities/metadata"
import {
  applyComprehensionCheck,
  comprehensionGradeOptions,
  getAgentStatus,
  getComprehensionChecks,
  previewComprehensionCheck,
  type AgentStatus,
  type AnswerComprehensionCheckPreview,
  type AnswerComprehensionCheckResult,
  type ComprehensionCheck,
  type ComprehensionGrade,
} from "@/lib/api"

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Comprehension checks are temporarily unavailable."
}

function gradeVariant(grade: string | null): "default" | "success" | "warning" {
  return grade === "passed" ? "success" : grade === "flagged" ? "warning" : "default"
}

export function ComprehensionChecksPage() {
   const [checks, setChecks] = useState<ComprehensionCheck[]>([])
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [selected, setSelected] = useState<ComprehensionCheck | null>(null)
  const [answer, setAnswer] = useState("")
  const [selfGrade, setSelfGrade] = useState<ComprehensionGrade | "">("")
  const [preview, setPreview] = useState<AnswerComprehensionCheckPreview | null>(null)
  const [confirmedGrade, setConfirmedGrade] = useState<ComprehensionGrade | "">("")
  const [lastResult, setLastResult] = useState<AnswerComprehensionCheckResult | null>(null)
  const [lastTitle, setLastTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fallbackMode = agentStatus?.provider_ready !== true

  async function load() {
    setLoading(true)
    setError(null)
    const [checksResult, statusResult] = await Promise.allSettled([getComprehensionChecks("pending"), getAgentStatus()])
    if (checksResult.status === "fulfilled") setChecks(checksResult.value)
    else {
      setChecks([])
      setError(messageFrom(checksResult.reason))
    }
    setAgentStatus(statusResult.status === "fulfilled" ? statusResult.value : null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  function choose(check: ComprehensionCheck | null) {
    setSelected(check)
    setAnswer(check?.your_answer ?? "")
    setSelfGrade("")
    setPreview(null)
    setConfirmedGrade("")
    setError(null)
  }

  async function requestPreview() {
    if (!selected || !answer.trim()) {
      setError("Write your answer before requesting a grade preview.")
      return
    }
    if (fallbackMode && !selfGrade) {
      setError("Choose a provisional passed or flagged grade for the offline preview.")
      return
    }
    setWorking(true)
    setError(null)
    try {
      const next = await previewComprehensionCheck(selected.id, {
        your_answer: answer.trim(),
        self_grade: selfGrade || undefined,
      })
      setPreview(next)
      setConfirmedGrade(next.suggested_grade)
    } catch (previewError) {
      setError(messageFrom(previewError))
    } finally {
      setWorking(false)
    }
  }

  async function applyConfirmed() {
    if (!selected || !preview || !confirmedGrade) return
    setWorking(true)
    setError(null)
    try {
      const result = await applyComprehensionCheck(selected.id, {
        your_answer: answer.trim(),
        confirmed_grade: confirmedGrade,
      })
      setLastResult(result)
      setLastTitle(selected.entity?.title ?? "Latest comprehension check")
      setSelected(null)
      setPreview(null)
      setAnswer("")
      setSelfGrade("")
      setConfirmedGrade("")
      await load()
    } catch (applyError) {
      setError(messageFrom(applyError))
    } finally {
      setWorking(false)
    }
  }

  if (loading) {
    return <Card aria-live="polite"><CardHeader><CardTitle>Comprehension</CardTitle><CardDescription>Loading pending checks...</CardDescription></CardHeader></Card>
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <div className="flex items-center justify-between gap-3"><CardTitle>Comprehension queue</CardTitle><Badge variant={checks.length ? "warning" : "success"}>{checks.length} pending</Badge></div>
          <CardDescription>Explain decisions and tradeoffs after AI-assisted work.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((check) => {
            const assist = check.entity ? getEntityAiAssistLevel(check.entity) : check.ai_assist_level
            return (
              <button key={check.id} type="button" onClick={() => choose(check)} className={`w-full rounded-lg border p-4 text-left transition hover:border-primary/40 ${selected?.id === check.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
                <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-foreground">{check.entity?.title ?? "Untitled task"}</p><Badge>{assist ?? "unknown assist"}</Badge></div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-secondary">{check.question ?? "No question was stored."}</p>
              </button>
            )
          })}
          {!checks.length ? <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No comprehension debt is waiting. Checks appear after AI-assisted project work.</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.entity?.title ?? "Answer check" : lastResult ? "Latest confirmed result" : "Select a check"}</CardTitle>
          <CardDescription>{selected ? "Answer first, inspect the advisory grade, then confirm or override it." : lastResult ? "Only your confirmed grade changed the durable confidence score." : "Choose a pending check from the queue."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {selected && !preview ? (
            <>
              <div className="rounded-xl border border-border bg-background p-5">
                <div className="flex flex-wrap gap-2"><Badge variant="warning">Pending</Badge><Badge>{selected.ai_assist_level ?? "unknown assist"}</Badge></div>
                <p className="mt-4 text-base font-medium leading-7 text-foreground">{selected.question}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="comprehension-answer">Your explanation</Label>
                <Textarea id="comprehension-answer" className="min-h-[240px]" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={12000} placeholder="Explain why this approach was used, what tradeoff mattered, and what you would change..." />
                <p className="text-right text-xs text-muted-foreground">{answer.length.toLocaleString()} / 12,000</p>
              </div>
              {fallbackMode ? (
                <div className="max-w-sm space-y-2">
                  <Label>Provisional self-check</Label>
                  <Select value={selfGrade} onValueChange={(value) => setSelfGrade(value as ComprehensionGrade)}><SelectTrigger><SelectValue placeholder="Passed or flagged" /></SelectTrigger><SelectContent>{comprehensionGradeOptions.map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}</SelectContent></Select>
                  <p className="text-xs text-muted-foreground">AI is unavailable. This provisional choice powers a preview but is not applied automatically.</p>
                </div>
              ) : null}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-secondary"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Previewing never marks the check answered and never changes confidence.</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void requestPreview()} disabled={working || !answer.trim()}>{working ? "Preparing preview..." : "Preview grade"}</Button>
                <Button variant="outline" onClick={() => choose(null)}>Back to queue</Button>
                {selected.entity ? <Button asChild variant="ghost"><Link to={`/knowledge/entities/${selected.entity.id}`}>Open task</Link></Button> : null}
              </div>
            </>
          ) : null}

          {selected && preview ? (
            <>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex flex-wrap gap-2"><Badge variant="blue">Advisory preview</Badge><Badge variant={gradeVariant(preview.suggested_grade)}>{preview.suggested_grade} suggested</Badge>{preview.used_fallback ? <Badge>Offline fallback</Badge> : null}</div>
                <p className="mt-4 text-sm leading-6 text-secondary">{preview.feedback}</p>
                <div className="mt-4 rounded-lg bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up</p><p className="mt-2 text-sm text-secondary">{preview.follow_up}</p></div>
              </div>
              <div className="max-w-sm space-y-2">
                <Label>Grade to apply</Label>
                <Select value={confirmedGrade} onValueChange={(value) => setConfirmedGrade(value as ComprehensionGrade)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{comprehensionGradeOptions.map((item) => <SelectItem key={item} value={item} className="capitalize">{item}{item === preview.suggested_grade ? " - suggested" : ""}</SelectItem>)}</SelectContent></Select>
                <p className="text-xs text-muted-foreground">Accept the suggestion or override it. Only this confirmed grade is durable.</p>
              </div>
              <div className="flex flex-wrap gap-2"><Button onClick={() => void applyConfirmed()} disabled={working || !confirmedGrade}>{working ? "Applying..." : "Apply confirmed grade"}</Button><Button variant="outline" onClick={() => { setPreview(null); setConfirmedGrade("") }}>Edit answer</Button></div>
            </>
          ) : null}

          {!selected && lastResult ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-success/30 bg-success/5 p-5">
                <div className="flex flex-wrap items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /><Badge variant={gradeVariant(lastResult.ai_grade)}>{lastResult.ai_grade}</Badge><span className="text-xs text-muted-foreground">{formatEntityDate(lastResult.answered_at)}</span></div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">{lastTitle}</h2>
                <p className="mt-3 text-sm leading-6 text-secondary">{lastResult.feedback}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Follow-up</p><p className="mt-2 text-sm text-secondary">{lastResult.follow_up}</p></div>
                <div className="rounded-lg border border-border p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Updated confidence</p><p className="mt-2 text-xl font-semibold text-foreground">{lastResult.updated_confidence_score.toFixed(2)}</p></div>
              </div>
              {checks[0] ? <Button onClick={() => choose(checks[0])}>Answer next check</Button> : null}
            </div>
          ) : null}

          {!selected && !lastResult ? <p className="text-sm text-muted-foreground">Choose a pending comprehension check to continue.</p> : null}
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
