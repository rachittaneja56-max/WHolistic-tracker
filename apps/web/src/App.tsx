import { BrowserRouter, Route, Routes } from "react-router-dom"

import { RootLayout } from "@/layouts/root-layout"
import { AllEntitiesPage } from "@/pages/all-entities-page"
import { CapturePage } from "@/pages/capture-page"
import { DsaPage } from "@/pages/dsa-page"
import { EntityDetailPage } from "@/pages/entity-detail-page"
import { GraphPage } from "@/pages/graph-page"
import { ProjectsPage } from "@/pages/projects-page"
import { SubjectsPage } from "@/pages/subjects-page"
import { TodayPage } from "@/pages/today-page"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<TodayPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="dsa" element={<DsaPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="entities" element={<AllEntitiesPage />} />
          <Route path="entities/:entityId" element={<EntityDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
