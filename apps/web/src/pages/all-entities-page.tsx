import { Link, useOutletContext } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getEntityContentPreview } from "@/features/entities/content"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { formatEntityDate } from "@/features/entities/metadata"

export function AllEntitiesPage() {
  const { entities, isEntitiesLoading, entitiesError, refreshEntities } = useOutletContext<EntitiesLayoutContext>()

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Entities</CardTitle>
        <CardDescription>A shared list view across every tracker and rich content type.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEntitiesLoading ? <p className="text-sm text-zinc-500">Loading entities...</p> : null}
        {!isEntitiesLoading && entitiesError ? (
          <div className="space-y-3 rounded-lg border border-red-500/25 bg-red-500/5 px-4 py-4 text-sm text-red-300">
            <p>{entitiesError}</p>
            <button className="text-zinc-100 underline" onClick={() => void refreshEntities()} type="button">
              Retry
            </button>
          </div>
        ) : null}
        {!isEntitiesLoading && !entitiesError
          ? entities.map((entity) => (
              <Link
                key={entity.id}
                to={`/entities/${entity.id}`}
                className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 transition-colors hover:border-blue-500/40"
              >
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-100">{entity.title ?? "Untitled entity"}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{entity.type ?? "unknown"}</Badge>
                    <Badge>{entity.content_type ?? "unset"}</Badge>
                  </div>
                  <p className="text-sm text-zinc-500">{getEntityContentPreview(entity)}</p>
                </div>
                <span className="font-mono text-xs text-zinc-500">{formatEntityDate(entity.created_at)}</span>
              </Link>
            ))
          : null}
      </CardContent>
    </Card>
  )
}
