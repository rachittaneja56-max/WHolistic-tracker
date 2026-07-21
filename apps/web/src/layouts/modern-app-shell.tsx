import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { X } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"
import { CommandPalette } from "@/components/command-palette"
import { MobileNavigation } from "@/components/mobile-navigation"
import { WebVitalsReporter } from "@/components/web-vitals-reporter"
import { Button } from "@/components/ui/button"
import { AssistantSettingsContext } from "@/features/assistant/assistant-settings-context"
import { getSettingsStatus, type SettingsStatus } from "@/lib/system-api"
import { FocusSessionDock } from "@/features/focus/focus-session-dock"

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

  useEffect(() => {
    let active = true
    const refresh = () => void getSettingsStatus().then((value) => { if (active) setAiStatus(value) }).catch(() => { if (active) setAiStatus(null) })
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener("pdkg:settings-updated", refresh)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("pdkg:settings-updated", refresh) }
  }, [])

  useEffect(() => {
    const register = () => void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: false })).catch(() => undefined)
    const id = globalThis.setTimeout(register, 2500)
    return () => globalThis.clearTimeout(id)
  }, [])

  useEffect(() => {
    function openAssistant(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "j") return
      event.preventDefault()
      if (location.pathname === "/agents/assistant") return
      navigate(`/agents/assistant?from=${encodeURIComponent(`${location.pathname}${location.search}`)}`)
    }
    window.addEventListener("keydown", openAssistant)
    return () => window.removeEventListener("keydown", openAssistant)
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    const markOnline = () => setIsOnline(true)
    const markOffline = () => setIsOnline(false)
    window.addEventListener("online", markOnline)
    window.addEventListener("offline", markOffline)
    return () => { window.removeEventListener("online", markOnline); window.removeEventListener("offline", markOffline) }
  }, [])

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)")
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) setMobileOpen(false) }
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.requestAnimationFrame(() => mobilePanelRef.current?.focus())
    return () => { document.body.style.overflow = previousOverflow; mobileTriggerRef.current?.focus() }
  }, [mobileOpen])

  function trapMobileFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); return }
    if (event.key !== "Tab") return
    const focusable = Array.from(mobilePanelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    if (!focusable.length) { event.preventDefault(); mobilePanelRef.current?.focus(); return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === mobilePanelRef.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  function toggle() {
    setCollapsed((current) => {
      window.localStorage.setItem("pdkg:sidebar-collapsed", String(!current))
      return !current
    })
  }

  return <AssistantSettingsContext.Provider value={aiStatus}>
    <WebVitalsReporter />
    <CommandPalette />
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className="app-workspace min-h-dvh text-secondary">
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block"><AppSidebar collapsed={collapsed} onToggle={toggle} aiStatus={aiStatus} /></div>
      {mobileOpen ? <div className="fixed inset-0 z-50 md:hidden">
        <button className="absolute inset-0 bg-black/60" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
        <div ref={mobilePanelRef} role="dialog" aria-modal="true" aria-label="All navigation" tabIndex={-1} onKeyDown={trapMobileFocus} className="relative h-dvh w-[min(18rem,calc(100vw-3rem))] outline-none">
          <Button type="button" variant="ghost" size="sm" className="absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-10" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button>
          <AppSidebar mobile onNavigate={() => setMobileOpen(false)} aiStatus={aiStatus} />
        </div>
      </div> : null}
      <div className={collapsed ? "transition-[padding] duration-200 md:pl-[4.5rem]" : "transition-[padding] duration-200 md:pl-[17rem]"}>
        <AppTopbar onOpenMobile={() => setMobileOpen(true)} mobileTriggerRef={mobileTriggerRef} aiStatus={aiStatus} />
        {!isOnline ? <div role="status" aria-live="polite" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-warning">You are offline. Captures cannot be saved until the connection returns.</div> : null}
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1480px] px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] outline-none sm:px-6 md:px-8 md:py-8 md:pb-10">{children}</main>
      </div>
      <FocusSessionDock />
      <MobileNavigation />
    </div>
  </AssistantSettingsContext.Provider>
}
