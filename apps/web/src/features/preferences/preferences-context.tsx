import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { useAuth } from "@/features/auth/auth-context"
import { useTheme } from "@/features/theme/theme-provider"
import { getPreferences, patchPreferences, type WorkspacePreferences } from "@/lib/api"

type PreferencesContextValue = {
  preferences: WorkspacePreferences
  loading: boolean
  updatePreferences: (patch: Partial<WorkspacePreferences>) => Promise<WorkspacePreferences>
}

const defaults: WorkspacePreferences = { theme: "system", onboarding_completed: false, learning_focuses: [] }
const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { setTheme } = useTheme()
  const [preferences, setPreferences] = useState(defaults)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      setPreferences(defaults)
      return
    }
    let cancelled = false
    setLoading(true)
    void getPreferences()
      .then((next) => {
        if (cancelled) return
        setPreferences(next)
        setTheme(next.theme)
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [setTheme, user])

  const updatePreferences = useCallback(async (patch: Partial<WorkspacePreferences>) => {
    const next = await patchPreferences(patch)
    setPreferences(next)
    setTheme(next.theme)
    return next
  }, [setTheme])

  const value = useMemo(() => ({ preferences, loading, updatePreferences }), [loading, preferences, updatePreferences])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider")
  return context
}
