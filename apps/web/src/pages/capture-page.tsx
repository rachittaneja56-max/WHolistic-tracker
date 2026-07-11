import { useMemo } from "react"
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom"

import type { Entity, EntityType, ContentType } from "@/lib/api"
import { CaptureEntityForm } from "@/features/entities/components/capture-entity-form"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"

export function CapturePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { entities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()

  const prefill = useMemo(
    () => ({
      title: searchParams.get("title") ?? "",
      content: searchParams.get("content") ?? "",
      type: (searchParams.get("type") as EntityType | null) ?? null,
      contentType: (searchParams.get("content_type") as ContentType | null) ?? null,
      parentId: searchParams.get("parent_id") ?? "",
    }),
    [searchParams],
  )

  function handleCreated(entity: Entity) {
    addEntityToList(entity)
    navigate(`/entities/${entity.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <CaptureEntityForm
        key={`${prefill.title}-${prefill.content}-${prefill.type ?? ""}-${prefill.contentType ?? ""}-${prefill.parentId}`}
        availableEntities={entities}
        onCreated={handleCreated}
        initialTitle={prefill.title}
        initialContent={prefill.content}
        initialType={prefill.type ?? undefined}
        initialContentType={prefill.contentType ?? undefined}
        initialParentId={prefill.parentId}
      />
    </div>
  )
}
