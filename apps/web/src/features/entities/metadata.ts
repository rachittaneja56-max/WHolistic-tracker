import { taskStatusOptions, type AiAssistLevel, type DsaDifficulty, type Entity, type TaskStatus } from "@/lib/api"

function getStringMetadata(entity: Entity, key: string) {
  const value = entity.metadata[key]
  return typeof value === "string" ? value : null
}

export function getEntityDifficulty(entity: Entity): DsaDifficulty | null {
  const value = getStringMetadata(entity, "difficulty")
  return value === "easy" || value === "medium" || value === "hard" ? value : null
}

export function getEntityStatus(entity: Entity): TaskStatus | null {
  const value = getStringMetadata(entity, "status")
  return value && taskStatusOptions.includes(value as TaskStatus) ? value as TaskStatus : null
}

export function getEntityAiAssistLevel(entity: Entity): AiAssistLevel | null {
  const value = getStringMetadata(entity, "ai_assist_level")
  return value === "handwritten" || value === "ai-scaffolded" || value === "ai-generated" || value === "ai-paired" ? value : null
}

export function getEntityExamDate(entity: Entity) {
  return getStringMetadata(entity, "exam_date")
}

export function getEntitySolutionCode(entity: Entity) {
  return getStringMetadata(entity, "solution_code")
}

export function formatEntityDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return "No timestamp"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: options?.timeStyle ?? "short",
    ...options,
  }).format(parsed)
}

export function formatExamDate(value: string | null) {
  if (!value) {
    return "No exam date"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(parsed)
}

export function compareUpcomingExamDates(left: Entity, right: Entity) {
  const leftDate = getEntityExamDate(left)
  const rightDate = getEntityExamDate(right)

  if (!leftDate && !rightDate) {
    return 0
  }
  if (!leftDate) {
    return 1
  }
  if (!rightDate) {
    return -1
  }

  return new Date(leftDate).getTime() - new Date(rightDate).getTime()
}
