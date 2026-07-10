import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatEntityDate, formatExamDate, getEntityExamDate, getEntityStatus } from "@/features/entities/metadata"
import { getAgentStatus, getDailyGuidance, getDashboardToday, type AgentStatus, type DailyGuidance, type DashboardToday, type GuidancePriority } from "@/lib/api"

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

export function TodayPage() {
  const [summary, setSummary] = useState<DashboardToday | null>(null)
  const [guidance, setGuidance] = useState<DailyGuidance | null>(null)
  const [aiStatus, setAiStatus] = useState<AgentStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshingGuidance, setIsRefreshingGuidance] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guidanceError, setGuidanceError] = useState<string | null>(null)
  const [aiStatusError, setAiStatusError] = useState<string | null>(null)

  async function loadDashboard() {
    setIsLoading(true)
    setError(null)
    setGuidanceError(null)
    setAiStatusError(null)

    const [dashboardResult, guidanceResult, agentStatusResult] = await Promise.allSettled([getDashboardToday(), getDailyGuidance(), getAgentStatus()])

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
        description: "Recent session records created by entity creation, status changes, links, and recall events.",
        content:
          summary.recent_sessions.length > 0 ? (
            <div className="space-y-3">
              {summary.recent_sessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
                  <p className="text-sm text-zinc-100">{String(session.meta.entity_title ?? "Untitled entity")}</p>
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
          <CardDescription>Loading dashboard, guidance, and AI safety status...</CardDescription>
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
  )
}
