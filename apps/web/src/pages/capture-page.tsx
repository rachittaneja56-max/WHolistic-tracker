import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom"
import { SlidersHorizontal, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { normalizeCapturePrefill, isQuickCaptureType } from "@/features/capture/capture-prefill"
import { QuickCaptureForm } from "@/features/capture/quick-capture-form"
import {
  academicKindOptions,
  CaptureEntityForm,
  type AcademicKind,
  type CaptureEntityDraft,
} from "@/features/entities/components/capture-entity-form"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import type { ContentType, Entity } from "@/lib/api"

export function CapturePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const prefill = useMemo(() => normalizeCapturePrefill(new URLSearchParams(searchKey)), [searchKey])
  const { entities, addEntityToList } = useOutletContext<EntitiesLayoutContext>()
  const [mode, setMode] = useState<"quick" | "advanced">(prefill.mode)
  const [draft, setDraft] = useState<CaptureEntityDraft>(() => ({
    title: prefill.title,
    content: prefill.content,
    type: prefill.type,
    contentType: prefill.contentType,
    parentId: prefill.parentId,
    tags: prefill.tags,
  }))

  useEffect(() => {
    setMode(prefill.mode)
    setDraft({
      title: prefill.title,
      content: prefill.content,
      type: prefill.type,
      contentType: prefill.contentType,
      parentId: prefill.parentId,
      tags: prefill.tags,
    })
  }, [prefill])

  const updateDraft = useCallback((nextDraft: CaptureEntityDraft) => {
    setDraft(nextDraft)
  }, [])

  function showQuickCapture() {
    setDraft((current) => ({
      ...current,
      type: current.type && isQuickCaptureType(current.type) ? current.type : "note",
      contentType: "markdown",
    }))
    setMode("quick")
  }

  function handleQuickCreated(entity: Entity) {
    addEntityToList(entity)
  }

  function handleAdvancedCreated(entity: Entity) {
    addEntityToList(entity)
    navigate(`/knowledge/entities/${entity.id}`)
  }

  const requestedAcademicKind = prefill.academicKind as AcademicKind | null
  const initialAcademicKind = requestedAcademicKind && academicKindOptions.includes(requestedAcademicKind)
    ? requestedAcademicKind
    : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-end gap-2" role="group" aria-label="Capture mode">
        <Button type="button" size="sm" variant={mode === "quick" ? "default" : "outline"} aria-pressed={mode === "quick"} onClick={showQuickCapture}>
          <Zap className="mr-2 h-4 w-4" />Quick
        </Button>
        <Button type="button" size="sm" variant={mode === "advanced" ? "default" : "outline"} aria-pressed={mode === "advanced"} onClick={() => setMode("advanced")}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />Advanced
        </Button>
      </div>

      {mode === "quick" ? (
        <QuickCaptureForm draft={draft} availableEntities={entities} onDraftChange={updateDraft} onCreated={handleQuickCreated} />
      ) : (
        <CaptureEntityForm
          key={`advanced-${searchKey}`}
          availableEntities={entities}
          onCreated={handleAdvancedCreated}
          onDraftChange={updateDraft}
          initialTitle={draft.title}
          initialContent={draft.content}
          initialType={draft.type || undefined}
          initialContentType={(draft.contentType || undefined) as ContentType | undefined}
          initialParentId={draft.parentId}
          initialTags={draft.tags}
          initialAcademicKind={initialAcademicKind}
        />
      )}
    </div>
  )
}
