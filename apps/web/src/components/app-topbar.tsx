import type { RefObject } from "react"
import { Link, useLocation } from "react-router-dom"
import { Bot, Menu, Plus } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { routeMeta } from "@/lib/navigation"
import type { SettingsStatus } from "@/lib/system-api"

export function AppTopbar({ onOpenMobile, mobileTriggerRef, aiStatus }: { onOpenMobile: () => void; mobileTriggerRef?: RefObject<HTMLButtonElement>; aiStatus?: SettingsStatus | null }) {
  const location = useLocation()
  const meta = routeMeta(location.pathname)
  const assistantTarget = location.pathname === "/agents/assistant" ? `${location.pathname}${location.search}` : `/agents/assistant?from=${encodeURIComponent(`${location.pathname}${location.search}`)}`
  const aiLabel = aiStatus === undefined ? "Checking AI" : aiStatus?.ai.provider_ready ? "AI ready" : aiStatus?.ai.enabled ? "AI unavailable" : "AI off"
  return <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-border bg-surface/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:gap-4 sm:px-4 md:px-6">
    <div className="flex min-w-0 items-center gap-1 sm:gap-3">
      <Button ref={mobileTriggerRef} variant="ghost" size="sm" className="shrink-0 px-3 md:hidden" onClick={onOpenMobile} aria-label="Open all navigation"><Menu className="h-5 w-5" /></Button>
      <div className="min-w-0"><p className="hidden font-mono text-xs text-muted-foreground sm:block">{meta.group}</p><h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{meta.title}</h1></div>
    </div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <span className="sr-only" role="status">{aiLabel}</span>
      <ThemeToggle syncPreference />
      <Button asChild size="sm" variant="outline" className="hidden px-3 sm:inline-flex"><Link to={assistantTarget} title="Open AI Coach (Ctrl/Cmd + J)"><Bot className="mr-2 h-4 w-4" />AI Coach</Link></Button>
      <Button asChild size="sm" className="hidden px-3 sm:inline-flex"><Link to="/capture"><Plus className="mr-2 h-4 w-4" />Capture</Link></Button>
    </div>
  </header>
}
