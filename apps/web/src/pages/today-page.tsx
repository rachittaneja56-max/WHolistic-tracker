import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatEntityDate, formatExamDate, getEntityExamDate, getEntityStatus } from "@/features/entities/metadata"
import { getAgentStatus, getDashboardToday, type AgentStatus, type DashboardToday } from "@/lib/api"

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

export function TodayPage() {
  const [summary, setSummary] = useState<DashboardToday | null>(null)
  const [aiStatus, setAiStatus] = useState<AgentStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aiStatusError, setAiStatusError] = useState<string | null>(null)

  async function loadDashboard() {
    setIsLoading(true)
    setError(null)
    setAiStatusError(null)

    const [dashboardResult, agentStatusResult] = await Promise.allSettled([getDashboardToday(), getAgentStatus()])

    if (dashboardResult.status === "fulfilled") {
      setSummary(dashboardResult.value)
    } else {
      setSummary(null)
      setError(getErrorMessage(dashboardResult.reason))
    }

    if (agentStatusResult.status === "fulfilled") {
      setAiStatus(agentStatusResult.value)
    } else {
      setAiStatus(null)
      setAiStatusError(getErrorMessage(agentStatusResult.reason))
    }

    setIsLoading(false)
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
        description: "Recent session records created by entity creation, status changes, and links.",
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
          <CardDescription>Loading dashboard and AI safety status...</CardDescription>
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
          <CardTitle>AI Status</CardTitle>
          <CardDescription>Phase 3 infrastructure only. Agents are not active yet, and no secrets are exposed here.</CardDescription>
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
                <p className="mt-2 text-sm text-zinc-500">{aiStatus.disabled_reason ?? "Provider configuration looks healthy for JSON-only internal tests."}</p>
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
