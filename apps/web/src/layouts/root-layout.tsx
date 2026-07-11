import { Outlet, useLocation } from "react-router-dom"

import { useEntities } from "@/features/entities/hooks/use-entities"
import { ModernAppShell } from "@/layouts/modern-app-shell"

export function RootLayout() {
  const location = useLocation()
  const entitiesState = useEntities()
  const activeEntityId = location.pathname.match(/^\/entities\/([^/]+)/)?.[1]

  return (
    <ModernAppShell
      entities={entitiesState.entities}
      activeEntityId={activeEntityId}
      isEntitiesLoading={entitiesState.isEntitiesLoading}
      entitiesError={entitiesState.entitiesError}
      onRetry={() => {
        void entitiesState.refreshEntities()
      }}
    >
      <Outlet context={entitiesState} />
    </ModernAppShell>
  )
}
