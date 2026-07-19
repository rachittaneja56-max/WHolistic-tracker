import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, CalendarClock, Check, Clock3, ExternalLink, PauseCircle, Sparkles } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorState, LoadingSkeleton } from "@/components/page-state"
import { canMutateAgendaItem, taskActionMetadata } from "@/features/agenda/quick-actions"
import { DailyPlanningCard } from "@/features/focus/daily-planning-card"
import { cancelStudyBlock, getTodayAgenda, rescheduleStudyBlock, startFocusSession, updateEntity, type AgendaFilter, type AgendaItem, type TodayAgenda } from "@/lib/api"

const filters: Array<{ id: AgendaFilter | "all"; label: string }> = [
  { id: "all", label: "All work" },
  { id: "coursework", label: "Coursework" },
  { id: "projects", label: "Projects" },
  { id: "dsa", label: "DSA" },
  { id: "revision", label: "Revision" },
]

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Today could not be loaded."
}

function destinationFor(item: AgendaItem) {
  switch (item.destination) {
    case "recall": return item.destination_id ? `/knowledge/recall?entity=${item.destination_id}` : "/knowledge/recall"
    case "comprehension": return "/knowledge/recall/comprehension"
    case "project": return item.destination_id ? `/trackers/projects/${item.destination_id}` : "/trackers/projects"
    case "subject": return item.destination_id ? `/trackers/subjects/${item.destination_id}` : "/trackers/subjects"
    default: return item.destination_id ? `/knowledge/entities/${item.destination_id}` : "/app"
  }
}

function formatTime(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed)
}

function AgendaRow({ item, busy, onAction }: { item: AgendaItem; busy: boolean; onAction: (item: AgendaItem, action: "complete" | "snooze" | "reschedule" | "mark_blocked" | "start" | "cancel") => void }) {
  const timing = formatTime(item.start_at) ?? (item.deadline ? `Due ${formatTime(item.deadline)}` : "Unscheduled")
  return <div className="rounded-xl border border-border/80 bg-surface p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Badge variant={item.urgency === "overdue" ? "danger" : item.priority === "high" || item.priority === "urgent" ? "warning" : "default"}>{item.kind}</Badge><span className="text-xs capitalize text-muted-foreground">{item.status.replace(/_/g, " ")}</span></div>
        <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
        {item.context?.title ? <p className="mt-1 text-xs text-muted-foreground">{item.context.title}</p> : null}
        <p className="mt-2 text-sm leading-5 text-secondary">{item.recommendation_reason}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{timing}</span>{item.estimated_minutes !== null ? <span>{item.estimated_minutes} min</span> : null}</div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {item.allowed_actions.includes("complete") ? <Button size="sm" variant="outline" onClick={() => onAction(item, "complete")} disabled={busy}><Check className="mr-1.5 h-3.5 w-3.5" />Complete</Button> : null}
        {item.allowed_actions.includes("snooze") ? <Button size="sm" variant="ghost" onClick={() => onAction(item, "snooze")} disabled={busy}>Snooze</Button> : null}
        {item.allowed_actions.includes("reschedule") ? <Button size="sm" variant="ghost" onClick={() => onAction(item, "reschedule")} disabled={busy}>Reschedule</Button> : null}
        {item.allowed_actions.includes("cancel") ? <Button size="sm" variant="ghost" onClick={() => onAction(item, "cancel")} disabled={busy}>Cancel</Button> : null}{item.allowed_actions.includes("mark_blocked") ? <Button size="sm" variant="ghost" onClick={() => onAction(item, "mark_blocked")} disabled={busy}><PauseCircle className="mr-1.5 h-3.5 w-3.5" />Block</Button> : null}{item.allowed_actions.includes("start") ? <Button size="sm" onClick={() => onAction(item, "start")} disabled={busy}>Focus</Button> : null}
        <Button asChild size="sm" variant="ghost"><Link to={destinationFor(item)}>Open<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
      </div>
    </div>
  </div>
}

function AgendaSection({ title, description, collection, filter, busy, onAction, empty }: { title: string; description: string; collection: TodayAgenda["today"]; filter: AgendaFilter | "all"; busy: string | null; onAction: (item: AgendaItem, action: "complete" | "snooze" | "reschedule" | "mark_blocked" | "start" | "cancel") => void; empty: string }) {
  const items = filter === "all" ? collection.items : collection.items.filter((item) => item.filters.includes(filter))
  const total = filter === "all" ? collection.total : items.length
  return <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div><Badge variant={total ? "default" : "success"}>{total}</Badge></div></CardHeader><CardContent className="space-y-3">{items.length ? items.map((item) => <AgendaRow key={item.id} item={item} busy={busy === item.id} onAction={onAction} />) : <p className="rounded-lg bg-surface-subtle p-4 text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>
}

export function TodayPage() {
  const [agenda, setAgenda] = useState<TodayAgenda | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<AgendaFilter | "all">("all")

  async function load() {
    setLoading(true); setError(null)
    try { setAgenda(await getTodayAgenda()) } catch (nextError) { setError(messageFrom(nextError)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function act(item: AgendaItem, action: "complete" | "snooze" | "reschedule" | "mark_blocked" | "start" | "cancel") {
    if (action === "start") {
      if (!item.source_entity_id) return
      const planned_minutes = Number(window.prompt("Focus duration in minutes", String(item.estimated_minutes ?? 25)))
      if (!Number.isInteger(planned_minutes) || planned_minutes < 1 || planned_minutes > 720) return
      setBusy(item.id); setMutationError(null)
      try { const session = await startFocusSession({ entity_id: item.source_entity_id, planned_minutes, source: "today" }); window.dispatchEvent(new CustomEvent("pdkg:focus-session", { detail: session })); await load() } catch (nextError) { setMutationError(messageFrom(nextError)) } finally { setBusy(null) }
      return
    }
    if (item.source_type === "session" && item.id.startsWith("study:")) {
      const sessionId = item.id.slice("study:".length)
      setBusy(item.id); setMutationError(null)
      try {
        if (action === "cancel") await cancelStudyBlock(sessionId)
        else if (action === "reschedule") { const value = window.prompt("Reschedule to (YYYY-MM-DDTHH:MM)", item.start_at?.slice(0, 16) ?? ""); if (!value) return; await rescheduleStudyBlock(sessionId, { entity_id: item.source_entity_id!, planned_minutes: item.estimated_minutes ?? 25, start_at: new Date(value).toISOString(), source: "today" }) }
        else return
        await load()
      } catch (nextError) { setMutationError(messageFrom(nextError)) } finally { setBusy(null) }
      return
    }
    if (!canMutateAgendaItem(item) || !item.source_entity_id) return
    let rescheduleDate: string | undefined
    if (action === "reschedule") {
      const value = window.prompt("Reschedule to (YYYY-MM-DD)", item.deadline?.slice(0, 10) ?? "")
      if (!value) return
      rescheduleDate = value
    }
    setBusy(item.id); setMutationError(null)
    try {
      await updateEntity(item.source_entity_id, { metadata: taskActionMetadata(action as "complete" | "snooze" | "reschedule" | "mark_blocked", new Date(), rescheduleDate) })
      await load()
    } catch (nextError) {
      setMutationError(`Could not update ${item.title}. ${messageFrom(nextError)}`)
    } finally { setBusy(null) }
  }

  const recommended = useMemo(() => agenda?.recommended ?? null, [agenda])
  const planningItems = useMemo(() => agenda ? [...agenda.overdue.items, ...agenda.today.items, ...agenda.upcoming.items, ...agenda.unscheduled.items, ...agenda.recall.items].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index) : [], [agenda])
  if (loading) return <LoadingSkeleton rows={5} />
  if (error || !agenda) return <ErrorState message={error ?? "Today is unavailable."} onRetry={() => void load()} />

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Today</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">Your complete workload, in one place.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Planning stays connected to tasks, sessions, recall, and comprehension—nothing is duplicated.</p></div><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{agenda.totals.planned_minutes} minutes planned</span><Button asChild size="sm" variant="outline"><Link to={`/agents/assistant?from=/app&available=${agenda.capacity.available_minutes ?? 0}`}>Replan with coach</Link></Button></div></header>
    {mutationError ? <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{mutationError}</div> : null}
    {agenda.capacity.is_over_capacity ? <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" />Scheduled work ({agenda.capacity.scheduled_minutes} min) exceeds your available time ({agenda.capacity.available_minutes} min).</div> : agenda.capacity.available_minutes === null ? <p className="text-xs text-muted-foreground">Availability is not configured yet; this workload contract is ready for Phase 2 capacity planning.</p> : null}
    <DailyPlanningCard items={planningItems} onConfirmed={load} defaultAvailableMinutes={agenda.capacity.available_minutes ?? 120} suggestedFocusMinutes={agenda.suggested_focus_minutes} />
    {Object.keys(agenda.balance.weekly_target_minutes).length ? <Card><CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm text-secondary"><span className="font-medium text-foreground">Weekly focus targets</span>{Object.entries(agenda.balance.weekly_target_minutes).map(([focus, minutes]) => <Badge key={focus}>{focus}: {minutes} min</Badge>)}<span className="text-xs text-muted-foreground">Current mix: {agenda.balance.coursework_items} coursework · {agenda.balance.project_items} projects · {agenda.balance.dsa_items} DSA.</span></CardContent></Card> : null}
    <div className="flex flex-wrap gap-2" aria-label="Agenda filters">{filters.map((option) => <Button key={option.id} size="sm" variant={filter === option.id ? "default" : "outline"} onClick={() => setFilter(option.id)} aria-pressed={filter === option.id}>{option.label}</Button>)}</div>
    {recommended ? <section className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-panel"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] opacity-80"><Sparkles className="h-4 w-4" />Recommended next action <span className="rounded-full bg-primary-foreground/15 px-2 py-1">{recommended.estimated_minutes ?? "—"} min</span></div><h2 className="mt-4 text-2xl font-semibold">{recommended.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 opacity-85">{recommended.recommendation_reason}</p><Button asChild className="mt-5 bg-primary-foreground text-primary hover:bg-primary-foreground/90"><Link to={destinationFor(recommended)}>{recommended.allowed_actions.includes("start") ? "Start now" : "Open work"}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section> : <Card><CardContent className="p-6 text-sm text-muted-foreground">You are caught up. Capture or plan work when you are ready.</CardContent></Card>}
    <AgendaSection title="Overdue work" description="Resolve or reschedule commitments that have passed." collection={agenda.overdue} filter={filter} busy={busy} onAction={act} empty="Nothing overdue." />
    <AgendaSection title="Today’s plan" description="Chronological work scheduled for today." collection={agenda.today} filter={filter} busy={busy} onAction={act} empty="No time-boxed work planned for today." />
    <AgendaSection title="Next seven days" description="Upcoming commitments in your selected agenda range." collection={agenda.upcoming} filter={filter} busy={busy} onAction={act} empty="No upcoming scheduled work." />
    <div className="grid gap-6 xl:grid-cols-2"><AgendaSection title="Unscheduled work" description="Open commitments that still need a place in your week." collection={agenda.unscheduled} filter={filter} busy={busy} onAction={act} empty="No unscheduled work." /><AgendaSection title="Recall queue" description="Short reviews that protect durable knowledge." collection={agenda.recall} filter={filter} busy={busy} onAction={act} empty="No recall items are due." /></div>
    <AgendaSection title="Comprehension queue" description="Confirm you understand AI-assisted work before moving on." collection={agenda.comprehension} filter={filter} busy={busy} onAction={act} empty="No comprehension checks are pending." />
  </div>
}