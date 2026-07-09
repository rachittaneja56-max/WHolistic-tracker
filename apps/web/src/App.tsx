import { useEffect, useState } from "react"
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom"

import { getEntities, type Entity } from "@/lib/api"
import { AppShell } from "@/components/app-shell"
import { DashboardPage } from "@/pages/dashboard-page"
import { EntityDetailPage } from "@/pages/entity-detail-page"

export type LayoutContext = {
  entities: Entity[]
  addEntityToList: (entity: Entity) => void
  upsertEntityInList: (entity: Entity) => void
}

function AppLayout() {
  const location = useLocation()
  const [entities, setEntities] = useState<Entity[]>([])

  const activeEntityId = location.pathname.match(/^\/entities\/([^/]+)/)?.[1]

  function addEntityToList(entity: Entity) {
    setEntities((currentEntities) => [entity, ...currentEntities.filter((currentEntity) => currentEntity.id !== entity.id)])
  }

  function upsertEntityInList(entity: Entity) {
    setEntities((currentEntities) => {
      const remaining = currentEntities.filter((currentEntity) => currentEntity.id !== entity.id)
      return [entity, ...remaining]
    })
  }

  useEffect(() => {
    let isMounted = true

    async function loadEntities() {
      try {
        const results = await getEntities()
        if (isMounted) {
          setEntities(results)
        }
      } catch (error) {
        if (isMounted) {
          console.error(error)
        }
      }
    }

    void loadEntities()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <AppShell entities={entities} activeEntityId={activeEntityId}>
      <Outlet context={{ entities, addEntityToList, upsertEntityInList }} />
    </AppShell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="entities/:entityId" element={<EntityDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
