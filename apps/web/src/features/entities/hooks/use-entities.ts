import { useCallback, useEffect, useState } from "react"

import { getEntities, type Entity } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load entities."
}

export function useEntities(enabled = true) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [isEntitiesLoading, setIsEntitiesLoading] = useState(enabled)
  const [entitiesError, setEntitiesError] = useState<string | null>(null)

  const refreshEntities = useCallback(async () => {
    setIsEntitiesLoading(true)
    setEntitiesError(null)
    try {
      const results = await getEntities({ limit: 100 })
      setEntities(results)
    } catch (error) {
      setEntitiesError(getErrorMessage(error))
    } finally {
      setIsEntitiesLoading(false)
    }
  }, [])

  const addEntityToList = useCallback((entity: Entity) => setEntities((current) => [entity, ...current.filter((item) => item.id !== entity.id)]), [])
  const upsertEntityInList = useCallback((entity: Entity) => setEntities((current) => [entity, ...current.filter((item) => item.id !== entity.id)]), [])

  useEffect(() => {
    if (enabled) void refreshEntities()
    else setIsEntitiesLoading(false)
  }, [enabled, refreshEntities])

  return { entities, isEntitiesLoading, entitiesError, refreshEntities, addEntityToList, upsertEntityInList }
}
