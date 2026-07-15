import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    requestPasswordReset: authMocks.requestPasswordReset,
    resetPassword: authMocks.resetPassword,
  }),
}))

vi.mock("better-auth/client/plugins", () => ({
  adminClient: () => ({}),
  jwtClient: () => ({}),
}))

import {
  acceptPasswordReset,
  addPasswordResetSource,
  getSelfServicePasswordResetRedirect,
  requestPasswordReset,
  resolvePasswordResetSource,
} from "@/lib/auth-client"

describe("password recovery client", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("marks self-service callbacks and forwards the Turnstile response", async () => {
    authMocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null })
    const redirectTo = getSelfServicePasswordResetRedirect("https://app.example.com")

    await requestPasswordReset("person@example.com", redirectTo, "captcha-token")

    expect(redirectTo).toBe("https://app.example.com/reset-password?source=self-service")
    expect(authMocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "person@example.com",
      redirectTo,
      fetchOptions: { headers: { "x-captcha-response": "captcha-token" } },
    })
  })

  it("consumes a self-service token through Better Auth", async () => {
    authMocks.resetPassword.mockResolvedValue({ data: { status: true }, error: null })

    await acceptPasswordReset("native-token", "a-secure-password", "self-service")

    expect(authMocks.resetPassword).toHaveBeenCalledWith({ token: "native-token", newPassword: "a-secure-password" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps admin-issued tokens on the custom one-time-token endpoint", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reset: true }) })

    await acceptPasswordReset("admin-token", "a-secure-password", "admin")

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/password-resets/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "admin-token", password: "a-secure-password" }),
    })
    expect(authMocks.resetPassword).not.toHaveBeenCalled()
  })

  it("marks new admin links while retaining legacy unmarked admin links", () => {
    expect(addPasswordResetSource("https://app.example.com/reset-password?token=abc", "admin"))
      .toBe("https://app.example.com/reset-password?token=abc&source=admin")
    expect(resolvePasswordResetSource("self-service")).toBe("self-service")
    expect(resolvePasswordResetSource("admin")).toBe("admin")
    expect(resolvePasswordResetSource(null)).toBe("admin")
    expect(resolvePasswordResetSource("unknown")).toBeNull()
  })
})
