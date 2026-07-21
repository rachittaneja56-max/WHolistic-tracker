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
  const aiLabel = aiStatus === undefined ? "Checking AI" : aiStatus?.ai?.provider_ready ? "AI ready" : aiStatus?.ai?.enabled ? "AI unavailable" : "AI off"
  return <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-border/60 bg-background/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:gap-4 sm:px-6 md:px-8">
    <div className="flex min-w-0 items-center gap-1 sm:gap-3">
      <Button ref={mobileTriggerRef} variant="ghost" size="sm" className="shrink-0 px-3 md:hidden" onClick={onOpenMobile} aria-label="Open all navigation"><Menu className="h-5 w-5" /></Button>
      <div className="min-w-0"><p className="hidden text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:block">{meta.group}</p><p className="truncate text-base font-semibold tracking-[-0.02em] text-foreground sm:text-lg">{meta.title}</p></div>
    </div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <span className="sr-only" role="status">{aiLabel}</span>
      <ThemeToggle syncPreference />
      <Button asChild size="sm" variant="ghost" className="hidden px-3 sm:inline-flex"><Link to={assistantTarget} title="Open AI Coach (Ctrl/Cmd + J)"><Bot className="mr-2 h-4 w-4" />AI Coach <kbd className="ml-2 hidden rounded border border-border bg-surface px-1.5 font-mono text-[9px] font-normal text-muted-foreground lg:inline">Ctrl/Cmd J</kbd></Link></Button>
      <Button asChild size="sm" className="hidden px-3 sm:inline-flex"><Link to="/capture"><Plus className="mr-2 h-4 w-4" />Capture</Link></Button>
    </div>
  </header>
}
