import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { useAuth } from "@/features/auth/auth-context"
import { useTheme } from "@/features/theme/theme-provider"
import { getPreferences, patchPreferences, type WorkspacePreferences } from "@/lib/api"

type PreferencesContextValue = {
  preferences: WorkspacePreferences
  loading: boolean
  updatePreferences: (patch: Partial<WorkspacePreferences>) => Promise<WorkspacePreferences>
}

const defaults: WorkspacePreferences = { theme: "system", onboarding_completed: false, learning_focuses: [], hidden_modules: [], typical_study_minutes: 90, preferred_focus_minutes: 45, max_daily_workload_minutes: 240, active_semester: null, library_saved_views: [], library_pinned_entity_ids: [] }
const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function normalizePreferences(value: Partial<WorkspacePreferences> | null | undefined): WorkspacePreferences {
  return {
    ...defaults,
    ...value,
    theme: value?.theme === "light" || value?.theme === "dark" || value?.theme === "system" ? value.theme : defaults.theme,
    learning_focuses: Array.isArray(value?.learning_focuses) ? value.learning_focuses : defaults.learning_focuses,
    hidden_modules: Array.isArray(value?.hidden_modules) ? value.hidden_modules : defaults.hidden_modules,
    library_saved_views: Array.isArray(value?.library_saved_views) ? value.library_saved_views : defaults.library_saved_views,
    library_pinned_entity_ids: Array.isArray(value?.library_pinned_entity_ids) ? value.library_pinned_entity_ids : defaults.library_pinned_entity_ids,
  }
}


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
