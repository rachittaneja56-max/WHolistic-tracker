import { Link, NavLink, useNavigate } from "react-router-dom"
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings, Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { usePreferences } from "@/features/preferences/preferences-context"
import { BrandIcon, navigationGroups } from "@/lib/navigation"
import type { SettingsStatus } from "@/lib/system-api"
import { cn } from "@/lib/utils"

type Props = { collapsed?: boolean; mobile?: boolean; onToggle?: () => void; onNavigate?: () => void; aiStatus?: SettingsStatus | null }

export function AppSidebar({ collapsed = false, mobile = false, onToggle, onNavigate, aiStatus }: Props) {
  const { logout, user } = useAuth()
  const { preferences } = usePreferences()
  const moduleFor = (label: string) => ({ "Subjects": "subjects", "DSA practice": "dsa", "Projects": "projects", "Notes": "notes", "Recall": "recall", "Comprehension": "comprehension", "Insights": "insights" }[label])
  const emphasized = new Set((preferences.learning_focuses ?? []))
  const visibleGroups = navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => !(preferences.hidden_modules ?? []).includes(moduleFor(item.label) ?? "")).slice().sort((a, b) => Number(emphasized.has(b.label === "DSA practice" ? "DSA practice" : b.label === "Projects" ? "Projects" : b.label === "Subjects" ? "Subjects" : b.label)) - Number(emphasized.has(a.label === "DSA practice" ? "DSA practice" : a.label === "Projects" ? "Projects" : a.label === "Subjects" ? "Subjects" : a.label)))})).filter((group) => group.items.length)
  const navigate = useNavigate()
  return <aside className={cn("flex h-full flex-col border-r border-border/60 bg-surface-subtle/80 backdrop-blur-xl transition-[width] duration-200", mobile ? "w-full pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" : collapsed ? "w-[4.5rem]" : "w-[17rem]")}>
    <div className={cn("flex h-16 items-center gap-3 px-3.5", mobile && "pr-14")}>
      <Link to="/app" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20"><BrandIcon className="h-[18px] w-[18px]" /></span>
        {!collapsed || mobile ? <span className="min-w-0"><span className="block truncate text-sm font-semibold tracking-[-0.02em]">Personal Dev</span><span className="block truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Knowledge OS</span></span> : null}
      </Link>
      {!mobile ? <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</Button> : null}
    </div>
    <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-2.5 pb-4 pt-3">
      {visibleGroups.map((group) => <div key={group.label} className="mb-5">
        {!collapsed || mobile ? <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p> : <div className="mx-auto mb-2 h-px w-6 bg-border" />}
        <div className="space-y-0.5">{group.items.map((item) => {
          const Icon = item.icon
          return <NavLink key={item.to} to={item.to} end={item.exact} onClick={onNavigate} title={collapsed && !mobile ? item.label : undefined} className={({ isActive }) => cn("flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", isActive && "bg-surface text-foreground shadow-sm ring-1 ring-border/60")}>
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed || mobile ? <span>{item.label}</span> : null}
          </NavLink>
        })}</div>
      </div>)}
    </nav>
    <div className="space-y-1 border-t border-border/60 p-2.5">
      {user?.role === "admin" || user?.role === "root_admin" ? <NavLink to="/admin" onClick={onNavigate} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-surface/70 hover:text-foreground"><Shield className="h-4 w-4 text-primary" />{!collapsed || mobile ? <span>Administration</span> : null}</NavLink> : null}
      <NavLink to="/settings" onClick={onNavigate} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-surface/70 hover:text-foreground"><Settings className="h-4 w-4" />{!collapsed || mobile ? <span>Settings & profile</span> : null}</NavLink>
      {!collapsed || mobile ? <div className="my-2 rounded-xl border border-border/60 bg-surface/70 px-3 py-2.5"><p className="truncate text-xs font-medium text-secondary">{user?.email}</p><p className="mt-1.5 flex items-center gap-2 text-[10px] font-medium text-muted-foreground"><span className={cn("h-1.5 w-1.5 rounded-full", aiStatus?.ai?.provider_ready ? "bg-success" : "bg-warning")} />{aiStatus?.ai?.provider_ready ? "AI ready" : aiStatus?.ai?.enabled ? "AI setup needed" : "AI off"}</p></div> : null}
      <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => void logout().then(() => navigate("/"))}><LogOut className="h-4 w-4" />{!collapsed || mobile ? <span className="ml-2">Log out</span> : null}</Button>
    </div>
  </aside>
}
