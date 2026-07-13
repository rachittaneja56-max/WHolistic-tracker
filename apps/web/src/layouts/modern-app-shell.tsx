import { useEffect, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"
import { AssistantSettingsContext } from "@/features/assistant/assistant-settings-context"
import { getSettingsStatus, type SettingsStatus } from "@/lib/system-api"

export function ModernAppShell({ children }: { children: ReactNode; [key: string]: unknown }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("pdkg:sidebar-collapsed") === "true")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [aiStatus, setAiStatus] = useState<SettingsStatus | null | undefined>(undefined)

  useEffect(() => { void getSettingsStatus().then(setAiStatus).catch(() => setAiStatus(null)) }, [location.pathname])
  useEffect(() => {
    function openAssistant(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "j") return
      event.preventDefault()
      if (location.pathname === "/agents/assistant") return
      const from = `${location.pathname}${location.search}`
      navigate(`/agents/assistant?from=${encodeURIComponent(from)}`)
    }
    window.addEventListener("keydown", openAssistant)
    return () => window.removeEventListener("keydown", openAssistant)
  }, [location.pathname, location.search, navigate])
  function toggle() {
    setCollapsed((current) => {
      window.localStorage.setItem("pdkg:sidebar-collapsed", String(!current))
      return !current
    })
  }

  return <AssistantSettingsContext.Provider value={aiStatus}><div className="min-h-screen bg-zinc-950 text-zinc-300">
    <div className="fixed inset-y-0 left-0 z-40 hidden md:block"><AppSidebar collapsed={collapsed} onToggle={toggle} aiStatus={aiStatus} /></div>
    {mobileOpen ? <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-black/70" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><div className="relative h-full w-72"><AppSidebar mobile onNavigate={() => setMobileOpen(false)} aiStatus={aiStatus} /></div></div> : null}
    <div className={collapsed ? "md:pl-16" : "md:pl-64"}>
      <AppTopbar onOpenMobile={() => setMobileOpen(true)} aiStatus={aiStatus} />
      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">{children}</main>
    </div>
  </div></AssistantSettingsContext.Provider>
}
