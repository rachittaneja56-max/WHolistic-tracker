import type { ContentType, Entity, EntityType } from "@/lib/api"

const PREVIEW_LENGTH = 120
const CANVAS_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "theme",
  "gridModeEnabled",
  "objectsSnapModeEnabled",
  "zenModeEnabled",
  "zoom",
  "scrollX",
  "scrollY",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemRoundness",
  "currentItemArrowType",
] as const

export type CanvasDocument = {
  elements: unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

export function getDefaultContentTypeForEntityType(type: EntityType | "" | null | undefined): ContentType | null {
  if (type === "note") {
    return "blocks"
  }
  if (type === "canvas") {
    return "canvas_json"
  }
  return null
}

export function getEntityContentPreview(entity: Entity): string {
  if (entity.type === "note" || entity.content_type === "blocks") {
    return "Block note"
  }
  if (entity.type === "canvas" || entity.content_type === "canvas_json") {
    return "Canvas"
  }

  const cleaned = collapseWhitespace(entity.content ?? "")
  if (!cleaned) {
    return "No content yet"
  }
  if (cleaned.length <= PREVIEW_LENGTH) {
    return cleaned
  }
  return `${cleaned.slice(0, PREVIEW_LENGTH - 3).trimEnd()}...`
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function parseBlockNoteContent(value: string | null | undefined): { blocks: unknown[] | undefined; invalid: boolean } {
  const rawValue = (value ?? "").trim()
  if (!rawValue) {
    return { blocks: undefined, invalid: false }
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) {
      return { blocks: parsed, invalid: false }
    }
    return { blocks: undefined, invalid: true }
  } catch {
    return { blocks: plainTextToBlocks(rawValue), invalid: false }
  }
}

export function serializeBlockNoteContent(blocks: unknown): string {
  return JSON.stringify(Array.isArray(blocks) ? blocks : [])
}

export function convertEntityContent(value: string, from: ContentType | "" | null, to: ContentType): string {
  if (!value.trim() || from === to) {
    return value
  }
  if (to === "canvas_json") {
    return ""
  }

  const plainText = from === "blocks"
    ? blockContentToPlainText(value)
    : from === "canvas_json"
      ? ""
      : value

  if (to === "blocks") {
    return JSON.stringify(plainTextToBlocks(plainText))
  }
  return plainText
}

function plainTextToBlocks(value: string): unknown[] {
  const lines = value.split(/\r?\n/)
  return lines.map((line) => ({
    id: crypto.randomUUID(),
    type: "paragraph",
    props: {
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
    },
    content: line ? [{ type: "text", text: line, styles: {} }] : [],
    children: [],
  }))
}

function blockContentToPlainText(value: string): string {
  const parsed = parseBlockNoteContent(value)
  if (!parsed.blocks) {
    return ""
  }
  return parsed.blocks.map((block) => extractBlockText(block)).filter(Boolean).join("\n")
}

function extractBlockText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(extractBlockText).join("")
  }
  if (!isPlainObject(value)) {
    return ""
  }
  const ownText = typeof value.text === "string" ? value.text : ""
  const contentText = extractBlockText(value.content)
  const childText = extractBlockText(value.children)
  return [ownText || contentText, childText].filter(Boolean).join("\n")
}

export function getDefaultCanvasDocument(): CanvasDocument {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  return {
    elements: [],
    appState: {
      theme: dark ? "dark" : "light",
      viewBackgroundColor: dark ? "#080d18" : "#f8fafc",
      gridModeEnabled: false,
      objectsSnapModeEnabled: false,
      zenModeEnabled: false,
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
    },
    files: {},
  }
}

export function parseCanvasContent(value: string | null | undefined): { document: CanvasDocument; invalid: boolean } {
  const rawValue = (value ?? "").trim()
  if (!rawValue) {
    return { document: getDefaultCanvasDocument(), invalid: false }
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<CanvasDocument>
    return {
      document: {
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        appState: isPlainObject(parsed.appState) ? { ...getDefaultCanvasDocument().appState, ...parsed.appState } : getDefaultCanvasDocument().appState,
        files: isPlainObject(parsed.files) ? parsed.files : {},
      },
      invalid: false,
    }
  } catch {
    return { document: getDefaultCanvasDocument(), invalid: true }
  }
}

export function serializeCanvasContent(elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>): string {
  const sanitizedAppState = CANVAS_APP_STATE_KEYS.reduce<Record<string, unknown>>((result, key) => {
    const value = appState[key]
    if (value !== undefined) {
      result[key] = value
    }
    return result
  }, {})

  return JSON.stringify({
    elements: Array.isArray(elements) ? [...elements] : [],
    appState: {
      ...getDefaultCanvasDocument().appState,
      ...sanitizedAppState,
    },
    files: isPlainObject(files) ? files : {},
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
