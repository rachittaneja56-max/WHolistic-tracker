import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { usePreferences } from "@/features/preferences/preferences-context"
import { useTheme, type ThemePreference } from "@/features/theme/theme-provider"

const order: ThemePreference[] = ["system", "light", "dark"]
const labels = { system: "System theme", light: "Light theme", dark: "Dark theme" }

export function ThemeToggle({ syncPreference = false }: { syncPreference?: boolean }) {
  const { theme, setTheme } = useTheme()
  const { updatePreferences } = usePreferences()
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor
  function cycle() {
    const next = order[(order.indexOf(theme) + 1) % order.length]
    setTheme(next)
    if (syncPreference) void updatePreferences({ theme: next }).catch(() => undefined)
  }
  return <Button type="button" variant="ghost" size="sm" onClick={cycle} aria-label={`${labels[theme]}. Change theme`} title={labels[theme]}><Icon className="h-4 w-4" /></Button>
}
