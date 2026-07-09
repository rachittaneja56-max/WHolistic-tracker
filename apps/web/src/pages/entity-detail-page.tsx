import { useEffect, useState } from "react"
import { Link, useOutletContext, useParams } from "react-router-dom"

import { getEntity, type Entity } from "@/lib/api"
import { EntityDetailCard } from "@/features/entities/components/entity-detail-card"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function getLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load entity."
}

export function EntityDetailPage() {
  const params = useParams()
  const entityId = params.entityId
  const { upsertEntityInList } = useOutletContext<EntitiesLayoutContext>()
  const [entity, setEntity] = useState<Entity | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-zinc-100">Loading entity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Fetching the entity detail from the Phase 0 API...</p>
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
      <EntityDetailCard entity={entity} />
    </div>
  )
}
