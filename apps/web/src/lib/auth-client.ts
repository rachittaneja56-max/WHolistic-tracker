import { createAuthClient } from "better-auth/react"
import { adminClient, jwtClient } from "better-auth/client/plugins"

const authBaseUrl = (import.meta.env.VITE_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  fetchOptions: { credentials: "include" },
  plugins: [jwtClient(), adminClient()],
})

export type AuthConfig = {
  githubEnabled: boolean
  passwordMinLength: number
  emailVerificationRequired: boolean
  passwordResetEnabled: boolean
  turnstileEnabled: boolean
  turnstileSiteKey?: string
}

export type PasswordResetSource = "self-service" | "admin"

const defaultConfig: AuthConfig = {
  githubEnabled: false,
  passwordMinLength: 12,
  emailVerificationRequired: false,
  passwordResetEnabled: false,
  turnstileEnabled: false,
}

let configPromise: Promise<AuthConfig> | null = null
let accessToken: string | null = null
let accessTokenExpiresAt = 0
let tokenRequest: Promise<string> | null = null

function captchaFetchOptions(token?: string) {
  return token ? { headers: { "x-captcha-response": token } } : undefined
}

export function addPasswordResetSource(url: string, source: PasswordResetSource): string {
  const value = new URL(url)
  value.searchParams.set("source", source)
  return value.toString()
}

export function getSelfServicePasswordResetRedirect(origin: string): string {
  return addPasswordResetSource(new URL("/reset-password", origin).toString(), "self-service")
}

export function resolvePasswordResetSource(value: string | null): PasswordResetSource | null {
  if (value === "self-service" || value === "admin") return value
  return value === null ? "admin" : null
}

function tokenExpiration(token: string) {
  try {
    const encodedPayload = token.split(".")[1]
    if (!encodedPayload) return 0
    const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/")
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=")
    const payload = JSON.parse(atob(paddedPayload)) as { exp?: number }
    return (payload.exp ?? 0) * 1000
  } catch {
    return 0
  }
}

export function clearAccessToken() {
  accessToken = null
  accessTokenExpiresAt = 0
  tokenRequest = null
}

export async function getAccessToken(force = false): Promise<string> {
  if (!force && accessToken && accessTokenExpiresAt > Date.now() + 30_000) return accessToken
  if (tokenRequest) return tokenRequest
  tokenRequest = (async () => {
    const { data, error } = await authClient.token()
    if (error || !data?.token) throw new Error(error?.message ?? "Unable to create an API access token")
    accessToken = data.token
    accessTokenExpiresAt = tokenExpiration(data.token)
    return data.token
  })()
  try {
    return await tokenRequest
  } finally {
    tokenRequest = null
  }
}

export async function authenticatedFetch(url: string, init?: RequestInit): Promise<Response> {
  const send = async (force: boolean) => {
    const token = await getAccessToken(force)
    return fetch(url, {
      ...init,
      credentials: "omit",
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    })
  }
  let response = await send(false)
  if (response.status === 401) {
    clearAccessToken()
    try {
      response = await send(true)
    } catch {
      window.dispatchEvent(new Event("pdkg:auth-expired"))
    }
  }
  if (response.status === 401) window.dispatchEvent(new Event("pdkg:auth-expired"))
  return response
}

export async function getAuthConfig(): Promise<AuthConfig> {
  if (!configPromise) {
    configPromise = fetch(`${authBaseUrl}/api/auth/config`, { credentials: "include" })
      .then(async (response) => response.ok ? { ...defaultConfig, ...(await response.json() as Partial<AuthConfig>) } : defaultConfig)
      .catch(() => defaultConfig)
  }
  return configPromise
}

export async function signUpWithEmail(payload: { email: string; name: string; password: string; callbackURL?: string; captchaToken?: string }) {
  const { captchaToken, ...body } = payload
  const { data, error } = await authClient.signUp.email({ ...body, fetchOptions: captchaFetchOptions(captchaToken) })
  if (error) throw new Error(error.message)
  return data
}

export async function requestPasswordReset(email: string, redirectTo: string, captchaToken?: string) {
  const { data, error } = await authClient.requestPasswordReset({
    email,
    redirectTo,
    fetchOptions: captchaFetchOptions(captchaToken),
  })
  if (error) throw new Error(error.message)
  return data
}

export async function getInvitation(token: string): Promise<{ email: string; role: string; expires_at: string }> {
  const response = await fetch(`${authBaseUrl}/api/invitations/${encodeURIComponent(token)}`)
  const payload = (await response.json().catch(() => null)) as { detail?: string; email?: string; role?: string; expires_at?: string } | null
  if (!response.ok) throw new Error(payload?.detail ?? "Invitation is invalid or expired")
  return payload as { email: string; role: string; expires_at: string }
}

export async function acceptInvitation(payload: { token: string; name: string; password: string }) {
  const response = await fetch(`${authBaseUrl}/api/invitations/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const result = (await response.json().catch(() => null)) as { detail?: string; email?: string } | null
  if (!response.ok) throw new Error(result?.detail ?? "Unable to accept invitation")
  return result as { email: string }
}

export async function getPasswordReset(token: string): Promise<{ email: string; expires_at: string }> {
  const response = await fetch(`${authBaseUrl}/api/password-resets/${encodeURIComponent(token)}`)
  const payload = (await response.json().catch(() => null)) as { detail?: string; email?: string; expires_at?: string } | null
  if (!response.ok) throw new Error(payload?.detail ?? "Password reset link is invalid or expired")
  return payload as { email: string; expires_at: string }
}

export async function acceptPasswordReset(token: string, password: string, source: PasswordResetSource) {
  if (source === "self-service") {
    const { data, error } = await authClient.resetPassword({ token, newPassword: password })
    if (error) throw new Error(error.message)
    return data
  }
  const response = await fetch(`${authBaseUrl}/api/password-resets/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) })
  const payload = (await response.json().catch(() => null)) as { detail?: string } | null
  if (!response.ok) throw new Error(payload?.detail ?? "Unable to reset password")
}
