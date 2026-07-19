import { Plus } from "lucide-react"
import { NavLink } from "react-router-dom"

import { mobileDestinations } from "@/lib/navigation"
import { usePreferences } from "@/features/preferences/preferences-context"
import { cn } from "@/lib/utils"

function Destination({ item }: { item: (typeof mobileDestinations)[number] }) {
  const Icon = item.icon
  return <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => cn("group flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", isActive && "text-primary")}>
    {({ isActive }) => <><span className={cn("flex h-7 w-9 items-center justify-center rounded-full transition-colors", isActive && "bg-primary/10")}><Icon className="h-4 w-4" aria-hidden="true" /></span><span className="max-w-full truncate">{item.label}</span></>}
  </NavLink>
}

export function MobileNavigation() {
  const { preferences } = usePreferences()
  const moduleFor = (label: string) => ({ "Projects": "projects", "Library": "notes" }[label])
  const destinations = mobileDestinations.filter((item) => !preferences.hidden_modules.includes(moduleFor(item.label) ?? ""))
  const leading = destinations.slice(0, 3)
  const trailing = destinations.slice(3)
  return <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgb(20_20_24_/_0.06)] backdrop-blur-xl md:hidden">
    <div className="grid h-[4.5rem] grid-cols-6 px-1">
      {leading.map((item) => <Destination key={item.to} item={item} />)}
      <NavLink to="/capture" aria-label="Capture a learning item" className="flex min-w-0 -translate-y-3 flex-col items-center justify-start gap-1 rounded-md text-[10px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-surface bg-primary text-primary-foreground shadow-panel"><Plus className="h-5 w-5" aria-hidden="true" /></span>
        <span>Capture</span>
      </NavLink>
      {trailing.map((item) => <Destination key={item.to} item={item} />)}
    </div>
  </nav>
}
