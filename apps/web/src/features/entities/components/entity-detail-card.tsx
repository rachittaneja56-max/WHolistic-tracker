import type { Entity } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

type EntityDetailCardProps = {
  entity: Entity
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

export function EntityDetailCard({ entity }: EntityDetailCardProps) {
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
        <CardTitle className="text-2xl text-zinc-100">{entity.title ?? "Untitled entity"}</CardTitle>
        <CardDescription className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
          Created {formatDate(entity.created_at)} · Confidence {entity.confidence_score.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
            {entity.content?.trim() ? entity.content : "No content has been captured for this entity yet."}
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Metadata</h2>
          <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
            {JSON.stringify(entity.metadata, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
