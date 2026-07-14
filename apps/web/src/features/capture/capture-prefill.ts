import { contentTypeOptions, entityTypeOptions, type ContentType, type EntityType } from "@/lib/api"
import { getDefaultContentTypeForEntityType } from "@/features/entities/content"

export const quickCaptureTypes = ["note", "idea", "til", "task"] as const satisfies readonly EntityType[]
export type QuickCaptureType = (typeof quickCaptureTypes)[number]

export type CapturePrefill = {
  mode: "quick" | "advanced"
  title: string
  content: string
  type: EntityType
  contentType: ContentType
  parentId: string
  tags: string
  academicKind: string | null
}

export function isQuickCaptureType(value: EntityType): value is QuickCaptureType {
  return (quickCaptureTypes as readonly EntityType[]).includes(value)
}

function validEntityType(value: string | null): EntityType | null {
  return value && (entityTypeOptions as readonly string[]).includes(value) ? value as EntityType : null
}

function validContentType(value: string | null): ContentType | null {
  return value && (contentTypeOptions as readonly string[]).includes(value) ? value as ContentType : null
}

export function combineSharedContent(text: string, url: string) {
  const cleanText = text.trim()
  const cleanUrl = url.trim()
  if (!cleanText) return cleanUrl
  if (!cleanUrl || cleanText.includes(cleanUrl)) return cleanText
  return `${cleanText}\n${cleanUrl}`
}

export function deriveCaptureTitle(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find(Boolean)
  return (firstLine ?? "").slice(0, 120)
}

export function parseCaptureTags(value: string) {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean)))
}

export function isValidQuickTaskParent(parentId: string, entities: Array<{ id: string; type: EntityType | null }>) {
  return entities.some((entity) => entity.id === parentId && (entity.type === "project" || entity.type === "milestone" || entity.type === "subject_topic"))
}

export function normalizeCapturePrefill(params: URLSearchParams): CapturePrefill {
  const requestedType = validEntityType(params.get("type"))
  const type = requestedType ?? "note"
  const requestedMode = params.get("mode")
  const mode = requestedMode === "advanced" || !isQuickCaptureType(type) ? "advanced" : "quick"
  const explicitContent = params.get("content")
  const content = explicitContent !== null
    ? explicitContent
    : combineSharedContent(params.get("text") ?? "", params.get("url") ?? "")
  const requestedContentType = validContentType(params.get("content_type"))
  const contentType = requestedContentType
    ?? (mode === "quick" ? "markdown" : getDefaultContentTypeForEntityType(type) ?? "markdown")

  return {
    mode,
    title: params.get("title") ?? "",
    content,
    type,
    contentType,
    parentId: params.get("parent_id") ?? "",
    tags: params.get("tags") ?? "",
    academicKind: params.get("academic_kind"),
  }
}
