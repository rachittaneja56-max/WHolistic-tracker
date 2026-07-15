import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { authClient, clearAccessToken } from "@/lib/auth-client"

export type AuthUser = {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  error: string | null
  login: (email: string, password: string, captchaToken?: string) => Promise<void>
  signup: (email: string, name: string, password: string, callbackURL?: string, captchaToken?: string) => Promise<void>
  loginWithGithub: (callbackURL?: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function captchaFetchOptions(token?: string) {
  return token ? { headers: { "x-captcha-response": token } } : undefined
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    let timeout: number | undefined
    try {
      const sessionRequest = authClient.getSession()
      const timeoutRequest = new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error("Session validation timed out. Check the authentication service and try again.")), 8000)
      })
      const { data, error: sessionError } = await Promise.race([sessionRequest, timeoutRequest])
      if (sessionError) setError(sessionError.message ?? "Unable to validate the session")
      else setError(null)
      setUser(data?.user ? ({ ...data.user, role: (data.user as typeof data.user & { role?: string }).role ?? "user" } as AuthUser) : null)
    } catch (sessionError) {
      setUser(null)
      setError(sessionError instanceof Error ? sessionError.message : "Unable to validate the session")
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const expired = () => { clearAccessToken(); void refresh() }
    window.addEventListener("pdkg:auth-expired", expired)
    return () => window.removeEventListener("pdkg:auth-expired", expired)
  }, [refresh])

  const login = useCallback(async (email: string, password: string, captchaToken?: string) => {
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
      fetchOptions: captchaFetchOptions(captchaToken),
    })
    if (signInError) throw new Error(signInError.message)
    clearAccessToken()
    await refresh()
  }, [refresh])

  const signup = useCallback(async (email: string, name: string, password: string, callbackURL?: string, captchaToken?: string) => {
    const { error: signUpError } = await authClient.signUp.email({
      email,
      name,
      password,
      callbackURL,
      fetchOptions: captchaFetchOptions(captchaToken),
    })
    if (signUpError) throw new Error(signUpError.message)
    clearAccessToken()
    await refresh()
  }, [refresh])

  const loginWithGithub = useCallback(async (callbackURL?: string) => {
    const { error: signInError } = await authClient.signIn.social({ provider: "github", callbackURL: callbackURL ?? `${window.location.origin}/app` })
    if (signInError) throw new Error(signInError.message)
  }, [])

  const logout = useCallback(async () => {
    await authClient.signOut()
    clearAccessToken()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, error, login, signup, loginWithGithub, logout, refresh }), [user, loading, error, login, signup, loginWithGithub, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
