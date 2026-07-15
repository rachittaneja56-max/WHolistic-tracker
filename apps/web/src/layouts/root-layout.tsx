import { Outlet, useLocation } from "react-router-dom"

import { OnboardingPanel } from "@/components/onboarding-panel"
import { useEntities } from "@/features/entities/hooks/use-entities"
import { ModernAppShell } from "@/layouts/modern-app-shell"

function needsEntityCollection(pathname: string) {
  return pathname.startsWith("/knowledge/entities")
    || pathname.startsWith("/knowledge/graph")
    || pathname.startsWith("/agents/analyst")
}

export function RootLayout() {
  const location = useLocation()
  const entitiesState = useEntities(needsEntityCollection(location.pathname))
  return <ModernAppShell>
    <OnboardingPanel />
    <Outlet context={entitiesState} />
  </ModernAppShell>
}
