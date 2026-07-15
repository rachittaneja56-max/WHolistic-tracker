import { describe, expect, it } from "vitest"

import { confirmsAccountDeletion } from "@/features/settings/privacy"

describe("account deletion confirmation", () => {
  it("accepts only the signed-in account email", () => {
    expect(confirmsAccountDeletion("learner@example.com", "learner@example.com")).toBe(true)
    expect(confirmsAccountDeletion("other@example.com", "learner@example.com")).toBe(false)
    expect(confirmsAccountDeletion("", "learner@example.com")).toBe(false)
  })

  it("matches the backend's case-insensitive email comparison", () => {
    expect(confirmsAccountDeletion(" Learner@Example.com ", "learner@example.com")).toBe(true)
  })
})
