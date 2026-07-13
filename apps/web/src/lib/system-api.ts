import type { Entity, RecallDueItem, SessionRecord } from "@/lib/api"

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export type AuthSession = { authenticated: boolean; owner: string | null; configured: boolean }
export type AiProviderName = "openai" | "gemini" | "mistral"
export type AiModelMode = "auto" | "fast" | "smart"
export type AiProviderStatus = { configured: boolean; fast_model: string; smart_model: string }
export type SettingsStatus = {
  ai: { enabled: boolean; provider: AiProviderName; model_mode: AiModelMode; openai_configured: boolean; providers: Record<AiProviderName, AiProviderStatus>; provider_ready: boolean; fast_model: string; smart_model: string; disabled_reason: string | null }
  github: { enabled: boolean; webhook_secret_configured: boolean; access_token_configured: boolean; ready: boolean; disabled_reason: string | null; webhook_url: string; webhook_events: string[] }
  web_search: { enabled: boolean; provider: string | null; api_key_configured: boolean }
}
export type DeletionImpact = { child_count: number; link_count: number; review_count: number; comprehension_check_count: number; session_count: number }
export type SubjectSummaryMetrics = {
  topic_count: number
  completed_topic_count: number
  open_task_count: number
  overdue_task_count: number
  due_review_count: number
  progress_percent: number
  mastery_score: number
  grade_percent: number | null
  next_deadline: string | null
  planned_minutes_7d: number
  studied_minutes_7d: number
  last_studied_at: string | null
}
export type SubjectTrackerSummary = SubjectSummaryMetrics & { subject: Entity }
export type SubjectOverview = {
  subject: Entity
  topics: Entity[]
  academic_tasks: Entity[]
  summary: SubjectSummaryMetrics
  linked_entities: Record<string, Entity[]>
  due_reviews: RecallDueItem[]
  recent_sessions: SessionRecord[]
  weak_topics: Entity[]
}

export const getAuthSession = () => request<AuthSession>("/auth/session")
export const login = (password: string) => request<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify({ password }) })
export const logout = () => request<AuthSession>("/auth/logout", { method: "POST" })
export const getSettingsStatus = () => request<SettingsStatus>("/settings/status")
export const updateAiSetting = (payload: { enabled?: boolean; provider?: AiProviderName; model_mode?: AiModelMode; models?: Partial<Record<AiProviderName, { fast_model: string; smart_model: string }>> }) => request<SettingsStatus>("/settings/ai", { method: "PATCH", body: JSON.stringify(payload) })
export const saveAiCredential = (provider: AiProviderName, apiKey: string) => request<SettingsStatus>(`/settings/ai/credentials/${provider}`, { method: "PUT", body: JSON.stringify({ api_key: apiKey }) })
export const deleteAiCredential = (provider: AiProviderName) => request<SettingsStatus>(`/settings/ai/credentials/${provider}`, { method: "DELETE" })
export const updateGithubSetting = (enabled: boolean) => request<SettingsStatus>("/settings/github", { method: "PATCH", body: JSON.stringify({ enabled }) })
export const saveGithubCredential = (credential: "access_token" | "webhook_secret", value: string) => request<SettingsStatus>(`/settings/github/credentials/${credential}`, { method: "PUT", body: JSON.stringify({ value }) })
export const deleteGithubCredential = (credential: "access_token" | "webhook_secret") => request<SettingsStatus>(`/settings/github/credentials/${credential}`, { method: "DELETE" })
export const getArchivedEntities = () => request<Entity[]>("/entities/archived")
export const getDeletionImpact = (id: string) => request<DeletionImpact>(`/entities/${id}/deletion-impact`)
export const deleteEntity = (id: string, confirmationTitle?: string) => request<{ entity: Entity; deleted_at: string }>(`/entities/${id}`, { method: "DELETE", body: JSON.stringify({ confirmation_title: confirmationTitle ?? null }) })
export const restoreEntity = (id: string) => request<Entity>(`/entities/${id}/restore`, { method: "POST" })
export const getSubjectTracker = () => request<SubjectTrackerSummary[]>("/subjects/tracker")
export const getSubjectOverview = (id: string) => request<SubjectOverview>(`/subjects/${id}/overview`)
