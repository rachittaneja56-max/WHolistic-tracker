import type { Entity } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type EntityDetailCardProps = {
  entity: Entity
  isRefreshingEmbedding: boolean
  embeddingActionError: string | null
  onRefreshEmbedding: () => void
}

function formatDate(value: string | null) {
  if (!value) {
    return "No timestamp"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value))
}

export function EntityDetailCard({ entity, isRefreshingEmbedding, embeddingActionError, onRefreshEmbedding }: EntityDetailCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="blue">{entity.type ?? "unknown"}</Badge>
          <Badge>{entity.content_type ?? "unset"}</Badge>
          {entity.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <CardTitle className="text-2xl text-foreground">{entity.title ?? "Untitled entity"}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Entity detail with embedding readiness, timestamps, and raw metadata from the shared entities table.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Entity metadata</h2>
            <Button type="button" variant="outline" onClick={onRefreshEmbedding} disabled={isRefreshingEmbedding}>
              {isRefreshingEmbedding ? "Refreshing..." : "Refresh embedding"}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Embedding</p>
              <p className="mt-2 font-mono text-sm text-foreground">{entity.has_embedding ? "ready" : "missing"}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Confidence</p>
              <p className="mt-2 font-mono text-sm text-foreground">{entity.confidence_score.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Created</p>
              <p className="mt-2 font-mono text-sm text-foreground">{formatDate(entity.created_at)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last revisited</p>
              <p className="mt-2 font-mono text-sm text-foreground">{formatDate(entity.last_revisited_at)}</p>
            </div>
          </div>

          {embeddingActionError ? <p className="text-sm text-danger">{embeddingActionError}</p> : null}
        </div>

        <Separator />

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Raw metadata</h2>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-xs text-secondary">
            {JSON.stringify(entity.metadata, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
