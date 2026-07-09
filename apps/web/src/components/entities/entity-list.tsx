import { Link } from "react-router-dom"

import type { Entity } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type EntityListProps = {
  entities: Entity[]
  activeEntityId?: string
  title?: string
  description?: string
  compact?: boolean
}

function formatDate(value: string | null) {
  if (!value) {
    return "No timestamp"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function EntityList({
  entities,
  activeEntityId,
  title = "Entities",
  description = "Recent captures across the shared knowledge substrate.",
  compact = false,
}: EntityListProps) {
  return (
    <Card className="h-full">
      <CardHeader className={compact ? "p-4" : undefined}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("space-y-3", compact ? "p-4 pt-0" : undefined)}>
        {entities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
            No entities yet. Use the capture form to create the first one.
          </div>
        ) : null}

        {entities.map((entity) => (
          <Link
            key={entity.id}
            to={`/entities/${entity.id}`}
            className={cn(
              "block rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 transition-colors hover:border-blue-500/40 hover:bg-zinc-900",
              entity.id === activeEntityId && "border-blue-500/50 bg-zinc-900",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <p className="truncate text-sm font-medium text-zinc-100">{entity.title ?? "Untitled entity"}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{entity.type ?? "unknown"}</Badge>
                  <Badge>{entity.content_type ?? "unset"}</Badge>
                </div>
              </div>
              <span className="font-mono text-xs text-zinc-500">{formatDate(entity.created_at)}</span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
