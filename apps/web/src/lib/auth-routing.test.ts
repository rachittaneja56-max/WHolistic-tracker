import { describe, expect, it } from "vitest"

import { buildLoginUrl, buildSignupUrl, getSafeReturnTo } from "@/lib/auth-routing"

describe("capture login return flow", () => {
  it("preserves every capture query parameter through login", () => {
    const search = "?title=Shared&content=Body&text=Text&url=https%3A%2F%2Fexample.com&type=idea&parent_id=parent-1&tags=pwa%2Cmobile"
    const loginUrl = buildLoginUrl("/capture", search)
    const encodedReturnTo = new URL(loginUrl, "http://personal-dev-kg.local").searchParams.get("returnTo")

    expect(encodedReturnTo).toBe(`/capture${search}`)
    expect(getSafeReturnTo(encodedReturnTo)).toBe(`/capture${search}`)
  })

  it("still rejects external return destinations", () => {
    expect(getSafeReturnTo("//example.com/capture")).toBe("/app")
  })

  it("keeps public auth pages out of protected return destinations", () => {
    const loginUrl = buildLoginUrl("/capture")
    const signupUrl = buildSignupUrl("/capture")

    expect(getSafeReturnTo(new URL(loginUrl, "http://personal-dev-kg.local").searchParams.get("returnTo"))).toBe("/capture")
    expect(getSafeReturnTo(new URL(signupUrl, "http://personal-dev-kg.local").searchParams.get("returnTo"))).toBe("/capture")
    expect(getSafeReturnTo("/signup?returnTo=%2Fcapture")).toBe("/app")
  })
})
