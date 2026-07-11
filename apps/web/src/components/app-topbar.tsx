import { Link, useLocation } from "react-router-dom"
import { Menu, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { routeMeta } from "@/lib/navigation"
import type { SettingsStatus } from "@/lib/system-api"

export function AppTopbar({ onOpenMobile, aiStatus }: { onOpenMobile: () => void; aiStatus?: SettingsStatus | null }) {
  const location = useLocation()
  const meta = routeMeta(location.pathname)
  return <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900 px-4 md:px-6">
    <div className="flex min-w-0 items-center gap-3">
      <Button variant="ghost" size="sm" className="md:hidden" onClick={onOpenMobile} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
      <div className="min-w-0"><p className="font-mono text-xs text-zinc-500">{meta.group}</p><h1 className="truncate text-lg font-semibold text-zinc-100">{meta.title}</h1></div>
    </div>
    <div className="flex items-center gap-2">
      <Link to="/settings" className="hidden rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-500 sm:block">{aiStatus?.ai.provider_ready ? "AI ready" : aiStatus?.ai.enabled ? "AI unavailable" : "AI off"}</Link>
      <Button asChild size="sm"><Link to="/capture"><Plus className="mr-2 h-4 w-4" />Capture</Link></Button>
    </div>
  </header>
}
