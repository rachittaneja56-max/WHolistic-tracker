import { useCallback, useEffect, useState } from "react"

import { getEntities, type Entity } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load entities."
}

export function useEntities() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [isEntitiesLoading, setIsEntitiesLoading] = useState(true)
  const [entitiesError, setEntitiesError] = useState<string | null>(null)

  const refreshEntities = useCallback(async () => {
    setIsEntitiesLoading(true)
    setEntitiesError(null)

    try {
      const results = await getEntities()
      setEntities(results)
    } catch (error) {
      setEntitiesError(getErrorMessage(error))
    } finally {
      setIsEntitiesLoading(false)
    }
  }, [])

  const addEntityToList = useCallback((entity: Entity) => {
    setEntities((currentEntities) => [entity, ...currentEntities.filter((currentEntity) => currentEntity.id !== entity.id)])
  }, [])

  const upsertEntityInList = useCallback((entity: Entity) => {
    setEntities((currentEntities) => {
      const remaining = currentEntities.filter((currentEntity) => currentEntity.id !== entity.id)
      return [entity, ...remaining]
    })
  }, [])

  useEffect(() => {
    void refreshEntities()
  }, [refreshEntities])

  return {
    entities,
    isEntitiesLoading,
    entitiesError,
    refreshEntities,
    addEntityToList,
    upsertEntityInList,
  }
}
