export const entityTypeOptions = [
  "dsa_problem",
  "concept",
  "subject_topic",
  "til",
  "project",
  "milestone",
  "task",
  "note",
  "canvas",
  "idea",
] as const

export const contentTypeOptions = ["markdown", "blocks", "canvas_json", "code"] as const

export type EntityType = (typeof entityTypeOptions)[number]
export type ContentType = (typeof contentTypeOptions)[number]

export type Entity = {
  id: string
  type: EntityType | null
  parent_id: string | null
  title: string | null
  content: string | null
  content_type: ContentType | null
  tags: string[]
  confidence_score: number
  last_revisited_at: string | null
  created_at: string | null
  metadata: Record<string, unknown>
}

export type CreateEntityPayload = {
  title: string
  type: EntityType
  content: string
  content_type: ContentType
  tags: string[]
  metadata?: Record<string, unknown>
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function getEntities() {
  return request<Entity[]>("/entities")
}

export function getEntity(entityId: string) {
  return request<Entity>(`/entities/${entityId}`)
}

export function createEntity(payload: CreateEntityPayload) {
  return request<Entity>("/entities", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}
