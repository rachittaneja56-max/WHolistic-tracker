import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getDsaPracticeOverview, recordDsaAttempt, type DsaPracticeOverview } from "@/lib/api"

export function DsaPracticePanel({ problemId }: { problemId: string }) {
  const [data, setData] = useState<DsaPracticeOverview | null>(null)
  const [outcome, setOutcome] = useState<"solved" | "partial" | "stuck">("solved")
  const [minutes, setMinutes] = useState("30")
  const [hints, setHints] = useState("0")
  const [patterns, setPatterns] = useState("")
  const [invariant, setInvariant] = useState("")
  const [mistake, setMistake] = useState("")
  const [cue, setCue] = useState("")
  const [again, setAgain] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setData(await getDsaPracticeOverview(problemId)) } catch { setError("Unable to load attempt history.") }
  }
  useEffect(() => { void load() }, [problemId])

  async function submit() {
    setError(null)
    try {
      await recordDsaAttempt(problemId, { outcome, time_taken_minutes: Math.max(0, Number(minutes) || 0), hint_count: Math.max(0, Number(hints) || 0), patterns: patterns.split(",").map((item) => item.trim()).filter(Boolean), key_invariant: invariant || null, mistake_classification: mistake || null, recognition_cue: cue || null, solve_again_without_notes: again })
      setInvariant(""); setMistake(""); setCue(""); await load()
    } catch { setError(outcome === "solved" ? "Solved attempts need an invariant, main mistake, and recognition cue." : "Unable to save this attempt.") }
  }

  return <section className="space-y-3 rounded-lg border border-border bg-surface/30 p-3">
    <div><p className="text-sm font-medium text-foreground">Deliberate-practice attempt</p><p className="mt-1 text-xs text-muted-foreground">Capture the reasoning signal, then schedule a no-notes re-solve through recall.</p></div>
    <div className="grid grid-cols-3 gap-2"><label className="text-xs text-muted-foreground">Outcome<select className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="solved">Solved</option><option value="partial">Partial</option><option value="stuck">Stuck</option></select></label><label className="text-xs text-muted-foreground">Minutes<Input className="mt-1" type="number" min="0" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><label className="text-xs text-muted-foreground">Hints<Input className="mt-1" type="number" min="0" value={hints} onChange={(event) => setHints(event.target.value)} /></label></div>
    <label className="grid gap-1 text-xs text-muted-foreground">Patterns<Input value={patterns} onChange={(event) => setPatterns(event.target.value)} placeholder="sliding window, prefix sum" /></label>
    <label className="grid gap-1 text-xs text-muted-foreground">Key invariant{outcome === "solved" ? " *" : ""}<Textarea value={invariant} onChange={(event) => setInvariant(event.target.value)} /></label>
    <label className="grid gap-1 text-xs text-muted-foreground">Main mistake{outcome === "solved" ? " *" : ""}<Input value={mistake} onChange={(event) => setMistake(event.target.value)} /></label>
    <label className="grid gap-1 text-xs text-muted-foreground">Recognition cue{outcome === "solved" ? " *" : ""}<Input value={cue} onChange={(event) => setCue(event.target.value)} /></label>
    <label className="flex items-center gap-2 text-xs text-secondary"><input type="checkbox" checked={again} onChange={(event) => setAgain(event.target.checked)} />Solve again without notes in two days</label>
    {error ? <p className="text-xs text-danger">{error}</p> : null}
    <Button size="sm" onClick={() => void submit()}>Save attempt</Button>
    {data?.attempts.length ? <div className="border-t border-border pt-2"><p className="text-xs font-medium text-secondary">Attempt history</p>{data.attempts.slice(0, 5).map((attempt) => <p key={attempt.id} className="mt-1 text-xs text-muted-foreground">{attempt.outcome} · {attempt.time_taken_minutes}m · {attempt.hint_count} hints</p>)}</div> : null}
  </section>
}
