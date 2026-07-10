import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useOutletContext } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CaptureEntityForm } from "@/features/entities/components/capture-entity-form"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { getWeeklyAnalyst, type AnalystGap, type AnalystTrend, type EntityType, type WeeklyDigestRange, type AnalystWeekly } from "@/lib/api"

type PrefillState = {
  title: string
  content: string
  type: EntityType
  contentType: "markdown"
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load the analyst brief."
}

function getSeverityVariant(severity: AnalystTrend["severity"]): "default" | "warning" | "danger" {
  if (severity === "high") {
    return "danger"
  }
  if (severity === "medium") {
    return "warning"
  }
  return "default"
}

function buildTaskPrefillFromGap(gap: AnalystGap): PrefillState {
  return {
    title: gap.gap,
    content: `${gap.evidence}\n\nSuggested action: ${gap.suggested_action}`,
    type: "task",
    contentType: "markdown",
  }
}

function buildNotePrefillFromGap(gap: AnalystGap): PrefillState {
  return {
    title: gap.gap,
    content: `${gap.evidence}\n\nSuggested action: ${gap.suggested_action}`,
    type: "note",
    contentType: "markdown",
  }
}

function formatRange(range: WeeklyDigestRange | null) {
  if (!range) {
    return "Latest 7 days"
  }
  return `${range.start_date} to ${range.end_date}`
}

export function AnalystPage() {
  const navigate = useNavigate()
  const { entities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()
  const [brief, setBrief] = useState<AnalystWeekly | null>(null)
  const [range, setRange] = useState<WeeklyDigestRange | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capturePrefill, setCapturePrefill] = useState<PrefillState | null>(null)
  const [captureKind, setCaptureKind] = useState<"task" | "note" | null>(null)

  async function loadBrief() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getWeeklyAnalyst()
      setBrief(result)
      const end = new Date()
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      setRange({ start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) })
    } catch (loadError) {
      setBrief(null)
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadBrief()
  }, [])

  const relatedEntityMap = useMemo(() => new Map(entities.map((entity) => [entity.id, entity])), [entities])

  function handleCreated(entity: (typeof entities)[number]) {
    addEntityToList(entity)
    setCapturePrefill(null)
    setCaptureKind(null)
    navigate(`/entities/${entity.id}`)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyst</CardTitle>
          <CardDescription>Loading the weekly analyst brief from your own graph data...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyst</CardTitle>
          <CardDescription>Unable to load the weekly analyst brief.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-300">{error}</p>
          <Button type="button" variant="outline" onClick={() => void loadBrief()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!brief) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyst</CardTitle>
          <CardDescription>No analyst data is available yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Capture some DSA work, reviews, tasks, or GitHub activity and the analyst brief will start to become useful.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Analyst Brief</CardTitle>
            <CardDescription>Suggestion-only weekly analysis from your own entities, links, sessions, reviews, comprehension checks, and GitHub activity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="blue">Weekly analyst</Badge>
                <span className="font-mono text-xs text-zinc-500">{formatRange(range)}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-300">{brief.headline}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Trends</CardTitle>
              <CardDescription>Evidence-backed patterns only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {brief.trends.length > 0 ? brief.trends.map((trend) => (
                <div key={`${trend.label}-${trend.evidence}`} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{trend.label}</p>
                    <Badge variant={getSeverityVariant(trend.severity)}>{trend.severity}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{trend.evidence}</p>
                </div>
              )) : <p className="text-sm text-zinc-500">No weekly trends were detected.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Solve Rate</CardTitle>
              <CardDescription>DSA difficulty distribution captured this week.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-300">{brief.solve_rate.summary}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <p className="font-mono text-xs text-zinc-500">easy</p>
                  <p className="mt-2 font-mono text-sm text-zinc-100">{brief.solve_rate.easy}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <p className="font-mono text-xs text-zinc-500">medium</p>
                  <p className="mt-2 font-mono text-sm text-zinc-100">{brief.solve_rate.medium}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <p className="font-mono text-xs text-zinc-500">hard</p>
                  <p className="mt-2 font-mono text-sm text-zinc-100">{brief.solve_rate.hard}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gaps</CardTitle>
              <CardDescription>Suggested only. Nothing is written unless you confirm in capture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {brief.gaps.length > 0 ? brief.gaps.map((gap) => (
                <div key={`${gap.gap}-${gap.suggested_action}`} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                  <p className="text-sm font-medium text-zinc-100">{gap.gap}</p>
                  <p className="mt-2 text-sm text-zinc-300">{gap.evidence}</p>
                  <p className="mt-2 text-sm text-zinc-500">{gap.suggested_action}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => { setCapturePrefill(buildTaskPrefillFromGap(gap)); setCaptureKind("task") }}>
                      Create task from suggestion
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setCapturePrefill(buildNotePrefillFromGap(gap)); setCaptureKind("note") }}>
                      Create note from gap
                    </Button>
                    {gap.related_entity_ids.map((entityId) => (
                      relatedEntityMap.get(entityId) ? (
                        <Button key={entityId} asChild size="sm" variant="outline">
                          <Link to={`/entities/${entityId}`}>Open related entity</Link>
                        </Button>
                      ) : null
                    ))}
                  </div>
                </div>
              )) : <p className="text-sm text-zinc-500">No major graph gaps were detected.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning Debt</CardTitle>
              <CardDescription>Flagged checks, low-confidence topics, and pending review work.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {brief.learning_debt.length > 0 ? brief.learning_debt.map((item) => (
                <div key={`${item.label}-${item.reason}`} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                  <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                  <p className="mt-2 text-sm text-zinc-300">{item.reason}</p>
                  <p className="mt-2 text-sm text-zinc-500">{item.suggested_action}</p>
                </div>
              )) : <p className="text-sm text-zinc-500">No learning debt surfaced this week.</p>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Next Week Focus</CardTitle>
            <CardDescription>Concrete focus items, still suggestion-only.</CardDescription>
          </CardHeader>
          <CardContent>
            {brief.next_week_focus.length > 0 ? (
              <div className="space-y-3">
                {brief.next_week_focus.map((item) => (
                  <div key={item} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No focus items were generated.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {capturePrefill && captureKind ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Prefilled capture</p>
                <h2 className="mt-2 text-xl font-semibold text-zinc-100">Review before saving</h2>
                <p className="mt-2 text-sm text-zinc-300">This is a suggestion starter only. Nothing is saved until you submit the capture form.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => { setCapturePrefill(null); setCaptureKind(null) }}>
                Cancel
              </Button>
            </div>
            <CaptureEntityForm
              key={`${captureKind}-${capturePrefill.title}-${capturePrefill.content}`}
              availableEntities={entities}
              onCreated={handleCreated}
              initialTitle={capturePrefill.title}
              initialContent={capturePrefill.content}
              initialType={capturePrefill.type}
              initialContentType={capturePrefill.contentType}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
