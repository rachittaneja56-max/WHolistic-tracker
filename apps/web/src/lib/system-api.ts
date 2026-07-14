import type { Entity, RecallDueItem, SessionRecord } from "@/lib/api"
import { authenticatedFetch } from "@/lib/auth-client"

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "")

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

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

export type AdminOverview = { total: number; banned: number; new_7d: number; active_24h: number; active_7d: number; active_30d: number; entities: number; assistant_messages: number; pending_invitations: number; ai_requests: number; integration_syncs: number; errors: number }
export type AdminUser = { id: string; name: string; email: string; role: string; banned: boolean; email_verified: boolean; created_at: string; last_active_at: string | null; session_count: number; entity_count: number; ai_requests: number }
export type AdminInvitation = { id: string; email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }
export type AdminUserDetail = AdminUser & { sessions: { id: string; created_at: string; updated_at: string; expires_at: string; ip_address: string | null; user_agent: string | null }[]; quota: { max_entities: number; max_assistant_messages: number; max_ai_requests_per_day: number }; usage: { entities: number; assistant_messages: number; ai_requests: number } }
export type AdminAudit = { id: string; action: string; target_user_id: string | null; actor_email: string; ip_address: string | null; details: Record<string, unknown>; created_at: string }
export const getAdminOverview = () => request<AdminOverview>("/admin/overview")
export const getAdminUsers = (search = "") => request<{ items: AdminUser[]; total: number }>(`/admin/users?search=${encodeURIComponent(search)}`)
export const getAdminInvitations = () => request<AdminInvitation[]>("/admin/invitations")
export const getAdminUser = (id: string) => request<AdminUserDetail>(`/admin/users/${id}`)
export const getAdminHealth = () => request<Record<string, string>>("/admin/health")
export const getAdminAudit = () => request<AdminAudit[]>("/admin/audit-log")
export const createAdminInvitation = (email: string, role: "user" | "admin") => request<{ invite_url: string }>("/admin/invitations", { method: "POST", body: JSON.stringify({ email, role }) })
export const revokeAdminInvitation = (id: string) => request<void>(`/admin/invitations/${id}`, { method: "DELETE" })
export const banAdminUser = (id: string, reason: string) => request<AdminUser>(`/admin/users/${id}/ban`, { method: "POST", body: JSON.stringify({ reason }) })
export const unbanAdminUser = (id: string) => request<AdminUser>(`/admin/users/${id}/ban`, { method: "DELETE" })
export const revokeAdminUserSessions = (id: string) => request<void>(`/admin/users/${id}/sessions/revoke`, { method: "POST" })
export const createAdminPasswordReset = (id: string) => request<{ reset_url: string }>(`/admin/users/${id}/password-reset-link`, { method: "POST" })
export const updateAdminUserRole = (id: string, role: "user" | "admin") => request<AdminUser>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) })
export const updateAdminUserQuota = (id: string, payload: Partial<AdminUserDetail["quota"]>) => request<AdminUserDetail["quota"]>(`/admin/users/${id}/quota`, { method: "PATCH", body: JSON.stringify(payload) })
export const deleteAdminUser = (id: string, email: string) => request<void>(`/admin/users/${id}`, { method: "DELETE", body: JSON.stringify({ confirmation_email: email }) })
export async function downloadAdminUsers() {
  const response = await authenticatedFetch(`${apiBaseUrl}/admin/users/export.csv`)
  if (!response.ok) throw new Error("Unable to export account metrics")
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "account-operations.csv"; anchor.click(); URL.revokeObjectURL(url)
}

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
