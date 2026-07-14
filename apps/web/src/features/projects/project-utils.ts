import type { Entity, ProjectHealth } from "@/lib/api"

export type WorkspaceTab = "overview" | "board" | "timeline" | "activity" | "knowledge" | "settings"
export type BoardStatus = "backlog" | "ready" | "in_progress" | "blocked" | "in_review" | "done"

export const boardColumns: Array<{ value: BoardStatus; label: string; description: string }> = [
  { value: "backlog", label: "Backlog", description: "Captured, not committed" },
  { value: "ready", label: "Ready", description: "Clear next actions" },
  { value: "in_progress", label: "In progress", description: "Active work" },
  { value: "blocked", label: "Blocked", description: "Needs intervention" },
  { value: "in_review", label: "In review", description: "Verification and PRs" },
  { value: "done", label: "Done", description: "Shipped and learned" },
]

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to update the project."
}

export function metaString(entity: Entity, key: string, fallback = "") {
  const value = entity.metadata[key]
  return typeof value === "string" ? value : fallback
}

export function metaNumber(entity: Entity, key: string, fallback = 0) {
  const value = entity.metadata[key]
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function taskBoardStatus(task: Entity): BoardStatus {
  const value = metaString(task, "status", "backlog")
  if (value === "todo") return "backlog"
  if (["completed", "submitted", "cancelled"].includes(value)) return "done"
  return boardColumns.some((column) => column.value === value) ? value as BoardStatus : "backlog"
}

export function displayLabel(value: string) {
  return value.replace(/_/g, " ")
}

export function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "Not set"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(undefined, includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(parsed)
}

export function healthVariant(health: ProjectHealth): "default" | "success" | "warning" | "blue" {
  if (health === "completed") return "success"
  if (health === "on_track") return "blue"
  if (health === "at_risk" || health === "stalled") return "warning"
  return "default"
}

export function priorityVariant(priority: string): "default" | "warning" | "blue" {
  if (priority === "urgent" || priority === "high") return "warning"
  if (priority === "medium") return "blue"
  return "default"
}

export function activityLabel(action: string | null) {
  const labels: Record<string, string> = {
    created: "Created",
    revisited: "Updated",
    linked: "Knowledge linked",
    pr_opened: "PR opened",
    pr_merged: "PR merged",
    push: "Code pushed",
    work_started: "Work started",
    work_logged: "Time logged",
    deployed: "Deployed",
    milestone_completed: "Milestone completed",
    project_shipped: "Project shipped",
  }
  return labels[action ?? ""] ?? displayLabel(action ?? "Activity")
}
