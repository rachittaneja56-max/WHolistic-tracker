import { Link, NavLink, useNavigate } from "react-router-dom"
import { LogOut, PanelLeftClose, PanelLeftOpen, Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { BrandIcon, navigationGroups } from "@/lib/navigation"
import type { SettingsStatus } from "@/lib/system-api"
import { cn } from "@/lib/utils"

type Props = { collapsed?: boolean; mobile?: boolean; onToggle?: () => void; onNavigate?: () => void; aiStatus?: SettingsStatus | null }

export function AppSidebar({ collapsed = false, mobile = false, onToggle, onNavigate, aiStatus }: Props) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  return (
    <aside className={cn("flex h-full flex-col border-r border-zinc-800 bg-zinc-900", mobile ? "w-full pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" : collapsed ? "w-16" : "w-64")}>
      <div className={cn("flex h-16 items-center gap-3 border-b border-zinc-800 px-3", mobile && "pr-14")}>
        <Link to="/app" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 text-zinc-100">
          <span className="rounded-md border border-zinc-800 bg-zinc-950 p-2"><BrandIcon className="h-4 w-4 text-blue-400" /></span>
          {!collapsed || mobile ? <span className="truncate text-sm font-semibold">Personal Dev KG</span> : null}
        </Link>
        {!mobile ? <Button variant="ghost" size="sm" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</Button> : null}
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {navigationGroups.map((group) => <div key={group.label} className="mb-4">
          {!collapsed || mobile ? <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{group.label}</p> : null}
          <div className="space-y-1">{group.items.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} end={item.exact} onClick={onNavigate} title={collapsed && !mobile ? item.label : undefined} className={({ isActive }) => cn("relative flex h-11 items-center gap-3 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:h-10", isActive && "bg-zinc-800 text-zinc-100 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-blue-400")}>
              <Icon className={cn("h-4 w-4 shrink-0 text-zinc-500", "group-aria-[current=page]:text-blue-400")} />
              {!collapsed || mobile ? <span>{item.label}</span> : null}
            </NavLink>
          })}</div>
        </div>)}
      </nav>
      <div className="space-y-2 border-t border-zinc-800 p-2">
        {user?.role === "admin" || user?.role === "root_admin" ? <NavLink to="/admin" onClick={onNavigate} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 md:h-10"><Shield className="h-4 w-4 text-blue-400" />{!collapsed || mobile ? <span>Administration</span> : null}</NavLink> : null}
        {!collapsed || mobile ? <p className="truncate px-3 font-mono text-[10px] text-zinc-500">{user?.email}</p> : null}
        <Link to="/settings" onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-md bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-500 md:min-h-10">
          <span className={cn("h-2 w-2 rounded-full", aiStatus?.ai.provider_ready ? "bg-blue-400" : "bg-amber-400")} />
          {!collapsed || mobile ? (aiStatus?.ai.provider_ready ? "AI ready" : aiStatus?.ai.enabled ? "AI setup needed" : "AI off") : null}
        </Link>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void logout().then(() => navigate("/"))}><LogOut className="h-4 w-4" />{!collapsed || mobile ? <span className="ml-2">Log out</span> : null}</Button>
      </div>
    </aside>
  )
}
