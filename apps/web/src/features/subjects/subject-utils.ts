import type { Entity } from "@/lib/api"

const subjectPalette = ["#3b82f6", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16", "#f97316"]

export function metadataString(entity: Entity, ...keys: string[]) {
  for (const key of keys) {
    const value = entity.metadata[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

export function metadataNumber(entity: Entity, ...keys: string[]) {
  for (const key of keys) {
    const value = entity.metadata[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

export function clampPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function confidencePercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0
  return clampPercent(value * 100)
}

export function parseTrackerDate(value: string | null | undefined) {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function daysUntil(value: string | null | undefined) {
  const parsed = parseTrackerDate(value)
  if (!parsed) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  parsed.setHours(0, 0, 0, 0)
  return Math.round((parsed.getTime() - today.getTime()) / 86_400_000)
}

export function formatCompactDate(value: string | null | undefined, includeTime = false) {
  const parsed = parseTrackerDate(value)
  if (!parsed) return "Not set"
  const hasTime = includeTime && !/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
  return new Intl.DateTimeFormat(undefined, hasTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(parsed)
}

export function relativeDeadline(value: string | null | undefined) {
  const days = daysUntil(value)
  if (days === null) return "No deadline"
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days <= 14) return `In ${days} days`
  return formatCompactDate(value)
}

export function formatMinutes(value: number | null | undefined) {
  const minutes = Math.max(0, Math.round(value ?? 0))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function subjectColor(entity: Entity) {
  const configured = metadataString(entity, "color", "colour", "subject_color")
  if (configured && /^#[0-9a-f]{3,8}$/i.test(configured)) return configured
  let hash = 0
  for (const character of entity.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return subjectPalette[hash % subjectPalette.length]
}

export function subjectStatus(entity: Entity) {
  return metadataString(entity, "status") ?? "active"
}

export function subjectExamDate(entity: Entity) {
  return metadataString(entity, "exam_date")
}

export function subjectCourseLabel(entity: Entity) {
  return metadataString(entity, "course_code", "code", "term", "semester")
}

export function entityDueDate(entity: Entity) {
  return metadataString(entity, "due_at", "due_date", "deadline", "exam_date")
}

export function taskKind(entity: Entity) {
  return metadataString(entity, "academic_kind", "kind", "task_type") ?? "task"
}

export function taskStatus(entity: Entity) {
  return metadataString(entity, "status") ?? "todo"
}

export function taskIsDone(entity: Entity) {
  return ["done", "completed", "submitted", "cancelled"].includes(taskStatus(entity).toLowerCase())
}

export function taskIsOverdue(entity: Entity) {
  const days = daysUntil(entityDueDate(entity))
  return !taskIsDone(entity) && days !== null && days < 0
}

export function topicProgress(entity: Entity) {
  const explicit = metadataNumber(entity, "progress_percent")
  if (explicit !== null) return clampPercent(explicit)
  return ["done", "completed", "mastered"].includes(subjectStatus(entity).toLowerCase()) ? 100 : 0
}

export function activityLabel(action: string | null) {
  if (!action) return "Activity logged"
  const labels: Record<string, string> = {
    created: "Created",
    revisited: "Revisited",
    linked: "Linked a resource",
    study_planned: "Study block planned",
    study_completed: "Study session completed",
  }
  return labels[action] ?? action.split("_").join(" ")
}
