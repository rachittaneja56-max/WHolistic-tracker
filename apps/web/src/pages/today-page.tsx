import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatEntityDate, formatExamDate, getEntityExamDate, getEntityStatus } from "@/features/entities/metadata"
import {
  approveGithubTil,
  draftGithubTil,
  getAgentStatus,
  getDailyGuidance,
  getDashboardToday,
  getGithubFeed,
  type AgentStatus,
  type DailyGuidance,
  type DashboardToday,
  type GithubFeedItem,
  type GithubTilDraft,
  type GuidancePriority,
} from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load today's dashboard."
}

function getStatusVariant(status: string | null): "default" | "success" | "warning" {
  if (status === "done") {
    return "success"
  }
  if (status === "in_progress") {
    return "warning"
  }
  return "default"
}

function getAiBadgeVariant(isHealthy: boolean): "blue" | "warning" {
  return isHealthy ? "blue" : "warning"
}

function getPriorityVariant(priority: GuidancePriority): "default" | "warning" | "blue" {
  if (priority === "high") {
    return "warning"
  }
  if (priority === "medium") {
    return "blue"
  }
  return "default"
}

function getGithubActionLabel(action: string) {
  if (action === "pr_merged") {
    return "PR merged"
  }
  if (action === "pr_opened") {
    return "PR opened"
  }
  if (action === "push") {
    return "Push"
  }
  return action
}

function getGithubActionVariant(action: string): "default" | "blue" {
  return action === "pr_merged" ? "blue" : "default"
}

function buildGithubSubtitle(item: GithubFeedItem) {
  if (item.action === "push") {
    if (typeof item.commit_count === "number") {
      return `${item.commit_count} commit(s)`
    }
    return "Push activity"
  }
  if (typeof item.pr_number === "number") {
    return `PR #${item.pr_number}`
  }
  return "GitHub activity"
}

export function TodayPage() {
  const [summary, setSummary] = useState<DashboardToday | null>(null)
  const [guidance, setGuidance] = useState<DailyGuidance | null>(null)
  const [aiStatus, setAiStatus] = useState<AgentStatus | null>(null)
  const [githubFeed, setGithubFeed] = useState<GithubFeedItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshingGuidance, setIsRefreshingGuidance] = useState(false)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guidanceError, setGuidanceError] = useState<string | null>(null)
  const [aiStatusError, setAiStatusError] = useState<string | null>(null)
  const [githubFeedError, setGithubFeedError] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [activeDraft, setActiveDraft] = useState<GithubTilDraft | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftContent, setDraftContent] = useState("")
  const [draftTags, setDraftTags] = useState("")
  const [createdTilBySession, setCreatedTilBySession] = useState<Record<string, { id: string; title: string | null }>>({})

  async function loadDashboard() {
    setIsLoading(true)
    setError(null)
    setGuidanceError(null)
    setAiStatusError(null)
    setGithubFeedError(null)

    const [dashboardResult, guidanceResult, agentStatusResult, githubFeedResult] = await Promise.allSettled([
      getDashboardToday(),
      getDailyGuidance(),
      getAgentStatus(),
      getGithubFeed(),
    ])

    if (dashboardResult.status === "fulfilled") {
      setSummary(dashboardResult.value)
    } else {
      setSummary(null)
      setError(getErrorMessage(dashboardResult.reason))
    }

    if (guidanceResult.status === "fulfilled") {
      setGuidance(guidanceResult.value)
    } else {
      setGuidance(null)
      setGuidanceError(getErrorMessage(guidanceResult.reason))
    }

    if (agentStatusResult.status === "fulfilled") {
      setAiStatus(agentStatusResult.value)
    } else {
      setAiStatus(null)
      setAiStatusError(getErrorMessage(agentStatusResult.reason))
    }

    if (githubFeedResult.status === "fulfilled") {
      setGithubFeed(githubFeedResult.value)
    } else {
      setGithubFeed([])
      setGithubFeedError(getErrorMessage(githubFeedResult.reason))
    }

    setIsLoading(false)
  }

  async function refreshGuidance() {
    setIsRefreshingGuidance(true)
    setGuidanceError(null)

    try {
      const result = await getDailyGuidance()
      setGuidance(result)
    } catch (refreshError) {
      setGuidanceError(getErrorMessage(refreshError))
    } finally {
      setIsRefreshingGuidance(false)
    }
  }

  async function openDraftModal(sessionId: string) {
    setIsLoadingDraft(true)
    setDraftError(null)

    try {
      const draft = await draftGithubTil(sessionId)
      setActiveDraft(draft)
      setDraftTitle(draft.title)
      setDraftContent(draft.content)
      setDraftTags(draft.tags.join(", "))
    } catch (draftLoadError) {
      setDraftError(getErrorMessage(draftLoadError))
    } finally {
      setIsLoadingDraft(false)
    }
  }

  function closeDraftModal() {
    setActiveDraft(null)
    setDraftTitle("")
    setDraftContent("")
    setDraftTags("")
    setDraftError(null)
  }

  async function saveDraftTil() {
    if (!activeDraft) {
      return
    }

    if (!draftTitle.trim() || !draftContent.trim()) {
      setDraftError("Title and content are required before saving the TIL.")
      return
    }

    setIsSavingDraft(true)
    setDraftError(null)

    try {
      const result = await approveGithubTil(activeDraft.session_id, {
        title: draftTitle.trim(),
        content: draftContent.trim(),
        tags: draftTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      setCreatedTilBySession((current) => ({
        ...current,
        [activeDraft.session_id]: {
          id: result.entity.id,
          title: result.entity.title,
        },
      }))
      setGithubFeed((current) =>
        current.map((item) =>
          item.id === activeDraft.session_id
            ? {
                ...item,
                draft_available: false,
                approved_til_entity_id: result.entity.id,
                approved_til_title: result.entity.title,
              }
            : item,
        ),
      )
      closeDraftModal()
    } catch (saveError) {
      setDraftError(getErrorMessage(saveError))
    } finally {
      setIsSavingDraft(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const sections = useMemo(() => {
    if (!summary) {
      return []
    }

    return [
      {
        title: "Recent Activity",
        description: "Recent session records created by entity creation, status changes, links, recall events, and webhook activity.",
        content:
          summary.recent_sessions.length > 0 ? (
            <div className="space-y-3">
              {summary.recent_sessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <p className="text-sm text-zinc-100">{String(session.meta.entity_title ?? session.meta.repo_full_name ?? "Untitled activity")}</p>
                  <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                    {session.action ?? "activity"} · {formatEntityDate(session.date)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No recent activity yet.</p>
          ),
      },
      {
        title: "Open Tasks",
        description: "Tasks still marked as todo or in progress.",
        content:
          summary.open_tasks.length > 0 ? (
            <div className="space-y-3">
              {summary.open_tasks.map((task) => {
                const status = getEntityStatus(task)
                return (
                  <Link key={task.id} to="/projects" className="block rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 transition-colors hover:border-blue-500/40">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-zinc-100">{task.title ?? "Untitled task"}</p>
                      <Badge variant={getStatusVariant(status)}>{status ?? "todo"}</Badge>
                    </div>
                    <p className="mt-2 font-mono text-xs text-zinc-500">Created {formatEntityDate(task.created_at)}</p>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No open tasks right now.</p>
          ),
      },
      {
        title: "Upcoming Exams",
        description: "Subject-topic entities sorted by exam date.",
        content:
          summary.upcoming_subject_topics.length > 0 ? (
            <div className="space-y-3">
              {summary.upcoming_subject_topics.map((subject) => (
                <Link key={subject.id} to="/subjects" className="block rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 transition-colors hover:border-blue-500/40">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-zinc-100">{subject.title ?? "Untitled subject"}</p>
                    <Badge variant="warning">{formatExamDate(getEntityExamDate(subject))}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">{subject.content?.slice(0, 120) || "No notes captured yet."}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No upcoming exam dates captured yet.</p>
          ),
      },
      {
        title: "Recent Entities",
        description: "Fresh additions across all tracker lenses.",
        content:
          summary.recent_entities.length > 0 ? (
            <div className="space-y-3">
              {summary.recent_entities.map((entity) => (
                <Link key={entity.id} to={`/entities/${entity.id}`} className="block rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 transition-colors hover:border-blue-500/40">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-zinc-100">{entity.title ?? "Untitled entity"}</p>
                    <Badge>{entity.type ?? "unknown"}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-zinc-500">{formatEntityDate(entity.created_at)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No entities created yet.</p>
          ),
      },
    ]
  }, [summary])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
          <CardDescription>Loading dashboard, guidance, AI safety status, and GitHub activity...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
          <CardDescription>Unable to load the dashboard summary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-300">{error}</p>
          <Button type="button" variant="outline" onClick={() => void loadDashboard()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Today&apos;s Guidance</CardTitle>
                <CardDescription>
                  Grounded in your own graph only. When AI is unavailable, this falls back to deterministic review and deadline signals.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={() => void refreshGuidance()} disabled={isRefreshingGuidance}>
                {isRefreshingGuidance ? "Refreshing..." : "Refresh guidance"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {guidance ? (
              <>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={aiStatus?.provider_ready ? "blue" : "warning"}>{aiStatus?.provider_ready ? "AI guidance" : "Deterministic fallback"}</Badge>
                    <span className="font-mono text-xs text-zinc-500">{guidance.date}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">{guidance.summary}</p>
                </div>

                {guidance.actions.length > 0 ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {guidance.actions.map((action, index) => {
                      const destination = action.entity_id ? `/entities/${action.entity_id}` : "/review-inbox"
                      return (
                        <Link key={`${action.label}-${index}`} to={destination} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4 transition-colors hover:border-blue-500/40">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-zinc-100">{action.label}</p>
                            <Badge variant={getPriorityVariant(action.priority)}>{action.priority}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-zinc-300">{action.reason}</p>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No action items were returned for today.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-500">Guidance is unavailable right now.</p>
            )}

            {guidanceError ? <p className="text-sm text-amber-300">{guidanceError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Status</CardTitle>
            <CardDescription>Phase 3 guidance, recall, and graph chat stay reviewable and never expose secret keys.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiStatus ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">AI enabled</p>
                    <div className="mt-2">
                      <Badge variant={getAiBadgeVariant(aiStatus.ai_enabled)}>{aiStatus.ai_enabled ? "enabled" : "disabled"}</Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Provider ready</p>
                    <div className="mt-2">
                      <Badge variant={getAiBadgeVariant(aiStatus.provider_ready)}>{aiStatus.provider_ready ? "ready" : "not ready"}</Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">API key</p>
                    <div className="mt-2">
                      <Badge variant={getAiBadgeVariant(aiStatus.api_key_configured)}>{aiStatus.api_key_configured ? "configured" : "missing"}</Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Fast model</p>
                    <p className="mt-2 font-mono text-sm text-zinc-100">{aiStatus.fast_model}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Smart model</p>
                    <p className="mt-2 font-mono text-sm text-zinc-100">{aiStatus.smart_model}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Provider</p>
                  <p className="mt-2 font-mono text-sm text-zinc-100">{aiStatus.provider_name}</p>
                  <p className="mt-2 text-sm text-zinc-500">{aiStatus.disabled_reason ?? "Provider configuration looks healthy for grounded JSON-only workflows."}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">AI status is unavailable right now.</p>
            )}

            {aiStatusError ? <p className="text-sm text-amber-300">{aiStatusError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>GitHub Feed</CardTitle>
            <CardDescription>Single-webhook activity stored in `sessions`. Merged PRs can draft a TIL for review, but nothing becomes final knowledge until you approve it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {githubFeed.length > 0 ? (
              <div className="space-y-3">
                {githubFeed.map((item) => {
                  const createdTil = createdTilBySession[item.id]
                  const approvedTilId = createdTil?.id ?? item.approved_til_entity_id
                  const approvedTilTitle = createdTil?.title ?? item.approved_til_title

                  return (
                    <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getGithubActionVariant(item.action)}>{getGithubActionLabel(item.action)}</Badge>
                            <span className="font-mono text-xs text-zinc-500">{buildGithubSubtitle(item)} · {formatEntityDate(item.date)}</span>
                          </div>
                          <p className="text-sm font-medium text-zinc-100">{item.title ?? item.repo_full_name ?? "GitHub activity"}</p>
                          <p className="text-sm text-zinc-300">{item.message ?? "No summary available."}</p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                            {item.repo_full_name ? <span className="font-mono">{item.repo_full_name}</span> : null}
                            {item.sender_login ? <span className="font-mono">actor: {item.sender_login}</span> : null}
                            {item.project_id && item.project_title ? <Link to={`/entities/${item.project_id}`} className="text-blue-300 hover:text-blue-200">project: {item.project_title}</Link> : null}
                            {item.github_url ? (
                              <a href={item.github_url} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                                Open GitHub
                              </a>
                            ) : null}
                          </div>
                          {approvedTilId ? (
                            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-zinc-300">
                              <span className="font-mono text-xs uppercase tracking-[0.16em] text-blue-300">TIL created</span>
                              <div className="mt-1">
                                <Link to={`/entities/${approvedTilId}`} className="text-blue-300 hover:text-blue-200">
                                  {approvedTilTitle ?? "Open approved TIL"}
                                </Link>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {item.draft_available ? (
                          <Button type="button" variant="outline" onClick={() => void openDraftModal(item.id)} disabled={isLoadingDraft}>
                            {isLoadingDraft && activeDraft?.session_id !== item.id ? "Loading..." : "Draft TIL"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No GitHub webhook activity yet.</p>
            )}

            {githubFeedError ? <p className="text-sm text-amber-300">{githubFeedError}</p> : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>{section.content}</CardContent>
            </Card>
          ))}
        </div>
      </div>

      {activeDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Draft TIL</p>
                <h2 className="mt-2 text-xl font-semibold text-zinc-100">Review before saving</h2>
                <p className="mt-2 text-sm text-zinc-300">This is a starter draft from merged PR context only. Edit it until it matches what you actually learned.</p>
              </div>
              <Button type="button" variant="outline" onClick={closeDraftModal}>
                Cancel
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={activeDraft.used_ai ? "blue" : "warning"}>{activeDraft.used_ai ? "AI starter draft" : "Deterministic starter draft"}</Badge>
                  {activeDraft.meta.repo_full_name ? <span className="font-mono text-xs text-zinc-500">{String(activeDraft.meta.repo_full_name)}</span> : null}
                  {activeDraft.meta.pr_number ? <span className="font-mono text-xs text-zinc-500">PR #{String(activeDraft.meta.pr_number)}</span> : null}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-100" htmlFor="draft-til-title">
                  Title
                </label>
                <Input id="draft-til-title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-100" htmlFor="draft-til-tags">
                  Tags
                </label>
                <Input id="draft-til-tags" value={draftTags} onChange={(event) => setDraftTags(event.target.value)} placeholder="til, github, repo-name" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-100" htmlFor="draft-til-content">
                  Content
                </label>
                <Textarea id="draft-til-content" value={draftContent} onChange={(event) => setDraftContent(event.target.value)} className="min-h-[260px]" />
              </div>

              {draftError ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">{draftError}</p> : null}

              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeDraftModal}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveDraftTil()} disabled={isSavingDraft}>
                  {isSavingDraft ? "Saving..." : "Save TIL"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
