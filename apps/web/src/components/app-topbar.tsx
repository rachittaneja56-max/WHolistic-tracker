import type { RefObject } from "react"
import { Link, useLocation } from "react-router-dom"
import { Bot, Menu, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { routeMeta } from "@/lib/navigation"
import type { SettingsStatus } from "@/lib/system-api"

export function AppTopbar({ onOpenMobile, mobileTriggerRef, aiStatus }: { onOpenMobile: () => void; mobileTriggerRef?: RefObject<HTMLButtonElement>; aiStatus?: SettingsStatus | null }) {
  const location = useLocation()
  const meta = routeMeta(location.pathname)
  const assistantTarget = location.pathname === "/agents/assistant"
    ? `${location.pathname}${location.search}`
    : `/agents/assistant?from=${encodeURIComponent(`${location.pathname}${location.search}`)}`
  const aiLabel = aiStatus === undefined ? "Checking AI..." : aiStatus?.ai.provider_ready ? "AI ready" : aiStatus?.ai.enabled ? "AI unavailable" : "AI off"
  return <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 pt-[env(safe-area-inset-top)] sm:gap-4 sm:px-4 md:px-6">
    <div className="flex min-w-0 items-center gap-1 sm:gap-3">
      <Button ref={mobileTriggerRef} variant="ghost" size="sm" className="shrink-0 px-3 md:hidden" onClick={onOpenMobile} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
      <div className="min-w-0"><p className="hidden font-mono text-xs text-zinc-500 sm:block">{meta.group}</p><h1 className="truncate text-base font-semibold text-zinc-100 sm:text-lg">{meta.title}</h1></div>
    </div>
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Link to="/settings" className="hidden rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-500 sm:block">{aiLabel}</Link>
      <Button asChild size="sm" variant="outline" className="px-3"><Link to={assistantTarget} aria-label="Open AI Workspace" title="Open AI Workspace (Ctrl/Cmd + J)"><Bot className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">AI Workspace</span></Link></Button>
      <Button asChild size="sm" className="px-3"><Link to="/capture" aria-label="Quick capture"><Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Capture</span></Link></Button>
    </div>
  </header>
}
