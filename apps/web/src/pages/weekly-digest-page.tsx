import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatEntityDate } from "@/features/entities/metadata"
import { getWeeklyDigest, type WeeklyDigest, type WeeklyDigestAction } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load the weekly digest."
}

function getPriorityVariant(priority: WeeklyDigestAction["priority"]): "default" | "warning" | "blue" {
  if (priority === "high") {
    return "warning"
  }
  if (priority === "medium") {
    return "blue"
  }
  return "default"
}

function buildDefaultRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 6)

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

export function WeeklyDigestPage() {
  const defaults = useMemo(() => buildDefaultRange(), [])
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadDigest(rangeStart = startDate, rangeEnd = endDate) {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getWeeklyDigest(rangeStart, rangeEnd)
      setDigest(result)
    } catch (loadError) {
      setDigest(null)
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDigest(defaults.startDate, defaults.endDate)
  }, [defaults.endDate, defaults.startDate])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>This Week&apos;s Learning</CardTitle>
              <CardDescription>Weekly digest built from entities, sessions, reviews, links, and comprehension checks only.</CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <label className="font-mono text-xs text-muted-foreground" htmlFor="weekly-start-date">
                  Start date
                </label>
                <Input id="weekly-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-full sm:w-[180px]" />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs text-muted-foreground" htmlFor="weekly-end-date">
                  End date
                </label>
                <Input id="weekly-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-full sm:w-[180px]" />
              </div>
              <Button type="button" onClick={() => void loadDigest()} disabled={isLoading}>
                {isLoading ? "Loading..." : "Refresh digest"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning">{error}</p> : null}
          {digest ? (
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="blue">Weekly digest</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {digest.range.start_date} to {digest.range.end_date}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-secondary">{digest.summary}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {digest ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Wins</CardTitle>
              <CardDescription>Real activity captured in the selected range.</CardDescription>
            </CardHeader>
            <CardContent>
              {digest.wins.length > 0 ? (
                <div className="space-y-3">
                  {digest.wins.map((item) => (
                    <div key={item} className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-secondary">
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No wins recorded for this range.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs Attention</CardTitle>
              <CardDescription>Fading knowledge, pending review, and deadline pressure.</CardDescription>
            </CardHeader>
            <CardContent>
              {digest.needs_attention.length > 0 ? (
                <div className="space-y-3">
                  {digest.needs_attention.map((item) => (
                    <div key={item} className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-secondary">
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing urgent surfaced for this range.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>New Connections</CardTitle>
              <CardDescription>Confirmed links created in the selected range.</CardDescription>
            </CardHeader>
            <CardContent>
              {digest.new_connections.length > 0 ? (
                <div className="space-y-3">
                  {digest.new_connections.map((connection) => (
                    <div key={connection.link_id} className="rounded-lg border border-border bg-background px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {connection.from_title ? <span className="text-sm text-foreground">{connection.from_title}</span> : null}
                        <span className="font-mono text-xs text-muted-foreground">-&gt;</span>
                        {connection.to_title ? <span className="text-sm text-foreground">{connection.to_title}</span> : null}
                      </div>
                      <p className="mt-3 text-sm text-secondary">{connection.explanation ?? "No explanation provided."}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No confirmed links were created in this range.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Suggested Next Actions</CardTitle>
              <CardDescription>Suggested only. You still decide what becomes final knowledge.</CardDescription>
            </CardHeader>
            <CardContent>
              {digest.suggested_next_actions.length > 0 ? (
                <div className="space-y-3">
                  {digest.suggested_next_actions.map((action) => (
                    <div key={`${action.label}-${action.reason}`} className="rounded-lg border border-border bg-background px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{action.label}</p>
                        <Badge variant={getPriorityVariant(action.priority)}>{action.priority}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-secondary">{action.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No next actions were generated for this range.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fading Topics</CardTitle>
              <CardDescription>Lower-confidence entities that may need another pass.</CardDescription>
            </CardHeader>
            <CardContent>
              {digest.fading_topics.length > 0 ? (
                <div className="space-y-3">
                  {digest.fading_topics.map((topic) => (
                    <Link key={topic.entity_id} to={`/entities/${topic.entity_id}`} className="block rounded-lg border border-border bg-background px-4 py-4 transition-colors hover:border-primary/40">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-foreground">{topic.title ?? "Untitled entity"}</p>
                        <span className="font-mono text-xs text-warning">{topic.confidence_score.toFixed(2)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No fading topics crossed the confidence threshold.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <CardDescription>Subject-topic exam dates and related study pressure.</CardDescription>
            </CardHeader>
            <CardContent>
              {digest.upcoming_deadlines.length > 0 ? (
                <div className="space-y-3">
                  {digest.upcoming_deadlines.map((deadline) => (
                    <Link key={deadline.entity_id} to={`/entities/${deadline.entity_id}`} className="block rounded-lg border border-border bg-background px-4 py-4 transition-colors hover:border-primary/40">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-foreground">{deadline.title ?? "Untitled subject"}</p>
                        <span className="font-mono text-xs text-warning">{deadline.date}</span>
                      </div>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">exam_date {deadline.date}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming deadlines are captured right now.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

