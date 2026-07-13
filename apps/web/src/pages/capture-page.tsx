import { useMemo } from "react"
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom"

import type { Entity, EntityType, ContentType } from "@/lib/api"
import { academicKindOptions, CaptureEntityForm, type AcademicKind } from "@/features/entities/components/capture-entity-form"
import { getDefaultContentTypeForEntityType } from "@/features/entities/content"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"

export function CapturePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { entities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()

  const prefill = useMemo(() => {
    const type = (searchParams.get("type") as EntityType | null) ?? null
    const requestedAcademicKind = searchParams.get("academic_kind") as AcademicKind | null
    return {
      title: searchParams.get("title") ?? "",
      content: searchParams.get("content") ?? "",
      type,
      contentType: (searchParams.get("content_type") as ContentType | null)
        ?? (type ? getDefaultContentTypeForEntityType(type) ?? "markdown" : null),
      parentId: searchParams.get("parent_id") ?? "",
      academicKind: requestedAcademicKind && academicKindOptions.includes(requestedAcademicKind)
        ? requestedAcademicKind
        : null,
    }
  }, [searchParams])

  function handleCreated(entity: Entity) {
    addEntityToList(entity)
    navigate(`/entities/${entity.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <CaptureEntityForm
        key={`${prefill.title}-${prefill.content}-${prefill.type ?? ""}-${prefill.contentType ?? ""}-${prefill.parentId}-${prefill.academicKind ?? ""}`}
        availableEntities={entities}
        onCreated={handleCreated}
        initialTitle={prefill.title}
        initialContent={prefill.content}
        initialType={prefill.type ?? undefined}
        initialContentType={prefill.contentType ?? undefined}
        initialParentId={prefill.parentId}
        initialAcademicKind={prefill.academicKind ?? undefined}
      />
    </div>
  )
}
