import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { getAuthSession, login as loginRequest, logout as logoutRequest, type AuthSession } from "@/lib/system-api"

type AuthContextValue = {
  session: AuthSession | null
  loading: boolean
  error: string | null
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSession(await getAuthSession())
      setError(null)
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to check session.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (password: string) => {
    setSession(await loginRequest(password))
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    setSession(await logoutRequest())
  }, [])

  const value = useMemo(() => ({ session, loading, error, login, logout }), [session, loading, error, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
