import { useNavigate, useOutletContext } from "react-router-dom"

import type { Entity } from "@/lib/api"
import { CaptureEntityForm } from "@/features/entities/components/capture-entity-form"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"

export function CapturePage() {
  const navigate = useNavigate()
  const { entities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()

  function handleCreated(entity: Entity) {
    addEntityToList(entity)
    navigate(`/entities/${entity.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <CaptureEntityForm availableEntities={entities} onCreated={handleCreated} />
    </div>
  )
}
