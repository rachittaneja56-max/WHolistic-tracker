import { describe, expect, it } from "vitest"

import {
  combineSharedContent,
  deriveCaptureTitle,
  isValidQuickTaskParent,
  normalizeCapturePrefill,
  parseCaptureTags,
} from "@/features/capture/capture-prefill"

describe("capture prefill", () => {
  it("keeps explicit content ahead of shared text and URL", () => {
    const result = normalizeCapturePrefill(new URLSearchParams({
      content: "Explicit content",
      text: "Shared text",
      url: "https://example.com",
    }))
    expect(result.content).toBe("Explicit content")
  })

  it("combines shared text and URL without duplicating an existing URL", () => {
    expect(combineSharedContent("Read this", "https://example.com")).toBe("Read this\nhttps://example.com")
    expect(combineSharedContent("Read https://example.com", "https://example.com")).toBe("Read https://example.com")
  })

  it("falls back to a quick note for missing or invalid types", () => {
    const missing = normalizeCapturePrefill(new URLSearchParams())
    const invalid = normalizeCapturePrefill(new URLSearchParams({ type: "unsupported" }))
    expect(missing).toMatchObject({ type: "note", mode: "quick", contentType: "markdown" })
    expect(invalid).toMatchObject({ type: "note", mode: "quick", contentType: "markdown" })
  })

  it("preserves the supported capture parameters", () => {
    const result = normalizeCapturePrefill(new URLSearchParams({
      title: "Shared title",
      content: "Shared content",
      type: "idea",
      parent_id: "parent-123",
      tags: "shared, mobile",
      academic_kind: "exam",
    }))
    expect(result).toMatchObject({
      title: "Shared title",
      content: "Shared content",
      type: "idea",
      parentId: "parent-123",
      tags: "shared, mobile",
      academicKind: "exam",
    })
  })

  it("drops unsupported academic kinds before they reach the API", () => {
    const result = normalizeCapturePrefill(new URLSearchParams({ academic_kind: "surprise-test" }))
    expect(result.academicKind).toBeNull()
  })

  it("opens advanced mode for valid entity types outside quick capture", () => {
    const result = normalizeCapturePrefill(new URLSearchParams({ type: "subject_topic" }))
    expect(result).toMatchObject({ type: "subject_topic", mode: "advanced", contentType: "markdown" })
  })

  it("derives a compact title from the first non-empty line", () => {
    expect(deriveCaptureTitle("\n   A   useful   thought   \nMore detail")).toBe("A useful thought")
    expect(deriveCaptureTitle("x".repeat(140))).toHaveLength(120)
  })

  it("normalizes and deduplicates comma-separated tags", () => {
    expect(parseCaptureTags(" react, mobile, react, , pwa ")).toEqual(["react", "mobile", "pwa"])
  })

  it("accepts only supported task parent entity types", () => {
    const entities = [
      { id: "project", type: "project" as const },
      { id: "milestone", type: "milestone" as const },
      { id: "subject", type: "subject_topic" as const },
      { id: "note", type: "note" as const },
    ]
    expect(isValidQuickTaskParent("project", entities)).toBe(true)
    expect(isValidQuickTaskParent("milestone", entities)).toBe(true)
    expect(isValidQuickTaskParent("subject", entities)).toBe(true)
    expect(isValidQuickTaskParent("note", entities)).toBe(false)
    expect(isValidQuickTaskParent("missing", entities)).toBe(false)
  })
})
