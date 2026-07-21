import { describe, expect, it } from "vitest"

import { hasCaptureDraftContent } from "@/features/capture/capture-draft"

describe("capture drafts", () => {
  it("only persists a capture when it contains user-entered content", () => {
    expect(hasCaptureDraftContent({ title: "", content: "   " })).toBe(false)
    expect(hasCaptureDraftContent({ title: "Assignment", content: "" })).toBe(true)
    expect(hasCaptureDraftContent({ title: "", content: "Notes" })).toBe(true)
  })
})
