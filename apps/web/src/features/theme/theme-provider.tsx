import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type ThemePreference = "system" | "light" | "dark"

type ThemeContextValue = {
  theme: ThemePreference
  resolvedTheme: "light" | "dark"
  setTheme: (theme: ThemePreference) => void
}

const storageKey = "pdkg:theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" as const : "light" as const
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.dataset.theme = theme
  root.style.colorScheme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === "dark" ? "#080d18" : "#f8fafc"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const stored = window.localStorage.getItem(storageKey)
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system"
  })
  const [system, setSystem] = useState(systemTheme)
  const resolvedTheme = theme === "system" ? system : theme

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const update = () => setSystem(media.matches ? "dark" : "light")
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  useEffect(() => applyTheme(resolvedTheme), [resolvedTheme])

  function setTheme(next: ThemePreference) {
    window.localStorage.setItem(storageKey, next)
    setThemeState(next)
  }

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside ThemeProvider")
  return context
}
