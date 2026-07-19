import { describe, expect, it } from "vitest"

import { taskActionMetadata } from "@/features/agenda/quick-actions"

describe("agenda task quick actions", () => {
  const now = new Date("2026-07-19T12:00:00.000Z")

  it("maps complete, snooze, reschedule, and block onto existing task metadata", () => {
    expect(taskActionMetadata("complete", now)).toEqual({ status: "done", completed_at: now.toISOString() })
    expect(taskActionMetadata("mark_blocked", now)).toEqual({ status: "blocked" })
    expect(taskActionMetadata("snooze", now)).toEqual({ status: "ready", due_at: "2026-07-20" })
    expect(taskActionMetadata("reschedule", now, "2026-07-25")).toEqual({ status: "ready", due_at: "2026-07-25" })
  })

  it("rejects invalid reschedule dates before a mutation is sent", () => {
    expect(() => taskActionMetadata("reschedule", now, "tomorrow")).toThrow("valid reschedule date")
  })
})
