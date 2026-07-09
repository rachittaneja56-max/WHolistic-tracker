import { useNavigate, useOutletContext } from "react-router-dom"

import type { Entity } from "@/lib/api"
import { CaptureEntityForm } from "@/features/entities/components/capture-entity-form"
import { EntityList } from "@/features/entities/components/entity-list"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"

export function DashboardPage() {
  const navigate = useNavigate()
  const { entities, isEntitiesLoading, entitiesError, refreshEntities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()

  function handleCreated(entity: Entity) {
    addEntityToList(entity)
    navigate(`/entities/${entity.id}`)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <CaptureEntityForm onCreated={handleCreated} />
      <EntityList
        entities={entities}
        title="All Captured Entities"
        description="A flat view into the unified substrate before Phase 1 adds tracker-specific lenses."
        isLoading={isEntitiesLoading}
        errorMessage={entitiesError}
        onRetry={() => {
          void refreshEntities()
        }}
      />
    </div>
  )
}
