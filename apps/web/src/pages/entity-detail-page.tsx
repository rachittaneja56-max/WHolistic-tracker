import { useEffect, useState } from "react"
import { Link, useOutletContext, useParams } from "react-router-dom"

import { getEntity, type Entity } from "@/lib/api"
import type { LayoutContext } from "@/App"
import { EntityDetailCard } from "@/components/entities/entity-detail-card"
import { Button } from "@/components/ui/button"

export function EntityDetailPage() {
  const params = useParams()
  const entityId = params.entityId
  const { upsertEntityInList } = useOutletContext<LayoutContext>()
  const [entity, setEntity] = useState<Entity | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) {
      setError("No entity id provided.")
      setIsLoading(false)
      return
    }

    const currentEntityId = entityId
    let isMounted = true

    async function loadEntity() {
      setIsLoading(true)
      setError(null)

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
        setError(loadError instanceof Error ? loadError.message : "Unable to load entity.")
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
    return <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-500">Loading entity...</div>
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-sm text-red-300">{error}</p>
        <Button asChild variant="outline">
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
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
