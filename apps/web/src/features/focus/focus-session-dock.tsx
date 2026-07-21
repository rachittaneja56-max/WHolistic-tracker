import { useEffect, useState } from "react"
import { Pause, Play, Square, TimerReset } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getActiveFocusSession, retainFocusReflection, saveFocusReflection, transitionFocusSession, type FocusSession } from "@/lib/api"

type FocusAction = "pause" | "resume" | "complete" | "cancel"
type PendingReflection = { sessionId: string; accomplished: string; remaining: string; learned: string }

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function isFocusSession(value: FocusSession | null | undefined): value is FocusSession {
  return Boolean(value && typeof value.id === "string" && typeof value.status === "string" && typeof value.planned_minutes === "number" && typeof value.actual_minutes === "number" && typeof value.started_at === "string")
}

export function FocusSessionDock() {
  const [session, setSession] = useState<FocusSession | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAction, setFailedAction] = useState<FocusAction | null>(null)
  const [pendingReflection, setPendingReflection] = useState<PendingReflection | null>(null)

  useEffect(() => {
    void getActiveFocusSession().then((value) => setSession(isFocusSession(value) ? value : null)).catch((fetchError) => setError(messageFor(fetchError, "Your focus session could not be loaded. Refresh to try again.")))
    const listener = (event: Event) => { const value = (event as CustomEvent<FocusSession | null>).detail; setSession(isFocusSession(value) ? value : null) }
    window.addEventListener("pdkg:focus-session", listener)
    return () => window.removeEventListener("pdkg:focus-session", listener)
  }, [])

  useEffect(() => {
    if (!session || session.status !== "running") return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [session])

  function publish(next: FocusSession | null) {
    setSession(next)
    window.dispatchEvent(new CustomEvent("pdkg:focus-session", { detail: next }))
  }

  async function retryReflection() {
    if (!pendingReflection) return
    setBusy(true)
    setError(null)
    try {
      await saveFocusReflection(pendingReflection.sessionId, pendingReflection)
      setPendingReflection(null)
    } catch (saveError) {
      setError(messageFor(saveError, "The focus reflection still could not be saved. Your answers remain available to retry."))
    } finally {
      setBusy(false)
    }
  }

  async function act(action: FocusAction) {
    if (!session) return
    setBusy(true)
    setError(null)
    setFailedAction(null)
    try {
      let next = await transitionFocusSession(session.id, action)
      if (action === "complete") {
        const reflection = {
          accomplished: window.prompt("What was accomplished?") ?? "",
          remaining: window.prompt("What remains?") ?? "",
          learned: window.prompt("What was learned?") ?? "",
        }
        try {
          next = await saveFocusReflection(next.id, reflection)
        } catch (reflectionError) {
          publish(null)
          setPendingReflection({ sessionId: next.id, ...reflection })
          setError(messageFor(reflectionError, "Your focus session was completed, but the reflection was not saved. Retry when you are back online."))
          return
        }
        if (window.confirm("Create a note from this reflection?")) {
          try {
            await retainFocusReflection(next.id, "note", `Focus: ${next.entity_title ?? "reflection"}`)
          } catch (retainError) {
            publish(null)
            setError(messageFor(retainError, "Your focus session and reflection were saved, but the optional note could not be created."))
            return
          }
        }
      }
      publish(action === "complete" || action === "cancel" ? null : next)
    } catch (actionError) {
      setError(messageFor(actionError, "That focus action did not finish. Nothing was discarded; retry when you are back online."))
      setFailedAction(action)
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    if (!error && !pendingReflection) return null
    return <aside role="alert" className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-30 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-warning/40 bg-background p-4 shadow-2xl md:bottom-5 md:right-6">
      <p className="text-sm font-semibold text-foreground">Focus session needs attention</p>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      <div className="mt-3 flex gap-2">
        {pendingReflection ? <Button size="sm" onClick={() => void retryReflection()} disabled={busy}>Retry saving reflection</Button> : null}
        <Button size="sm" variant="ghost" onClick={() => { setError(null); setPendingReflection(null) }} disabled={busy}>Dismiss</Button>
      </div>
    </aside>
  }

  const elapsed = session.status === "running" ? Math.max(session.actual_minutes, Math.ceil((now - new Date(session.started_at).getTime()) / 60_000) + session.actual_minutes) : session.actual_minutes
  const remaining = Math.max(0, session.planned_minutes - elapsed)
  return <section aria-label="Active focus session" className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-30 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-primary/30 bg-background p-4 shadow-2xl md:bottom-5 md:right-6">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Focus {session.status}</p><p className="truncate text-sm font-semibold text-foreground">{session.entity_title ?? "Focused work"}</p></div><p className="font-mono text-lg font-semibold text-foreground">{remaining}:00</p></div>
    {error ? <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground" role="alert"><p>{error}</p>{failedAction ? <Button className="mt-2" size="sm" variant="outline" onClick={() => void act(failedAction)} disabled={busy}>Retry</Button> : null}</div> : null}
    <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void act(session.status === "running" ? "pause" : "resume")} disabled={busy}>{session.status === "running" ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}{session.status === "running" ? "Pause" : "Resume"}</Button><Button size="sm" variant="outline" onClick={() => void act("complete")} disabled={busy}><TimerReset className="mr-1.5 h-3.5 w-3.5" />Finish</Button><Button size="sm" variant="ghost" aria-label="Cancel focus session" onClick={() => void act("cancel")} disabled={busy}><Square className="h-3.5 w-3.5" /></Button></div>
  </section>
}
