import { createAuthClient } from "better-auth/react"
import { adminClient, jwtClient } from "better-auth/client/plugins"

const authBaseUrl = (import.meta.env.VITE_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "")

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  fetchOptions: { credentials: "include" },
  plugins: [jwtClient(), adminClient()],
})

let accessToken: string | null = null
let accessTokenExpiresAt = 0
let tokenRequest: Promise<string> | null = null

function tokenExpiration(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number }
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

export async function getAuthConfig(): Promise<{ githubEnabled: boolean }> {
  const response = await fetch(`${authBaseUrl}/api/auth/config`, { credentials: "include" })
  if (!response.ok) return { githubEnabled: false }
  return response.json() as Promise<{ githubEnabled: boolean }>
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

export async function acceptPasswordReset(token: string, password: string) {
  const response = await fetch(`${authBaseUrl}/api/password-resets/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) })
  const payload = (await response.json().catch(() => null)) as { detail?: string } | null
  if (!response.ok) throw new Error(payload?.detail ?? "Unable to reset password")
}
