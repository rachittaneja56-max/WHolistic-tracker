import { BrowserRouter, Route, Routes } from "react-router-dom"

import { RootLayout } from "@/layouts/root-layout"
import { DashboardPage } from "@/pages/dashboard-page"
import { EntityDetailPage } from "@/pages/entity-detail-page"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="entities/:entityId" element={<EntityDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
