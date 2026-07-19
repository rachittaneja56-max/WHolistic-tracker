import { useMemo, useState } from "react"
import { CalendarPlus, Check, Pencil, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { confirmDailyPlan, proposeDailyPlan, type AgendaItem, type DailyPlanProposal, type StudyBlockInput } from "@/lib/api"

type Props = { items: AgendaItem[]; onConfirmed: () => Promise<void>; defaultAvailableMinutes?: number; suggestedFocusMinutes?: number }
const minuteOptions = [15, 25, 45, 60]

function localDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function DailyPlanningCard({ items, onConfirmed, defaultAvailableMinutes = 120, suggestedFocusMinutes = 45 }: Props) {
  const [available, setAvailable] = useState(String(defaultAvailableMinutes))
  const [proposal, setProposal] = useState<DailyPlanProposal | null>(null)
  const [blocks, setBlocks] = useState<StudyBlockInput[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const itemById = useMemo(() => new Map(items.filter((item) => item.source_entity_id).map((item) => [item.source_entity_id!, item])), [items])
  const capacity = Number(available)
  const planned = blocks.reduce((total, block) => total + block.planned_minutes, 0)

  async function propose() {
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1440) { setMessage("Enter available minutes from 0 to 1,440."); return }
    setBusy(true); setMessage(null)
    try { const next = await proposeDailyPlan(capacity); setProposal(next); setBlocks(next.blocks) } catch (error) { setMessage(error instanceof Error ? error.message : "Could not prepare a plan.") } finally { setBusy(false) }
  }
  function update(index: number, patch: Partial<StudyBlockInput>) { setBlocks((current) => current.map((block, currentIndex) => currentIndex === index ? { ...block, ...patch } : block)) }
  async function confirm() {
    if (!proposal || planned > capacity) { setMessage("Keep the edited plan within your available time before confirming."); return }
    setBusy(true); setMessage(null)
    try { await confirmDailyPlan(capacity, blocks); await onConfirmed(); setProposal(null); setBlocks([]); setMessage("Today?s plan is confirmed. Nothing was auto-scheduled.") } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the plan.") } finally { setBusy(false) }
  }

  return <Card>
    <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Plan today</CardTitle><CardDescription>Choose your available time, review a realistic proposal, then edit and confirm it yourself. Suggested focus block: {suggestedFocusMinutes} minutes.</CardDescription></div><div className="flex items-center gap-2"><label htmlFor="available-minutes" className="text-xs text-muted-foreground">Available</label><Input id="available-minutes" className="h-9 w-24" type="number" min="0" max="1440" value={available} onChange={(event) => setAvailable(event.target.value)} /><span className="text-xs text-muted-foreground">min</span></div></div></CardHeader>
    <CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{minuteOptions.map((minutes) => <Button key={minutes} type="button" size="sm" variant={available === String(minutes) ? "default" : "outline"} onClick={() => setAvailable(String(minutes))}>{minutes} min</Button>)}<Button type="button" size="sm" variant="outline" onClick={() => void propose()} disabled={busy}><CalendarPlus className="mr-1.5 h-3.5 w-3.5" />Propose plan</Button></div>
    {proposal ? <><div className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-secondary"><span className="font-semibold text-foreground">{planned} / {capacity} min</span> selected. Existing scheduled workload: {proposal.already_scheduled_minutes} min. {proposal.is_over_capacity ? "Your existing plan is already over capacity." : "Edit before confirming; this proposal will not apply itself."}</div><div className="space-y-2">{blocks.map((block, index) => <div key={`${block.entity_id}-${index}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_11rem_auto]"><p className="min-w-0 self-center truncate text-sm font-medium text-foreground">{itemById.get(block.entity_id)?.title ?? "Planned work"}</p><Input aria-label={`Minutes for block ${index + 1}`} type="number" min="1" max="720" value={block.planned_minutes} onChange={(event) => update(index, { planned_minutes: Number(event.target.value) || 1 })} /><Input aria-label={`Time for block ${index + 1}`} type="datetime-local" value={localDateTime(block.start_at)} onChange={(event) => update(index, { start_at: new Date(event.target.value).toISOString() })} /><Button type="button" size="sm" variant="ghost" aria-label={`Remove block ${index + 1}`} onClick={() => setBlocks((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setBlocks((current) => [...current, ...proposal.blocks.slice(0, 1)])}><Plus className="mr-1.5 h-3.5 w-3.5" />Add proposal block</Button><Button type="button" size="sm" onClick={() => void confirm()} disabled={busy || planned > capacity}><Check className="mr-1.5 h-3.5 w-3.5" />Confirm edited plan</Button><Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Discard</Button></div></> : null}
    {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}</CardContent>
  </Card>
}