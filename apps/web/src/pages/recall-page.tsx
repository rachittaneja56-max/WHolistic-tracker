import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Eye, ShieldCheck } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
 import {
  applyRecall,
  getAgentStatus,
  getRecallDue,
  previewRecall,
  type AgentStatus,
  type RecallDueItem,
  type RecallGradePreview,
  type RecallGradeResult,
} from "@/lib/api"

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Recall is temporarily unavailable."
}

function draftKey(entityId: string) {
  return `personal-dev-kg:recall-draft:${entityId}`
}

function confidenceVariant(score: number): "success" | "warning" | "danger" {
  return score >= 0.75 ? "success" : score >= 0.45 ? "warning" : "danger"
}

export function RecallPage() {
   const [searchParams] = useSearchParams()
  const tag = searchParams.get("tag") ?? ""
  const requestedEntity = searchParams.get("entity")
  const [dueItems, setDueItems] = useState<RecallDueItem[]>([])
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [selected, setSelected] = useState<RecallDueItem | null>(null)
  const [answer, setAnswer] = useState("")
  const [selfScore, setSelfScore] = useState("")
  const [preview, setPreview] = useState<RecallGradePreview | null>(null)
  const [confirmedScore, setConfirmedScore] = useState("")
  const [result, setResult] = useState<RecallGradeResult | null>(null)
  const [query, setQuery] = useState("")
  const [showOriginal, setShowOriginal] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fallbackMode = agentStatus?.provider_ready !== true

  async function load() {
    setLoading(true)
    setError(null)
    const [dueResult, statusResult] = await Promise.allSettled([getRecallDue(100, tag || undefined), getAgentStatus()])
    if (dueResult.status === "fulfilled") setDueItems(dueResult.value)
    else {
      setDueItems([])
      setError(messageFrom(dueResult.reason))
    }
    setAgentStatus(statusResult.status === "fulfilled" ? statusResult.value : null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [tag])

  useEffect(() => {
    if (!requestedEntity || selected || !dueItems.length) return
    const requested = dueItems.find((item) => item.entity.id === requestedEntity)
    if (requested) startReview(requested)
  }, [dueItems, requestedEntity, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || preview || result) return
    if (answer.trim()) window.localStorage.setItem(draftKey(selected.entity.id), answer)
    else window.localStorage.removeItem(draftKey(selected.entity.id))
  }, [answer, preview, result, selected])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return dueItems.filter((item) => {
      if (!normalized) return true
      return [item.entity.title, item.entity.type, ...item.entity.tags].filter(Boolean).join(" ").toLowerCase().includes(normalized)
    })
  }, [dueItems, query])

  function startReview(item: RecallDueItem | null) {
    setSelected(item)
    setAnswer(item ? window.localStorage.getItem(draftKey(item.entity.id)) ?? "" : "")
    setSelfScore("")
    setPreview(null)
    setConfirmedScore("")
    setResult(null)
    setShowOriginal(false)
    setError(null)
  }

  async function requestPreview() {
    if (!selected || !answer.trim()) {
      setError("Explain the idea from memory before requesting a grade preview.")
      return
    }
    if (fallbackMode && !selfScore) {
      setError("Choose your provisional self-score so the offline preview has a basis.")
      return
    }
    setWorking(true)
    setError(null)
    try {
      const next = await previewRecall(selected.entity.id, {
        answer: answer.trim(),
        self_score: selfScore ? Number(selfScore) : undefined,
      })
      setPreview(next)
      setConfirmedScore(String(next.suggested_score))
    } catch (previewError) {
      setError(messageFrom(previewError))
    } finally {
      setWorking(false)
    }
  }

  async function applyConfirmedGrade() {
    if (!selected || !preview || !confirmedScore) return
    setWorking(true)
    setError(null)
    try {
      const applied = await applyRecall(selected.entity.id, {
        answer: answer.trim(),
        confirmed_score: Number(confirmedScore),
      })
      window.localStorage.removeItem(draftKey(selected.entity.id))
      setResult(applied)
      setCompleted((count) => count + 1)
      await load()
    } catch (applyError) {
      setError(messageFrom(applyError))
    } finally {
      setWorking(false)
    }
  }

  const nextItem = filtered.find((item) => item.entity.id !== selected?.entity.id) ?? null

  if (loading) {
    return <Card aria-live="polite"><CardHeader><CardTitle>Recall</CardTitle><CardDescription>Preparing your review queue...</CardDescription></CardHeader></Card>
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <div className="flex items-center justify-between gap-3"><CardTitle>Recall queue</CardTitle><Badge variant={dueItems.length ? "warning" : "success"}>{dueItems.length} due</Badge></div>
          <CardDescription>Pick one concept. Its source stays hidden until you confirm the review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {completed ? <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{completed} confirmed this session</div> : null}
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search due reviews" aria-label="Search due reviews" />
          <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
            {filtered.map((item) => (
              <button
                key={item.entity.id}
                type="button"
                onClick={() => startReview(item)}
                className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/40 ${selected?.entity.id === item.entity.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{item.entity.title ?? "Untitled item"}</p>
                  <Badge variant={confidenceVariant(item.entity.confidence_score)}>{item.entity.confidence_score.toFixed(2)}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.due_reasons[0] ?? "Ready for review"}</p>
              </button>
            ))}
            {!filtered.length ? <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{dueItems.length ? "No reviews match this search." : "Nothing is due right now."}</div> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.entity.title ?? "Review item" : "Start a recall review"}</CardTitle>
          <CardDescription>{selected ? "Answer from memory, review the advisory grade, then explicitly confirm or override it." : "Choose a due item from the queue."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!selected ? (filtered[0] ? <Button onClick={() => startReview(filtered[0])}>Start highest-priority review</Button> : <Button asChild variant="outline"><Link to="/library">Open your library</Link></Button>) : null}

          {selected && !preview && !result ? (
            <>
              <div className="flex flex-wrap gap-2"><Badge>{selected.entity.type?.replace(/_/g, " ") ?? "item"}</Badge>{selected.entity.tags.slice(0, 4).map((item) => <Badge key={item}>{item}</Badge>)}</div>
              <div className="space-y-2">
                <Label htmlFor="recall-answer">Explain this from memory</Label>
                <Textarea id="recall-answer" className="min-h-[260px]" value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={12000} placeholder="Write the explanation, steps, tradeoffs, or examples you remember..." />
                <p className="text-right text-xs text-muted-foreground">{answer.length.toLocaleString()} / 12,000</p>
              </div>
              {fallbackMode ? (
                <div className="max-w-xs space-y-2">
                  <Label>Provisional self-score</Label>
                  <Select value={selfScore} onValueChange={setSelfScore}><SelectTrigger><SelectValue placeholder="Choose 1 to 5" /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map((score) => <SelectItem key={score} value={String(score)}>{score} / 5</SelectItem>)}</SelectContent></Select>
                  <p className="text-xs text-muted-foreground">AI is unavailable, so this preview uses your provisional score. You still confirm it next.</p>
                </div>
              ) : null}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-secondary"><ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />Previewing never changes confidence, review state, or source content.</div>
              <Button onClick={() => void requestPreview()} disabled={working || !answer.trim()}>{working ? "Preparing preview..." : "Preview grade"}</Button>
            </>
          ) : null}

          {selected && preview && !result ? (
            <>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="blue">Advisory preview</Badge>{preview.used_fallback ? <Badge>Deterministic fallback</Badge> : <Badge>AI suggestion</Badge>}</div>
                <p className="mt-4 text-sm leading-6 text-secondary">{preview.feedback}</p>
                {preview.missed_points.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Possible gaps</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-secondary">{preview.missed_points.map((point) => <li key={point}>{point}</li>)}</ul></div> : null}
              </div>
              <div className="space-y-2">
                <Label>Score to apply</Label>
                <Select value={confirmedScore} onValueChange={setConfirmedScore}><SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map((score) => <SelectItem key={score} value={String(score)}>{score} / 5{score === preview.suggested_score ? " - suggested" : ""}</SelectItem>)}</SelectContent></Select>
                <p className="text-xs text-muted-foreground">Accept the suggestion or choose your own score. Only this confirmed value changes durable learning state.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void applyConfirmedGrade()} disabled={working || !confirmedScore}>{working ? "Applying..." : "Apply confirmed score"}</Button>
                <Button variant="outline" onClick={() => { setPreview(null); setConfirmedScore("") }}>Edit answer</Button>
              </div>
            </>
          ) : null}

          {selected && result ? (
            <>
              <div className="rounded-xl border border-success/30 bg-success/5 p-5">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /><p className="font-semibold text-foreground">Review confirmed</p><Badge variant="success">{result.recalled_score} / 5</Badge></div>
                <p className="mt-3 text-sm leading-6 text-secondary">{result.feedback}</p>
                <p className="mt-3 text-xs text-muted-foreground">Confidence is now {result.updated_confidence_score.toFixed(2)}. Next action: {result.next_action.replace(/_/g, " ")}.</p>
              </div>
              <Button variant="outline" onClick={() => setShowOriginal((value) => !value)}><Eye className="mr-2 h-4 w-4" />{showOriginal ? "Hide" : "Show"} original content</Button>
              {showOriginal ? <div className="whitespace-pre-wrap rounded-lg border border-border bg-background p-4 text-sm leading-7 text-secondary">{selected.entity.content || "No source content was captured."}</div> : null}
              <div className="flex flex-wrap gap-2">
                {nextItem ? <Button onClick={() => startReview(nextItem)}>Review next<ArrowRight className="ml-2 h-4 w-4" /></Button> : null}
                <Button asChild variant="outline"><Link to={`/knowledge/entities/${selected.entity.id}`}>Open full item</Link></Button>
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
