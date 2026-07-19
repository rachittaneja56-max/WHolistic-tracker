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
export const taskStatusOptions = ["backlog", "ready", "todo", "in_progress", "blocked", "in_review", "done"] as const
export const projectStatusOptions = ["planned", "active", "paused", "completed", "archived"] as const
export const milestoneStatusOptions = ["planned", "active", "paused", "completed"] as const
export const priorityOptions = ["low", "medium", "high", "urgent"] as const
export const difficultyOptions = ["easy", "medium", "hard"] as const
export const relationTypeOptions = ["structural_analogy", "prerequisite", "used_in", "reminds_me_of", "depends_on", "blocks", "implements", "evidence_for"] as const
export const duplicateMatchTypeOptions = ["duplicate", "same_pattern", "related_but_different", "no_match"] as const
export const aiAssistLevelOptions = ["handwritten", "ai-scaffolded", "ai-generated", "ai-paired"] as const
export const comprehensionGradeOptions = ["passed", "flagged"] as const

export type EntityType = (typeof entityTypeOptions)[number]
export type ContentType = (typeof contentTypeOptions)[number]
export type TaskStatus = (typeof taskStatusOptions)[number]
export type ProjectStatus = (typeof projectStatusOptions)[number]
export type MilestoneStatus = (typeof milestoneStatusOptions)[number]
export type WorkPriority = (typeof priorityOptions)[number]
export type DsaDifficulty = (typeof difficultyOptions)[number]
export type RelationType = (typeof relationTypeOptions)[number]
export type DuplicateMatchType = (typeof duplicateMatchTypeOptions)[number]
export type AiAssistLevel = (typeof aiAssistLevelOptions)[number]
export type ComprehensionGrade = (typeof comprehensionGradeOptions)[number]
export type LinkStatus = "agent_suggested" | "confirmed" | "rejected"
export type GuidancePriority = "low" | "medium" | "high"
export type RecallNextAction = "review_again" | "mark_revisited" | "strengthen_note"
export type EntityMetadata = Record<string, unknown>
export type ThemePreference = "system" | "light" | "dark"
export type WorkspacePreferences = { theme: ThemePreference; onboarding_completed: boolean; learning_focuses: string[] }

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

export type DuplicateDetectorMatch = {
  entity_id: string
  title: string | null
  type: EntityType | null
  tags: string[]
  match_type: DuplicateMatchType
  confidence: number
  explanation: string
}

export type DuplicateDetectorResult = {
  target_entity_id: string
  matches: DuplicateDetectorMatch[]
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

export type GraphNode = {
  id: string
  title: string | null
  type: EntityType | null
  tags: string[]
  confidence_score: number
  created_at: string | null
  last_revisited_at: string | null
}

export type GraphEdge = {
  id: string
  from_id: string | null
  to_id: string | null
  relation_type: RelationType | null
  explanation: string | null
  status: LinkStatus | null
}

export type GraphPayload = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type GraphQuery = {
  type?: EntityType
  tag?: string
  min_confidence?: number
}


export type AgendaFilter = "coursework" | "projects" | "dsa" | "revision"
export type AgendaAction = "complete" | "snooze" | "reschedule" | "mark_blocked" | "open" | "start"
export type AgendaItem = {
  id: string
  kind: "task" | "assignment" | "exam" | "study" | "recall" | "comprehension" | "project"
  source_entity_id: string | null
  source_type: string
  context: { id: string | null; type: string | null; title: string | null } | null
  title: string
  description: string | null
  start_at: string | null
  deadline: string | null
  estimated_minutes: number | null
  priority: WorkPriority
  urgency: "overdue" | "today" | "upcoming" | "unscheduled"
  recommendation_reason: string
  status: string
  destination: "entity" | "project" | "subject" | "recall" | "comprehension"
  destination_id: string | null
  allowed_actions: AgendaAction[]
  filters: AgendaFilter[]
}
export type AgendaPreview = { total: number; items: AgendaItem[] }
export type TodayAgenda = {
  start_date: string
  end_date: string
  totals: { total_items: number; overdue_items: number; scheduled_items: number; unscheduled_items: number; recall_items: number; comprehension_items: number; planned_minutes: number }
  capacity: { available_minutes: number | null; scheduled_minutes: number; is_over_capacity: boolean }
  recommended: AgendaItem | null
  overdue: AgendaPreview
  today: AgendaPreview
  upcoming: AgendaPreview
  unscheduled: AgendaPreview
  recall: AgendaPreview
  comprehension: AgendaPreview
}
export type SessionRecord = {
  id: string
  entity_id: string | null
  action: string | null
  date: string | null
  meta: EntityMetadata
}

export type SessionAction = "created" | "revisited" | "linked" | "pr_opened" | "pr_merged" | "push" | "study_planned" | "study_completed" | "work_started" | "work_logged" | "deployed" | "milestone_completed" | "project_shipped"

export type CreateSessionPayload = {
  entity_id?: string | null
  action: SessionAction
  date?: string | null
  meta?: EntityMetadata
}

export type GithubFeedItem = {
  id: string
  entity_id: string | null
  action: "pr_opened" | "pr_merged" | "push" | string
  date: string | null
  repo_full_name: string | null
  repo_html_url: string | null
  title: string | null
  message: string | null
  github_url: string | null
  project_id: string | null
  project_title: string | null
  pr_number: number | null
  commit_count: number | null
  sender_login: string | null
  meta: EntityMetadata
  draft_available: boolean
  approved_til_entity_id: string | null
  approved_til_title: string | null
}

export type GithubTilDraft = {
  session_id: string
  source: string
  title: string
  content: string
  tags: string[]
  used_ai: boolean
  meta: EntityMetadata
}

export type GithubApproveTilPayload = {
  title: string
  content: string
  tags: string[]
}

export type GithubApproveTilResult = {
  entity: Entity
  link_id: string | null
  source_session_id: string
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

export type ReviewInboxLink = {
  id: string
  from_id: string
  to_id: string
  from_title: string | null
  to_title: string | null
  from_type: EntityType | null
  to_type: EntityType | null
  relation_type: RelationType | null
  explanation: string | null
  status: LinkStatus | null
  confidence: number | null
  created_at: string | null
}

export type DashboardToday = {
  totals: {
    open_tasks: number
    upcoming_exams: number
    projects_needing_attention: number
    due_recall: number
  }
  recent_entities: Entity[]
  recent_sessions: SessionRecord[]
  open_tasks: Entity[]
  upcoming_subject_topics: Entity[]
  project_attention: ProjectTrackerItem[]
}

export type ProjectHealth = "on_track" | "at_risk" | "stalled" | "paused" | "completed"

export type ProjectTrackerItem = {
  project: Entity
  milestone_count: number
  completed_milestone_count: number
  task_count: number
  open_task_count: number
  completed_task_count: number
  blocked_task_count: number
  overdue_task_count: number
  progress_percent: number
  health: ProjectHealth
  health_reasons: string[]
  next_deadline: string | null
  current_milestone: Entity | null
  last_activity_at: string | null
  shipped_this_week: number
  til_coverage_percent: number
  comprehension_debt_count: number
}

export type ProjectWorkspace = {
  summary: ProjectTrackerItem
  milestones: Entity[]
  tasks: Entity[]
  relationships: Link[]
  activity: SessionRecord[]
  knowledge: Entity[]
  comprehension_checks: ComprehensionCheck[]
}

export type WeeklyDigestRange = {
  start_date: string
  end_date: string
}

export type WeeklyDigestConnection = {
  link_id: string
  from_title: string | null
  to_title: string | null
  explanation: string | null
}

export type WeeklyDigestFadingTopic = {
  entity_id: string
  title: string | null
  confidence_score: number
}

export type WeeklyDigestDeadline = {
  entity_id: string
  title: string | null
  date: string
}

export type WeeklyDigestAction = {
  label: string
  reason: string
  priority: GuidancePriority
}

export type WeeklyDigest = {
  range: WeeklyDigestRange
  summary: string
  wins: string[]
  needs_attention: string[]
  new_connections: WeeklyDigestConnection[]
  fading_topics: WeeklyDigestFadingTopic[]
  upcoming_deadlines: WeeklyDigestDeadline[]
  suggested_next_actions: WeeklyDigestAction[]
}

export type TagTaxonomyItem = {
  tag: string
  total_entity_count: number
  entity_counts_by_type: Record<string, number>
  average_confidence_score: number
  last_activity_at: string | null
  open_task_count: number
  review_due_count: number
}

export type HeatmapDay = {
  date: string
  created_entities: number
  revisited_entities: number
  reviews: number
  pr_opened: number
  pr_merged: number
  pushes: number
  tils_created: number
}

export type HeatmapResponse = {
  range: WeeklyDigestRange
  days: HeatmapDay[]
}

export type GithubCiStatusItem = {
  project_id: string | null
  project_title: string | null
  repo: string
  latest_status: string
  latest_conclusion: string | null
  workflow_name: string
  url: string | null
  updated_at: string | null
}

export type GithubCiStatusResponse = {
  items: GithubCiStatusItem[]
}

export type LearningVsShippingDay = {
  date: string
  shipping_count: number
  learning_count: number
}

export type LearningVsShippingSummary = {
  shipped_without_learning_days: number
  learning_after_shipping_days: number
  shipping_days: number
  learning_days: number
}

export type LearningVsShippingResponse = {
  range: WeeklyDigestRange
  summary: LearningVsShippingSummary
  days: LearningVsShippingDay[]
}

export type AnalystTrend = {
  label: string
  evidence: string
  severity: "low" | "medium" | "high"
}

export type AnalystGap = {
  gap: string
  evidence: string
  suggested_action: string
  related_entity_ids: string[]
}

export type AnalystSolveRate = {
  summary: string
  easy: number
  medium: number
  hard: number
}

export type AnalystLearningDebt = {
  label: string
  reason: string
  suggested_action: string
}

export type AnalystWeekly = {
  headline: string
  trends: AnalystTrend[]
  gaps: AnalystGap[]
  solve_rate: AnalystSolveRate
  learning_debt: AnalystLearningDebt[]
  next_week_focus: string[]
}

export type DailyGuidanceAction = {
  action_kind: GuidanceActionKind
  label: string
  reason: string
  entity_id: string | null
  priority: GuidancePriority
}

export type GuidanceActionKind = "start_recall" | "open_task" | "open_project" | "study_subject" | "review_connection" | "open_comprehension"

export type DailyGuidance = {
  date: string
  summary: string
  actions: DailyGuidanceAction[]
}

export type RecallDueItem = {
  entity: Entity
  due_score: number
  due_reasons: string[]
  days_since_review: number | null
  days_until_exam: number | null
}

export type RecallGradePayload = {
  answer: string
  self_score?: number
}

export type RecallGradePreview = {
  entity_id: string
  suggested_score: number
  feedback: string
  missed_points: string[]
  next_action: RecallNextAction
  used_fallback: boolean
  mutates_state: false
}

export type RecallGradeApplyPayload = {
  answer: string
  confirmed_score: number
}

export type RecallGradeResult = {
  entity_id: string
  recalled_score: number
  feedback: string
  missed_points: string[]
  next_action: RecallNextAction
  reviewed_at: string
  updated_confidence_score: number
  used_fallback: boolean
}

export type GraphChatCitation = {
  entity_id: string
  title: string
  reason_used: string
  evidence_excerpt: string
}

export type GraphChatResult = {
  answer: string
  citations: GraphChatCitation[]
  missing: boolean
}

export type AgentStatus = {
  ai_enabled: boolean
  provider_name: string
  provider_ready: boolean
  api_key_configured: boolean
  fast_model: string
  smart_model: string
  disabled_reason: string | null
}

export type DeepConnectionSuggestion = {
  link_id: string
  from_id: string
  to_id: string
  from_title: string | null
  to_title: string | null
  relation_type: RelationType
  explanation: string
  confidence: number
}

export type DeepConnectionsRunResult = {
  candidate_pairs_considered: number
  suggestions_created: number
  suggestions: DeepConnectionSuggestion[]
}

export type RefreshAllEmbeddingsResult = {
  total_entities: number
  refreshed_count: number
  failed_count: number
  failed_entity_ids: string[]
}

export type DecayConfidenceJobResult = {
  processed_count: number
  updated_count: number
  run_at: string
  half_life_days: number
  minimum_confidence: number
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

export type IdeaValidationPayload = {
  idea: string
}

export type SimilarProduct = {
  name: string
  url: string | null
  note: string
}

export type ExistingStrength = {
  entity_id: string
  title: string | null
  reason: string
}

export type MissingPrerequisite = {
  topic: string
  why_needed: string
}

export type SuggestedMvpMilestone = {
  milestone: string
  tasks: string[]
}

export type IdeaValidationResult = {
  idea_summary: string
  similar_products: SimilarProduct[]
  your_existing_strengths: ExistingStrength[]
  missing_prerequisites: MissingPrerequisite[]
  suggested_mvp: SuggestedMvpMilestone[]
  risk_notes: string[]
  web_search_configured: boolean
  web_search_note: string | null
  graph_candidates_considered: number
  metadata: EntityMetadata
}

export type IdeaApprovePayload = {
  idea: string
  validation: IdeaValidationResult
  title?: string | null
  tags: string[]
}

export type IdeaApproveResult = {
  entity: Entity
}

export type IdeaProjectDraftResult = {
  idea: Entity
  project: Entity
  milestones: Entity[]
  tasks: Entity[]
}

export type ComprehensionCheck = {
  id: string
  entity_id: string | null
  ai_assist_level: string | null
  question: string | null
  your_answer: string | null
  ai_grade: string | null
  created_at: string | null
  answered_at: string | null
  entity: Entity | null
  feedback: string | null
  follow_up: string | null
}

export type GenerateComprehensionCheckPayload = {
  task_entity_id: string
  diff_or_summary?: string | null
}

export type GenerateComprehensionCheckResult = {
  status: "not_required" | "generated" | "answered"
  check_id: string | null
  task_entity_id: string
  ai_assist_level: AiAssistLevel | null
  question: string | null
  expected_answer: string | null
  why_this_matters: string | null
  used_fallback: boolean
  message: string | null
}

export type AnswerComprehensionCheckPayload = {
  your_answer: string
  self_grade?: ComprehensionGrade
}

export type AnswerComprehensionCheckResult = {
  check_id: string
  entity_id: string | null
  ai_grade: ComprehensionGrade
  feedback: string
  follow_up: string
  answered_at: string
  used_fallback: boolean
  updated_confidence_score: number
}

export type AnswerComprehensionCheckPreview = {
  check_id: string
  entity_id: string | null
  suggested_grade: ComprehensionGrade
  feedback: string
  follow_up: string
  used_fallback: boolean
  mutates_state: false
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
  const response = await authenticatedFetch(`${apiBaseUrl}${path}`, {
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

export function getPreferences() {
  return request<WorkspacePreferences>("/settings/preferences")
}

export function patchPreferences(payload: Partial<WorkspacePreferences>) {
  return request<WorkspacePreferences>("/settings/preferences", { method: "PATCH", body: JSON.stringify(payload) })
}

export function recordProductEvent(event_name: string, properties: Record<string, string | number | boolean>) {
  return request<{ accepted: true }>("/events", { method: "POST", body: JSON.stringify({ event_name, properties }) })
}

export function getEntity(entityId: string) {
  return request<Entity>(`/entities/${entityId}`)
}

export function revisitEntity(entityId: string) {
  return request<Entity>(`/entities/${entityId}/revisit`, {
    method: "POST",
  })
}

export function getProjectTracker() {
  return request<ProjectTrackerItem[]>("/projects/tracker")
}

export function getProjectWorkspace(projectId: string) {
  return request<ProjectWorkspace>(`/projects/${projectId}/tracker`)
}

export function createSession(payload: CreateSessionPayload) {
  return request<SessionRecord>("/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  })
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

export function getGraph(query?: GraphQuery) {
  return request<GraphPayload>(`/graph${buildQueryString(query)}`)
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

export function decayConfidenceJob() {
  return request<DecayConfidenceJobResult>("/jobs/decay-confidence", {
    method: "POST",
  })
}

export function createLink(payload: CreateLinkPayload) {
  return request<Link>("/links", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function deleteLink(linkId: string) {
  return request<void>(`/links/${linkId}`, {
    method: "DELETE",
  })
}

export function getReviewInbox(limit = 100) {
  return request<ReviewInboxLink[]>(`/links/review-inbox${buildQueryString({ limit })}`)
}

export function confirmLink(linkId: string) {
  return request<Link>(`/links/${linkId}/confirm`, {
    method: "POST",
  })
}

export function rejectLink(linkId: string) {
  return request<Link>(`/links/${linkId}/reject`, {
    method: "POST",
  })
}

export function getTodayAgenda(startDate?: string, endDate?: string, previewLimit = 8) {
  return request<TodayAgenda>(`/dashboard/agenda${buildQueryString({ start_date: startDate, end_date: endDate, preview_limit: previewLimit })}`)
}

export function getDashboardToday() {
  return request<DashboardToday>("/dashboard/today")
}

export function getWeeklyDigest(startDate?: string, endDate?: string) {
  return request<WeeklyDigest>(`/digest/weekly${buildQueryString({ start_date: startDate, end_date: endDate })}`)
}

export function getTagTaxonomy() {
  return request<{ tags: TagTaxonomyItem[] }>("/tags/taxonomy")
}

export function getTagEntities(tag: string, limit = 200) {
  return request<Entity[]>(`/tags/${encodeURIComponent(tag)}/entities${buildQueryString({ limit })}`)
}

export function getGithubFeed(limit = 20) {
  return request<GithubFeedItem[]>(`/github/feed${buildQueryString({ limit })}`)
}

export function getGithubCiStatus() {
  return request<GithubCiStatusResponse>("/github/ci-status")
}

export function getAnalyticsHeatmap(startDate?: string, endDate?: string) {
  return request<HeatmapResponse>(`/analytics/heatmap${buildQueryString({ start_date: startDate, end_date: endDate })}`)
}

export function getLearningVsShipping(startDate?: string, endDate?: string) {
  return request<LearningVsShippingResponse>(`/analytics/learning-vs-shipping${buildQueryString({ start_date: startDate, end_date: endDate })}`)
}

export function draftGithubTil(sessionId: string) {
  return request<GithubTilDraft>(`/github/sessions/${sessionId}/draft-til`, {
    method: "POST",
  })
}

export function approveGithubTil(sessionId: string, payload: GithubApproveTilPayload) {
  return request<GithubApproveTilResult>(`/github/sessions/${sessionId}/approve-til`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function validateIdea(payload: IdeaValidationPayload) {
  return request<IdeaValidationResult>("/ideas/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function approveIdea(payload: IdeaApprovePayload) {
  return request<IdeaApproveResult>("/ideas/approve", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function createIdeaProjectDraft(payload: IdeaApprovePayload) {
  return request<IdeaProjectDraftResult>("/ideas/project-draft", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function getDailyGuidance() {
  return request<DailyGuidance>("/agents/daily-guidance")
}

export function getWeeklyAnalyst(startDate?: string, endDate?: string) {
  return request<AnalystWeekly>(`/agents/analyst/weekly${buildQueryString({ start_date: startDate, end_date: endDate })}`)
}

export function getRecallDue(limit = 20, tag?: string) {
  return request<RecallDueItem[]>(`/recall/due${buildQueryString({ limit, tag })}`)
}

export function gradeRecall(entityId: string, payload: RecallGradePayload) {
  return request<RecallGradeResult>(`/recall/${entityId}/grade`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function previewRecall(entityId: string, payload: RecallGradePayload) {
  return request<RecallGradePreview>(`/recall/${entityId}/grade/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function applyRecall(entityId: string, payload: RecallGradeApplyPayload) {
  return request<RecallGradeResult>(`/recall/${entityId}/grade/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function getComprehensionChecks(status: "pending" | "answered" | "all" = "pending", limit = 100) {
  return request<ComprehensionCheck[]>(`/comprehension-checks${buildQueryString({ status, limit })}`)
}

export function generateComprehensionCheck(payload: GenerateComprehensionCheckPayload) {
  return request<GenerateComprehensionCheckResult>("/comprehension-checks/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function answerComprehensionCheck(checkId: string, payload: AnswerComprehensionCheckPayload) {
  return request<AnswerComprehensionCheckResult>(`/comprehension-checks/${checkId}/answer`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function previewComprehensionCheck(checkId: string, payload: AnswerComprehensionCheckPayload) {
  return request<AnswerComprehensionCheckPreview>(`/comprehension-checks/${checkId}/answer/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function applyComprehensionCheck(checkId: string, payload: { your_answer: string; confirmed_grade: ComprehensionGrade }) {
  return request<AnswerComprehensionCheckResult>(`/comprehension-checks/${checkId}/answer/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function askGraph(question: string) {
  return request<GraphChatResult>("/chat/graph", {
    method: "POST",
    body: JSON.stringify({ question }),
  })
}

export function getAgentStatus() {
  return request<AgentStatus>("/agents/status")
}

export function runDuplicateDetector(entityId: string) {
  return request<DuplicateDetectorResult>(`/agents/duplicate-detector/entities/${entityId}`, {
    method: "POST",
  })
}

export function runDeepConnections(batchLimit = 8) {
  return request<DeepConnectionsRunResult>(`/agents/deep-connections/run-once${buildQueryString({ batch_limit: batchLimit })}`, {
    method: "POST",
  })
}


export type DsaConnection = { platform: "leetcode" | "codeforces" | "codechef"; username: string; profile_url?: string | null; enabled: boolean }
export type DsaIntegrationStatus = { connections: Array<DsaConnection & { last_synced_at?: string | null; last_error?: string | null }>; configured_platforms: DsaConnection["platform"][] }
export type DsaSyncResponse = { results: Array<{ platform: DsaConnection["platform"]; status: "synced" | "skipped" | "failed"; imported_count: number; updated_count: number; skipped_count: number; message?: string | null }>; total_imported: number; total_updated: number; total_skipped: number }
export type DsaProblemStats = { solved: number; this_week: number; review_due: number; platforms: number }
export type DsaProblemPage = { items: Entity[]; total: number; limit: number; offset: number; stats: DsaProblemStats }
export type DsaProblemQuery = {
  search?: string
  platform?: string
  difficulty?: string
  status?: string
  tag?: string
  sort?: "updated_desc" | "updated_asc" | "title_asc" | "difficulty_asc"
  limit?: number
  offset?: number
}
export type DsaExtensionStatus = { paired: boolean; last_used_at: string | null; imported_problem_count: number }
export type DsaPairingCode = { code: string; expires_at: string }

export function getDsaIntegrationStatus() { return request<DsaIntegrationStatus>("/integrations/dsa/status") }
export function saveDsaConnections(payload: { connections: DsaConnection[] }) { return request<DsaIntegrationStatus>("/integrations/dsa/connections", { method: "PUT", body: JSON.stringify(payload) }) }
export function syncDsaIntegrations() { return request<DsaSyncResponse>("/integrations/dsa/sync", { method: "POST" }) }
export function getDsaProblems(query?: DsaProblemQuery) { return request<DsaProblemPage>(`/integrations/dsa/problems${buildQueryString(query)}`) }
export function getDsaExtensionStatus() { return request<DsaExtensionStatus>("/integrations/dsa/extension/pairing") }
export function createDsaPairingCode() { return request<DsaPairingCode>("/integrations/dsa/extension/pairing-codes", { method: "POST" }) }
export function revokeDsaExtension() { return request<void>("/integrations/dsa/extension/pairing", { method: "DELETE" }) }

export type AssistantActionBefore = {
  title: string | null
  content: string | null
  tags: string[]
  status: string | null
  difficulty: string | null
}

export type AssistantAction = {
  id: string
  action_type: "create_entity" | "update_entity" | "log_shipping"
  entity_type: EntityType | null
  target_id: string | null
  parent_id: string | null
  title: string | null
  content: string | null
  content_type: ContentType | null
  tags: string[]
  difficulty: DsaDifficulty | null
  status: string | null
  url: string | null
  solution_code: string | null
  summary: string
  before?: AssistantActionBefore | null
}
export type AssistantThread = { id: string; title: string; archived_at: string | null; created_at: string; updated_at: string }
export type AssistantMessage = { id: string; thread_id: string; role: "user" | "assistant"; content: string; model_stage: string | null; payload: AssistantMessagePayload; created_at: string }
export type AssistantThreadDetail = { thread: AssistantThread; messages: AssistantMessage[] }
export type AssistantTurn = { thread: AssistantThread; user_message: AssistantMessage; assistant_message: AssistantMessage; proposal_id: string | null }
export type AssistantProposalStatus = "pending" | "executing" | "executed" | "cancelled" | "expired" | "stale" | "failed"
export type AssistantRecallItem = { entity: Entity; due_reasons: string[] }
export type AssistantResultLink = { entity_id: string; title: string | null; status?: string; action_id?: string }
export type AssistantMessagePayload =
  | { kind: "answer"; [key: string]: unknown }
  | { kind: "questions"; questions: string[]; [key: string]: unknown }
  | { kind: "proposal"; proposal_id?: string; proposal_status?: AssistantProposalStatus; actions: AssistantAction[]; [key: string]: unknown }
  | { kind: "recall_due"; items: AssistantRecallItem[]; [key: string]: unknown }
  | { kind: "execution_result"; proposal_id?: string; status?: AssistantProposalStatus; results?: AssistantResultLink[]; [key: string]: unknown }
  | { kind: "recall_result"; recalled_score?: number; feedback?: string; missed_points?: string[]; next_action?: string; [key: string]: unknown }
  | { kind: "system_error"; retryable?: boolean; error?: string; [key: string]: unknown }
  | ({ kind?: undefined } & Record<string, unknown>)
export type AssistantExecution = { proposal_id: string; status: "executed"; results: Array<{ action_id: string; entity_id: string; title: string | null; status: string }>; message?: AssistantMessage }
export type AssistantPageContext = { route: string; entity_id?: string; entity_type?: EntityType; entity_title?: string }
export type AssistantRecallResponse = { grade: RecallGradeResult; message?: AssistantMessage }
export type AssistantRecallPreviewResponse = { grade: RecallGradePreview }

export function getAssistantThreads() { return request<AssistantThread[]>("/assistant/threads") }
export function createAssistantThread() { return request<AssistantThread>("/assistant/threads", { method: "POST" }) }
export function getAssistantThread(threadId: string) { return request<AssistantThreadDetail>(`/assistant/threads/${threadId}`) }
export function archiveAssistantThread(threadId: string) { return request<void>(`/assistant/threads/${threadId}`, { method: "DELETE" }) }
export function sendAssistantTurn(payload: { thread_id?: string | null; message: string; current_path: string; page_context?: AssistantPageContext }) {
  return request<AssistantTurn>("/assistant/turns", { method: "POST", body: JSON.stringify(payload) })
}
export function updateAssistantProposal(proposalId: string, actions: AssistantAction[]) {
  return request<{ proposal_id: string; actions: AssistantAction[]; status: string }>(`/assistant/proposals/${proposalId}`, { method: "PATCH", body: JSON.stringify({ actions }) })
}
export function executeAssistantProposal(proposalId: string, payload: { idempotency_key: string; action_ids?: string[] }) {
  return request<AssistantExecution>(`/assistant/proposals/${proposalId}/execute`, { method: "POST", body: JSON.stringify(payload) })
}
export function cancelAssistantProposal(proposalId: string) { return request<void>(`/assistant/proposals/${proposalId}`, { method: "DELETE" }) }
export function gradeAssistantRecall(payload: { entity_id: string; answer: string; self_score?: number; thread_id?: string; source_message_id?: string }) {
  return request<AssistantRecallResponse>("/assistant/recall/grade", { method: "POST", body: JSON.stringify(payload) })
}
export function previewAssistantRecall(payload: { entity_id: string; answer: string; self_score?: number; thread_id?: string; source_message_id?: string }) {
  return request<AssistantRecallPreviewResponse>("/assistant/recall/preview", { method: "POST", body: JSON.stringify(payload) })
}
export function applyAssistantRecall(payload: { entity_id: string; answer: string; self_score: number; thread_id?: string; source_message_id?: string }) {
  return request<AssistantRecallResponse>("/assistant/recall/apply", { method: "POST", body: JSON.stringify(payload) })
}
import { authenticatedFetch } from "@/lib/auth-client"
