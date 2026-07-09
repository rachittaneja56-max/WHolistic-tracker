import { useEffect, useState } from "react"
import { Link, useOutletContext, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EntityDetailCard } from "@/features/entities/components/entity-detail-card"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { getEntity, getSimilarEntities, refreshEntityEmbedding, type Entity, type SimilarEntity } from "@/lib/api"

function getLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load entity."
}

function formatScore(value: number) {
  return value.toFixed(4)
}

export function EntityDetailPage() {
  const params = useParams()
  const entityId = params.entityId
  const { upsertEntityInList } = useOutletContext<EntitiesLayoutContext>()
  const [entity, setEntity] = useState<Entity | null>(null)
  const [similarEntities, setSimilarEntities] = useState<SimilarEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSimilarLoading, setIsSimilarLoading] = useState(false)
  const [isRefreshingEmbedding, setIsRefreshingEmbedding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [similarError, setSimilarError] = useState<string | null>(null)
  const [embeddingActionError, setEmbeddingActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) {
      setEntity(null)
      setError("No entity id provided.")
      setIsLoading(false)
      return
    }

    const currentEntityId = entityId
    let isMounted = true

    async function loadEntity() {
      setIsLoading(true)
      setError(null)
      setEntity(null)

      try {
        const result = await getEntity(currentEntityId)
        if (!isMounted) {
          return
        }
        setEntity(result)
        upsertEntityInList(result)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setError(getLoadErrorMessage(loadError))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadEntity()

    return () => {
      isMounted = false
    }
  }, [entityId, upsertEntityInList])

  useEffect(() => {
    if (!entity?.id) {
      setSimilarEntities([])
      setSimilarError(null)
      setIsSimilarLoading(false)
      return
    }

    if (!entity.has_embedding) {
      setSimilarEntities([])
      setSimilarError("Embedding is missing. Refresh it to view candidate matches.")
      setIsSimilarLoading(false)
      return
    }

    const currentEntityId = entity.id
    let isMounted = true

    async function loadSimilarEntities() {
      setIsSimilarLoading(true)
      setSimilarError(null)

      try {
        const results = await getSimilarEntities(currentEntityId)
        if (!isMounted) {
          return
        }
        setSimilarEntities(results)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setSimilarEntities([])
        setSimilarError(getLoadErrorMessage(loadError))
      } finally {
        if (isMounted) {
          setIsSimilarLoading(false)
        }
      }
    }

    void loadSimilarEntities()

    return () => {
      isMounted = false
    }
  }, [entity])

  async function handleRefreshEmbedding() {
    if (!entityId) {
      return
    }

    setIsRefreshingEmbedding(true)
    setEmbeddingActionError(null)

    try {
      const refreshedEntity = await refreshEntityEmbedding(entityId)
      setEntity(refreshedEntity)
      upsertEntityInList(refreshedEntity)
    } catch (refreshError) {
      setEmbeddingActionError(getLoadErrorMessage(refreshError))
    } finally {
      setIsRefreshingEmbedding(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-zinc-100">Loading entity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Fetching the entity detail from the API...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-zinc-100">Unable to load entity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-300">{error}</p>
          <Button asChild variant="outline">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!entity) {
    return null
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="outline">
        <Link to="/">Back to capture</Link>
      </Button>

      <EntityDetailCard
        entity={entity}
        isRefreshingEmbedding={isRefreshingEmbedding}
        embeddingActionError={embeddingActionError}
        onRefreshEmbedding={() => void handleRefreshEmbedding()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-zinc-100">Similar entities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isSimilarLoading ? <p className="text-sm text-zinc-500">Finding nearby entities...</p> : null}
          {!isSimilarLoading && similarError ? <p className="text-sm text-zinc-500">{similarError}</p> : null}
          {!isSimilarLoading && !similarError && similarEntities.length === 0 ? (
            <p className="text-sm text-zinc-500">No similar entities were found yet.</p>
          ) : null}

          {!isSimilarLoading && !similarError
            ? similarEntities.map((result) => (
                <Link
                  key={result.entity.id}
                  to={`/entities/${result.entity.id}`}
                  className="block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 transition-colors hover:border-blue-500/40"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="blue">{result.entity.type ?? "unknown"}</Badge>
                        {result.entity.tags.map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </div>
                      <p className="text-sm font-medium text-zinc-100">{result.entity.title ?? "Untitled entity"}</p>
                    </div>

                    <div className="space-y-1 text-right font-mono text-xs text-zinc-500">
                      <p>similarity {formatScore(result.similarity)}</p>
                      <p>distance {formatScore(result.distance)}</p>
                    </div>
                  </div>
                </Link>
              ))
            : null}
        </CardContent>
      </Card>
    </div>
  )
}
