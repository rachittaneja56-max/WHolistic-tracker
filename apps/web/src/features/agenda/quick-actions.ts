import type { AgendaItem } from "@/lib/api"

export type SupportedAgendaTaskAction = "complete" | "snooze" | "reschedule" | "mark_blocked"

export function taskActionMetadata(action: SupportedAgendaTaskAction, now = new Date(), rescheduleDate?: string): Record<string, unknown> {
  if (action === "complete") return { status: "done", completed_at: now.toISOString() }
  if (action === "mark_blocked") return { status: "blocked" }

  const dueAt = action === "reschedule" ? rescheduleDate : new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
  if (!dueAt || !/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || Number.isNaN(new Date(`${dueAt}T00:00:00Z`).getTime())) {
    throw new Error("Choose a valid reschedule date in YYYY-MM-DD format.")
  }
  return { due_at: dueAt, status: "ready" }
}

export function canMutateAgendaItem(item: AgendaItem) {
  return item.source_type === "entity" && item.source_entity_id !== null
}
