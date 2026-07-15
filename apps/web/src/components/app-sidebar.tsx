import { Link, NavLink, useNavigate } from "react-router-dom"
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings, Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { BrandIcon, navigationGroups } from "@/lib/navigation"
import type { SettingsStatus } from "@/lib/system-api"
import { cn } from "@/lib/utils"

type Props = { collapsed?: boolean; mobile?: boolean; onToggle?: () => void; onNavigate?: () => void; aiStatus?: SettingsStatus | null }

export function AppSidebar({ collapsed = false, mobile = false, onToggle, onNavigate, aiStatus }: Props) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  return <aside className={cn("flex h-full flex-col border-r border-border bg-surface", mobile ? "w-full pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" : collapsed ? "w-16" : "w-64")}>
    <div className={cn("flex h-16 items-center gap-3 border-b border-border px-3", mobile && "pr-14")}>
      <Link to="/app" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="rounded-lg border border-border bg-background p-2"><BrandIcon className="h-4 w-4 text-primary" /></span>
        {!collapsed || mobile ? <span className="truncate text-sm font-semibold">Personal Dev KG</span> : null}
      </Link>
      {!mobile ? <Button variant="ghost" size="sm" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</Button> : null}
    </div>
    <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto p-2">
      {navigationGroups.map((group) => <div key={group.label} className="mb-4">
        {!collapsed || mobile ? <p className="mb-1 px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p> : null}
        <div className="space-y-1">{group.items.map((item) => {
          const Icon = item.icon
          return <NavLink key={item.to} to={item.to} end={item.exact} onClick={onNavigate} title={collapsed && !mobile ? item.label : undefined} className={({ isActive }) => cn("relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-secondary hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", isActive && "bg-primary/10 text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-primary")}>
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed || mobile ? <span>{item.label}</span> : null}
          </NavLink>
        })}</div>
      </div>)}
    </nav>
    <div className="space-y-1 border-t border-border p-2">
      {user?.role === "admin" || user?.role === "root_admin" ? <NavLink to="/admin" onClick={onNavigate} className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-secondary hover:bg-surface-subtle"><Shield className="h-4 w-4 text-primary" />{!collapsed || mobile ? <span>Administration</span> : null}</NavLink> : null}
      <NavLink to="/settings" onClick={onNavigate} className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-secondary hover:bg-surface-subtle"><Settings className="h-4 w-4" />{!collapsed || mobile ? <span>Settings & profile</span> : null}</NavLink>
      {!collapsed || mobile ? <div className="rounded-lg bg-background px-3 py-2"><p className="truncate text-xs text-muted-foreground">{user?.email}</p><p className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", aiStatus?.ai.provider_ready ? "bg-success" : "bg-warning")} />{aiStatus?.ai.provider_ready ? "AI ready" : aiStatus?.ai.enabled ? "AI setup needed" : "AI off"}</p></div> : null}
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void logout().then(() => navigate("/"))}><LogOut className="h-4 w-4" />{!collapsed || mobile ? <span className="ml-2">Log out</span> : null}</Button>
    </div>
  </aside>
}
