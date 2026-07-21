import { Outlet, useLocation } from "react-router-dom"

import { OnboardingPanel } from "@/components/onboarding-panel"
import { useEntities } from "@/features/entities/hooks/use-entities"
import { ModernAppShell } from "@/layouts/modern-app-shell"

function pageHeading(pathname: string) {
  if (pathname === "/agents/assistant") return "AI workspace"
  if (pathname === "/agents/analyst") return "Weekly analyst"
  if (pathname === "/knowledge/graph") return "Knowledge graph"
  if (pathname === "/knowledge/tags") return "Tags and coverage"
  if (pathname === "/knowledge/recall") return "Recall"
  if (pathname === "/knowledge/recall/comprehension") return "Comprehension checks"
  if (pathname === "/insights/weekly") return "Weekly digest"
  if (/^\/knowledge\/entities\//.test(pathname)) return "Knowledge item"
  return null
}

function needsEntityCollection(pathname: string) {
  return pathname.startsWith("/knowledge/entities")
    || pathname.startsWith("/knowledge/graph")
    || pathname.startsWith("/agents/analyst")
}

export function RootLayout() {
  const location = useLocation()
  const entitiesState = useEntities(needsEntityCollection(location.pathname))
  const heading = pageHeading(location.pathname)
  return <ModernAppShell>
    {heading ? <h1 className="sr-only">{heading}</h1> : null}
    <OnboardingPanel />
    <Outlet context={entitiesState} />
  </ModernAppShell>
}