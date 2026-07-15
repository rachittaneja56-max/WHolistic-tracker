import { useEffect, useMemo, useState } from "react"
import { ArrowRight, BookOpenCheck, CalendarClock, Plus, Sparkles, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatEntityDate, formatExamDate, getEntityExamDate, getEntityStatus } from "@/features/entities/metadata"
import {
  getDailyGuidance,
  getDashboardToday,
  getRecallDue,
  type DailyGuidance,
  type DashboardToday,
  type RecallDueItem,
} from "@/lib/api"

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "The dashboard could not be loaded."
}

function destinationFor(entityId: string | null | undefined) {
  return entityId ? `/knowledge/entities/${entityId}` : "/learn"
}

const captureOptions = [
  ["Note", "note"],
  ["Practice problem", "dsa_problem"],
  ["Assignment", "assignment"],
  ["Project", "project"],
  ["Subject", "subject"],
  ["Idea", "idea"],
] as const

export function TodayPage() {
  const [summary, setSummary] = useState<DashboardToday | null>(null)
  const [guidance, setGuidance] = useState<DailyGuidance | null>(null)
  const [due, setDue] = useState<RecallDueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load({ refreshGuidance = false } = {}) {
    if (refreshGuidance) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const [dashboardResult, guidanceResult, recallResult] = await Promise.allSettled([
      getDashboardToday(),
      getDailyGuidance(),
      getRecallDue(5),
    ])

    if (dashboardResult.status === "fulfilled") setSummary(dashboardResult.value)
    else {
      setSummary(null)
      setError(messageFrom(dashboardResult.reason))
    }
    setGuidance(guidanceResult.status === "fulfilled" ? guidanceResult.value : null)
    setDue(recallResult.status === "fulfilled" ? recallResult.value : [])
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const recommended = useMemo(() => {
    const guided = guidance?.actions[0]
    if (guided) {
      return {
        eyebrow: "Recommended by your learning plan",
        title: guided.label,
        reason: guided.reason,
        href: destinationFor(guided.entity_id),
        label: "Start this action",
        priority: guided.priority,
      }
    }
    if (due[0]) {
      return {
        eyebrow: "Highest-priority review",
        title: due[0].entity.title ?? "Review a due item",
        reason: due[0].due_reasons[0] ?? "Recall it before the memory fades.",
        href: `/knowledge/recall?entity=${due[0].entity.id}`,
        label: "Start recall",
        priority: "high" as const,
      }
    }
    if (summary?.open_tasks[0]) {
      return {
        eyebrow: "Next open task",
        title: summary.open_tasks[0].title ?? "Continue an open task",
        reason: "Move one active commitment forward.",
        href: `/knowledge/entities/${summary.open_tasks[0].id}`,
        label: "Open task",
        priority: "medium" as const,
      }
    }
    return {
      eyebrow: "Build your learning loop",
      title: "Capture the first thing you want to retain",
      reason: "A useful workspace starts with one real note, task, subject, or practice problem.",
      href: "/capture",
      label: "Capture an item",
      priority: "low" as const,
    }
  }, [due, guidance, summary])

  if (loading) {
    return (
      <Card aria-live="polite">
        <CardHeader>
          <CardTitle>Preparing your next action</CardTitle>
          <CardDescription>Loading reviews, deadlines, and recent progress...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error && !summary) {
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>Home is temporarily unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent><Button onClick={() => void load()}>Try again</Button></CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Learning workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">What matters today</h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary">One clear next step, the reviews that need attention, and enough context to keep moving.</p>
        </div>
        <Button asChild variant="outline"><Link to="/app/insights"><TrendingUp className="mr-2 h-4 w-4" />Open insights</Link></Button>
      </header>

      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/10 via-surface to-surface">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{recommended.eyebrow}</p>
              <Badge variant={recommended.priority === "high" ? "warning" : "default"}>{recommended.priority} priority</Badge>
            </div>
            <h2 className="mt-4 max-w-3xl text-2xl font-semibold text-foreground">{recommended.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary">{recommended.reason}</p>
            {guidance?.summary ? <p className="mt-4 max-w-3xl border-l-2 border-primary/30 pl-3 text-xs leading-5 text-muted-foreground">{guidance.summary}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link to={recommended.href}>{recommended.label}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button variant="outline" onClick={() => void load({ refreshGuidance: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle>Due reviews</CardTitle><CardDescription>Short recall sessions that protect what you have learned.</CardDescription></div>
              <Badge variant={due.length ? "warning" : "success"}>{due.length} due</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {due.length ? (
              <div className="divide-y divide-border">
                {due.slice(0, 4).map((item) => (
                  <Link key={item.entity.id} to={`/knowledge/recall?entity=${item.entity.id}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:text-primary">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.entity.title ?? "Untitled review"}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.due_reasons[0] ?? "Ready for recall"}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">You are caught up. New due reviews will appear here.</div>}
            <Button asChild variant="ghost" className="mt-4"><Link to="/knowledge/recall">Open recall queue</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick capture</CardTitle><CardDescription>Choose what you are doing; the workspace handles the storage format.</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {captureOptions.map(([label, type]) => (
              <Button key={type} asChild variant="outline" className="justify-start"><Link to={`/capture?type=${type}`}><Plus className="mr-2 h-4 w-4" />{label}</Link></Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Deadlines and tasks</CardTitle><CardDescription>The next commitments that could benefit from attention.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {summary?.open_tasks.slice(0, 3).map((task) => (
              <Link key={task.id} to={`/knowledge/entities/${task.id}`} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 hover:border-primary/40">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{task.title ?? "Untitled task"}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{getEntityStatus(task)?.replace(/_/g, " ") ?? "open task"}</p></div>
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
            {summary?.upcoming_subject_topics.slice(0, 2).map((subject) => (
              <Link key={subject.id} to={`/knowledge/entities/${subject.id}`} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 hover:border-primary/40">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{subject.title ?? "Upcoming subject"}</p><p className="mt-1 text-xs text-muted-foreground">Exam {formatExamDate(getEntityExamDate(subject))}</p></div>
                <BookOpenCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              </Link>
            ))}
            {!summary?.open_tasks.length && !summary?.upcoming_subject_topics.length ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No immediate deadlines or open tasks.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent progress</CardTitle><CardDescription>A compact trail of what changed in your workspace.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {summary?.recent_entities.slice(0, 5).map((entity) => (
              <Link key={entity.id} to={`/knowledge/entities/${entity.id}`} className="flex items-center justify-between gap-4 rounded-lg px-1 py-2 hover:bg-surface-subtle">
                <div className="min-w-0"><p className="truncate text-sm text-foreground">{entity.title ?? "Untitled item"}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{entity.type?.replace(/_/g, " ") ?? "item"} - {formatEntityDate(entity.created_at)}</p></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
            {!summary?.recent_entities.length ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Capture something you learned to start your progress trail.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
