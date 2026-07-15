import { Link } from "react-router-dom"

import type { Entity } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getEntityContentPreview } from "@/features/entities/content"
import { cn } from "@/lib/utils"

type EntityListProps = {
  entities: Entity[]
  activeEntityId?: string
  title?: string
  description?: string
  compact?: boolean
  isLoading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
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
  isLoading = false,
  errorMessage = null,
  onRetry,
}: EntityListProps) {
  return (
    <Card className="h-full">
      <CardHeader className={compact ? "p-4" : undefined}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("space-y-3", compact ? "p-4 pt-0" : undefined)}>
        {isLoading ? (
          <div className="rounded-lg border border-border bg-background px-4 py-6 text-sm text-muted-foreground">
            Loading entities...
          </div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="space-y-3 rounded-lg border border-danger/25 bg-danger/5 px-4 py-4 text-sm text-danger">
            <p>{errorMessage}</p>
            {onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !errorMessage && entities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground">
            <p className="font-medium text-secondary">No entities yet</p>
            <p className="mt-1">Create the first capture to populate the shared knowledge substrate.</p>
          </div>
        ) : null}

        {!isLoading && !errorMessage
          ? entities.map((entity) => (
              <Link
                key={entity.id}
                to={`/entities/${entity.id}`}
                className={cn(
                  "block rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:border-primary/40 hover:bg-background",
                  entity.id === activeEntityId && "border-primary/50 bg-background",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <p className="truncate text-sm font-medium text-foreground">{entity.title ?? "Untitled entity"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{entity.type ?? "unknown"}</Badge>
                      <Badge>{entity.content_type ?? "unset"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{getEntityContentPreview(entity)}</p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{formatDate(entity.created_at)}</span>
                </div>
              </Link>
            ))
          : null}
      </CardContent>
    </Card>
  )
}
