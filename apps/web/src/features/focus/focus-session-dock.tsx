import { useEffect, useState } from "react"
import { Pause, Play, Square, TimerReset } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getActiveFocusSession, retainFocusReflection, saveFocusReflection, transitionFocusSession, type FocusSession } from "@/lib/api"

export function FocusSessionDock() {
  const [session, setSession] = useState<FocusSession | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  useEffect(() => { void getActiveFocusSession().then(setSession).catch(() => undefined); const listener = (event: Event) => setSession((event as CustomEvent<FocusSession>).detail); window.addEventListener("pdkg:focus-session", listener); return () => window.removeEventListener("pdkg:focus-session", listener) }, [])
  useEffect(() => { if (!session || session.status !== "running") return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [session])
  if (!session) return null
  const elapsed = session.status === "running" ? Math.max(session.actual_minutes, Math.ceil((now - new Date(session.started_at).getTime()) / 60_000) + session.actual_minutes) : session.actual_minutes
  const remaining = Math.max(0, session.planned_minutes - elapsed)
  async function act(action: "pause" | "resume" | "complete" | "cancel") { if (!session) return; setBusy(true); try { let next = await transitionFocusSession(session.id, action); if (action === "complete") { const accomplished = window.prompt("What was accomplished?") ?? ""; const remaining = window.prompt("What remains?") ?? ""; const learned = window.prompt("What was learned?") ?? ""; next = await saveFocusReflection(next.id, { accomplished, remaining, learned }); if (window.confirm("Create a note from this reflection?")) next = await retainFocusReflection(next.id, "note", `Focus: ${next.entity_title ?? "reflection"}`) } setSession(action === "complete" || action === "cancel" ? null : next); window.dispatchEvent(new CustomEvent("pdkg:focus-session", { detail: action === "complete" || action === "cancel" ? null : next })) } finally { setBusy(false) } }
  return <section aria-label="Active focus session" className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-30 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-primary/30 bg-background p-4 shadow-2xl md:bottom-5 md:right-6">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Focus {session.status}</p><p className="truncate text-sm font-semibold text-foreground">{session.entity_title ?? "Focused work"}</p></div><p className="font-mono text-lg font-semibold text-foreground">{remaining}:00</p></div>
    <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void act(session.status === "running" ? "pause" : "resume")} disabled={busy}>{session.status === "running" ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}{session.status === "running" ? "Pause" : "Resume"}</Button><Button size="sm" variant="outline" onClick={() => void act("complete")} disabled={busy}><TimerReset className="mr-1.5 h-3.5 w-3.5" />Finish</Button><Button size="sm" variant="ghost" aria-label="Cancel focus session" onClick={() => void act("cancel")} disabled={busy}><Square className="h-3.5 w-3.5" /></Button></div>
  </section>
}