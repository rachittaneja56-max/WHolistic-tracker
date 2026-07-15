import { describe, expect, it } from "vitest"

import { buildCapturePayload } from "@/features/capture/capture-payload"

const baseInput = {
  flow: "note" as const,
  title: "  Capture contract  ",
  content: "  Useful detail  ",
  tags: "contracts, web, contracts",
  parentId: "parent-123",
  academicKind: "assignment" as const,
  dueAt: "",
  examDate: "",
  difficulty: "unset" as const,
  problemStatus: "unsolved",
  priority: "medium" as const,
  sourceUrl: "",
  aiExclude: false,
}

describe("capture payload", () => {
  it("preserves an academic task parent and writes the tracker due_at contract", () => {
    const payload = buildCapturePayload({
      ...baseInput,
      flow: "assignment",
      academicKind: "exam",
      dueAt: "2026-08-15",
    })

    expect(payload).toMatchObject({
      type: "task",
      parent_id: "parent-123",
      metadata: {
        academic_kind: "exam",
        due_at: "2026-08-15",
        priority: "medium",
        status: "todo",
      },
    })
    expect(payload.metadata).not.toHaveProperty("due_date")
  })

  it("preserves a subject-topic parent", () => {
    const payload = buildCapturePayload({ ...baseInput, flow: "subject" })
    expect(payload).toMatchObject({ type: "subject_topic", parent_id: "parent-123" })
  })

  it("does not attach a hierarchical parent to top-level capture flows", () => {
    const payload = buildCapturePayload(baseInput)
    expect(payload).toMatchObject({
      title: "Capture contract",
      content: "Useful detail",
      tags: ["contracts", "web"],
      parent_id: null,
    })
  })
})
