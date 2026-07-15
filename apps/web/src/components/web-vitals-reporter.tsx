import { useEffect } from "react"
import { useLocation } from "react-router-dom"

import { recordProductEvent } from "@/lib/api"

type Metric = "LCP" | "INP" | "CLS"

function rating(metric: Metric, value: number) {
  const good = metric === "LCP" ? 2500 : metric === "INP" ? 200 : 0.1
  const poor = metric === "LCP" ? 4000 : metric === "INP" ? 500 : 0.25
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor"
}

function surface(path: string) {
  if (path.startsWith("/learn") || path.startsWith("/knowledge/recall")) return "learn"
  if (path.startsWith("/trackers/projects")) return "projects"
  if (path.startsWith("/library") || path.startsWith("/knowledge/")) return "library"
  if (path.startsWith("/agents/assistant")) return "ai_coach"
  if (path.startsWith("/settings")) return "settings"
  return "home"
}

export function WebVitalsReporter() {
  const location = useLocation()

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return
    const values: Partial<Record<Metric, number>> = {}
    const sent = new Set<Metric>()
    const observers: PerformanceObserver[] = []

    function send(metric: Metric) {
      if (sent.has(metric) || values[metric] === undefined) return
      sent.add(metric)
      const value = values[metric]!
      void recordProductEvent("core_web_vital", {
        metric,
        value: metric === "CLS" ? Number(value.toFixed(4)) : Math.round(value),
        rating: rating(metric, value),
        surface: surface(location.pathname),
      }).catch(() => undefined)
    }

    function observe(type: string, callback: PerformanceObserverCallback) {
      try {
        const observer = new PerformanceObserver(callback)
        observer.observe({ type, buffered: true })
        observers.push(observer)
      } catch {
        // Older browsers may not implement every web-vital entry type.
      }
    }

    observe("largest-contentful-paint", (list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1]
      if (last) values.LCP = last.startTime
    })
    observe("layout-shift", (list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (!entry.hadRecentInput) values.CLS = (values.CLS ?? 0) + (entry.value ?? 0)
      }
    })
    observe("event", (list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
        if ((entry.interactionId ?? 0) > 0) values.INP = Math.max(values.INP ?? 0, entry.duration)
      }
    })

    const flush = () => {
      send("LCP")
      send("INP")
      send("CLS")
    }
    const onVisibility = () => { if (document.visibilityState === "hidden") flush() }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    const timer = window.setTimeout(flush, 15000)

    return () => {
      window.clearTimeout(timer)
      flush()
      observers.forEach((observer) => observer.disconnect())
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [location.pathname])

  return null
}
