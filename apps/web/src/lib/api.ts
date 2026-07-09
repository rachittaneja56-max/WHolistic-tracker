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
export const taskStatusOptions = ["todo", "in_progress", "done"] as const
export const difficultyOptions = ["easy", "medium", "hard"] as const
export const relationTypeOptions = ["structural_analogy", "prerequisite", "used_in", "reminds_me_of"] as const

export type EntityType = (typeof entityTypeOptions)[number]
export type ContentType = (typeof contentTypeOptions)[number]
export type TaskStatus = (typeof taskStatusOptions)[number]
export type DsaDifficulty = (typeof difficultyOptions)[number]
export type RelationType = (typeof relationTypeOptions)[number]
export type LinkStatus = "agent_suggested" | "confirmed" | "rejected"
export type EntityMetadata = Record<string, unknown>

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
  metadata: EntityMetadata
  has_embedding: boolean
}

export type SimilarEntity = {
  entity: Entity
  distance: number
  similarity: number
}

export type LinkCandidate = {
  id: string
  title: string | null
  type: EntityType | null
  tags: string[]
  preview: string
  distance: number
  similarity: number
}

export type EntityConnection = {
  link_id: string
  relation_type: RelationType | null
  explanation: string | null
  status: LinkStatus | null
  created_at: string | null
  direction: "incoming" | "outgoing"
  entity_id: string
  entity_title: string | null
  entity_type: EntityType | null
  entity_tags: string[]
  entity_preview: string
}

export type SessionRecord = {
  id: string
  entity_id: string | null
  action: string | null
  date: string | null
  meta: EntityMetadata
}

export type Link = {
  id: string
  from_id: string | null
  to_id: string | null
  relation_type: RelationType | null
  explanation: string | null
  status: LinkStatus | null
  created_at: string | null
}

export type DashboardToday = {
  recent_entities: Entity[]
  recent_sessions: SessionRecord[]
  open_tasks: Entity[]
  upcoming_subject_topics: Entity[]
}

export type RefreshAllEmbeddingsResult = {
  total_entities: number
  refreshed_count: number
  failed_count: number
  failed_entity_ids: string[]
}

export type EntitiesQuery = {
  type?: EntityType
  parent_id?: string
  tag?: string
  status?: string
  limit?: number
}

export type CreateEntityPayload = {
  title: string
  type: EntityType
  parent_id?: string | null
  content: string
  content_type: ContentType
  tags: string[]
  metadata?: EntityMetadata
}

export type UpdateEntityPayload = {
  title?: string
  type?: EntityType
  parent_id?: string | null
  content?: string | null
  content_type?: ContentType
  tags?: string[]
  confidence_score?: number
  metadata?: EntityMetadata
}

export type CreateLinkPayload = {
  from_id: string
  to_id: string
  relation_type: RelationType
  explanation: string
  status?: LinkStatus
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")

async function getErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { detail?: unknown }
    if (typeof payload.detail === "string") {
      return payload.detail
    }
    return `Request failed with status ${response.status}`
  }

  const detail = await response.text()
  return detail || `Request failed with status ${response.status}`
}

function buildQueryString(params?: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams()

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value))
    }
  })

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ""
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function getEntities(query?: EntitiesQuery) {
  return request<Entity[]>(`/entities${buildQueryString(query)}`)
}

export function getEntity(entityId: string) {
  return request<Entity>(`/entities/${entityId}`)
}

export function getEntityChildren(entityId: string, query?: Omit<EntitiesQuery, "parent_id">) {
  return request<Entity[]>(`/entities/${entityId}/children${buildQueryString(query)}`)
}

export function getSimilarEntities(entityId: string, limit = 5) {
  return request<SimilarEntity[]>(`/entities/${entityId}/similar${buildQueryString({ limit })}`)
}

export function getLinkCandidates(entityId: string, limit = 8) {
  return request<LinkCandidate[]>(`/entities/${entityId}/link-candidates${buildQueryString({ limit })}`)
}

export function getEntityConnections(entityId: string, status: LinkStatus | "" = "confirmed") {
  return request<EntityConnection[]>(`/entities/${entityId}/connections${buildQueryString({ status })}`)
}

export function createEntity(payload: CreateEntityPayload) {
  return request<Entity>("/entities", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function updateEntity(entityId: string, payload: UpdateEntityPayload) {
  return request<Entity>(`/entities/${entityId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export function refreshEntityEmbedding(entityId: string) {
  return request<Entity>(`/entities/${entityId}/embedding/refresh`, {
    method: "POST",
  })
}

export function refreshAllEntityEmbeddings() {
  return request<RefreshAllEmbeddingsResult>("/entities/embedding/refresh-all", {
    method: "POST",
  })
}

export function createLink(payload: CreateLinkPayload) {
  return request<Link>("/links", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function getDashboardToday() {
  return request<DashboardToday>("/dashboard/today")
}
