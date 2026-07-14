import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { X } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"
import { Button } from "@/components/ui/button"
import { AssistantSettingsContext } from "@/features/assistant/assistant-settings-context"
import { getSettingsStatus, type SettingsStatus } from "@/lib/system-api"

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

export function ModernAppShell({ children }: { children: ReactNode; [key: string]: unknown }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("pdkg:sidebar-collapsed") === "true")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine)
  const [aiStatus, setAiStatus] = useState<SettingsStatus | null | undefined>(undefined)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)

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
  useEffect(() => {
    const markOnline = () => setIsOnline(true)
    const markOffline = () => setIsOnline(false)
    window.addEventListener("online", markOnline)
    window.addEventListener("offline", markOffline)
    return () => {
      window.removeEventListener("online", markOnline)
      window.removeEventListener("offline", markOffline)
    }
  }, [])
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)")
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false)
    }
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [])
  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.requestAnimationFrame(() => mobilePanelRef.current?.focus())

    return () => {
      document.body.style.overflow = previousOverflow
      mobileTriggerRef.current?.focus()
    }
  }, [mobileOpen])

  function trapMobileFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      setMobileOpen(false)
      return
    }
    if (event.key !== "Tab") return

    const focusable = Array.from(mobilePanelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    if (!focusable.length) {
      event.preventDefault()
      mobilePanelRef.current?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === mobilePanelRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function toggle() {
    setCollapsed((current) => {
      window.localStorage.setItem("pdkg:sidebar-collapsed", String(!current))
      return !current
    })
  }

  return <AssistantSettingsContext.Provider value={aiStatus}><div className="min-h-dvh bg-zinc-950 text-zinc-300">
    <div className="fixed inset-y-0 left-0 z-40 hidden md:block"><AppSidebar collapsed={collapsed} onToggle={toggle} aiStatus={aiStatus} /></div>
    {mobileOpen ? <div className="fixed inset-0 z-50 md:hidden">
      <button className="absolute inset-0 bg-black/70" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      <div
        ref={mobilePanelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        tabIndex={-1}
        onKeyDown={trapMobileFocus}
        className="relative h-dvh w-[min(18rem,calc(100vw-3rem))] outline-none"
      >
        <Button type="button" variant="ghost" size="sm" className="absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-10" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </Button>
        <AppSidebar mobile onNavigate={() => setMobileOpen(false)} aiStatus={aiStatus} />
      </div>
    </div> : null}
    <div className={collapsed ? "md:pl-16" : "md:pl-64"}>
      <AppTopbar onOpenMobile={() => setMobileOpen(true)} mobileTriggerRef={mobileTriggerRef} aiStatus={aiStatus} />
      {!isOnline ? <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-200">You are offline. Browsing may be limited and captures cannot be saved until the connection returns.</div> : null}
      <main className="mx-auto max-w-[1600px] px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:px-6 md:py-6">{children}</main>
    </div>
  </div></AssistantSettingsContext.Provider>
}
