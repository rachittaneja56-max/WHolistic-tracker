
import { useEffect, useMemo, useState } from "react"

import { HeatmapGrid } from "@/components/heatmap-grid"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatEntityDate } from "@/features/entities/metadata"
import {
  getAnalyticsHeatmap,
  getGithubCiStatus,
  getLearningVsShipping,
  type GithubCiStatusItem,
  type HeatmapResponse,
  type LearningVsShippingResponse,
} from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load GitHub analytics."
}

function getCiConclusionVariant(conclusion: string | null): "default" | "success" | "warning" | "danger" | "blue" {
  if (conclusion === "success") {
    return "success"
  }
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled" || conclusion === "action_required") {
    return "danger"
  }
  if (conclusion === "neutral" || conclusion === "skipped") {
    return "default"
  }
  if (conclusion) {
    return "warning"
  }
  return "blue"
}

function buildCodeHeatmapCells(heatmap: HeatmapResponse | null) {
  return (heatmap?.days ?? []).map((day) => ({
    date: day.date,
    value: day.pr_opened + day.pr_merged + day.pushes,
  }))
}

function buildLearningHeatmapCells(heatmap: HeatmapResponse | null) {
  return (heatmap?.days ?? []).map((day) => ({
    date: day.date,
    value: day.created_entities + day.revisited_entities + day.reviews,
  }))
}

function buildLearningVsShippingMessage(learningVsShipping: LearningVsShippingResponse | null) {
  if (!learningVsShipping) {
    return null
  }

  return {
    shippedWithoutLearning: `You shipped code without capturing learning on ${learningVsShipping.summary.shipped_without_learning_days} day(s).`,
    learningAfterShipping: `You captured learning after shipping on ${learningVsShipping.summary.learning_after_shipping_days} day(s).`,
  }
}

export function GithubAnalyticsPanel() {
  const [analyticsHeatmap, setAnalyticsHeatmap] = useState<HeatmapResponse | null>(null)
  const [ciStatus, setCiStatus] = useState<GithubCiStatusItem[]>([])
  const [learningVsShipping, setLearningVsShipping] = useState<LearningVsShippingResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [ciStatusError, setCiStatusError] = useState<string | null>(null)
  const [learningVsShippingError, setLearningVsShippingError] = useState<string | null>(null)

  async function loadAnalytics() {
    setIsLoading(true)
    setAnalyticsError(null)
    setCiStatusError(null)
    setLearningVsShippingError(null)

    const [heatmapResult, ciStatusResult, learningVsShippingResult] = await Promise.allSettled([
      getAnalyticsHeatmap(),
      getGithubCiStatus(),
      getLearningVsShipping(),
    ])

    if (heatmapResult.status === "fulfilled") {
      setAnalyticsHeatmap(heatmapResult.value)
    } else {
      setAnalyticsHeatmap(null)
      setAnalyticsError(getErrorMessage(heatmapResult.reason))
    }

    if (ciStatusResult.status === "fulfilled") {
      setCiStatus(ciStatusResult.value.items)
    } else {
      setCiStatus([])
      setCiStatusError(getErrorMessage(ciStatusResult.reason))
    }

    if (learningVsShippingResult.status === "fulfilled") {
      setLearningVsShipping(learningVsShippingResult.value)
    } else {
      setLearningVsShipping(null)
      setLearningVsShippingError(getErrorMessage(learningVsShippingResult.reason))
    }

    setIsLoading(false)
  }

  useEffect(() => {
    void loadAnalytics()
  }, [])

  const codeHeatmapCells = useMemo(() => buildCodeHeatmapCells(analyticsHeatmap), [analyticsHeatmap])
  const learningHeatmapCells = useMemo(() => buildLearningHeatmapCells(analyticsHeatmap), [analyticsHeatmap])
  const learningVsShippingMessage = useMemo(() => buildLearningVsShippingMessage(learningVsShipping), [learningVsShipping])

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Shipping vs Learning</CardTitle>
          <CardDescription>Session-derived activity only. Shipping comes from pushes and merged PRs. Learning comes from entity capture, revisits, and reviews.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? <p className="text-sm text-zinc-500">Loading heatmaps and shipping signals...</p> : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <HeatmapGrid
              title="Code activity heatmap"
              description="Pushes, opened PRs, and merged PRs by day."
              cells={codeHeatmapCells}
              accent="blue"
              valueLabel="shipping events"
            />
            <HeatmapGrid
              title="Learning activity heatmap"
              description="Entity capture, revisits, and reviews by day."
              cells={learningHeatmapCells}
              accent="amber"
              valueLabel="learning events"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Shipping without learning</p>
              <p className="mt-2 text-sm text-zinc-300">{learningVsShippingMessage?.shippedWithoutLearning ?? "Not enough data yet."}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Learning after shipping</p>
              <p className="mt-2 text-sm text-zinc-300">{learningVsShippingMessage?.learningAfterShipping ?? "Not enough data yet."}</p>
            </div>
          </div>

          {learningVsShipping ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="font-mono text-xs text-zinc-500">shipping days</p>
                <p className="mt-2 font-mono text-sm text-zinc-100">{learningVsShipping.summary.shipping_days}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="font-mono text-xs text-zinc-500">learning days</p>
                <p className="mt-2 font-mono text-sm text-zinc-100">{learningVsShipping.summary.learning_days}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="font-mono text-xs text-zinc-500">captured after shipping</p>
                <p className="mt-2 font-mono text-sm text-zinc-100">{learningVsShipping.summary.learning_after_shipping_days}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="font-mono text-xs text-zinc-500">missed capture days</p>
                <p className="mt-2 font-mono text-sm text-zinc-100">{learningVsShipping.summary.shipped_without_learning_days}</p>
              </div>
            </div>
          ) : null}

          {analyticsError ? <p className="text-sm text-amber-300">{analyticsError}</p> : null}
          {learningVsShippingError ? <p className="text-sm text-amber-300">{learningVsShippingError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CI Status</CardTitle>
          <CardDescription>Latest workflow/check status grouped by repo or matched project from `metadata.repo_url`.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-zinc-500">Loading CI status...</p> : null}
          {ciStatus.length > 0 ? (
            ciStatus.map((item) => (
              <div key={`${item.project_id ?? "none"}:${item.repo}:${item.workflow_name}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{item.project_title ?? item.repo}</p>
                    <p className="mt-1 font-mono text-xs text-zinc-500">{item.repo}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="blue">{item.latest_status}</Badge>
                    <Badge variant={getCiConclusionVariant(item.latest_conclusion)}>{item.latest_conclusion ?? "pending"}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  <span className="font-mono">{item.workflow_name}</span>
                  <span className="font-mono">updated {formatEntityDate(item.updated_at)}</span>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                      Open GitHub
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">No workflow or check events have been captured yet.</p>
          )}

          {ciStatusError ? <p className="text-sm text-amber-300">{ciStatusError}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
