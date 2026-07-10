import { BrowserRouter, Route, Routes } from "react-router-dom"

import { RootLayout } from "@/layouts/root-layout"
import { AllEntitiesPage } from "@/pages/all-entities-page"
import { CapturePage } from "@/pages/capture-page"
import { ComprehensionChecksPage } from "@/pages/comprehension-checks-page"
import { DsaPage } from "@/pages/dsa-page"
import { EntityDetailPage } from "@/pages/entity-detail-page"
import { GraphChatPage } from "@/pages/graph-chat-page"
import { GraphPage } from "@/pages/graph-page"
import { IdeasPage } from "@/pages/ideas-page"
import { ProjectsPage } from "@/pages/projects-page"
import { RecallPage } from "@/pages/recall-page"
import { ReviewInboxPage } from "@/pages/review-inbox-page"
import { SubjectsPage } from "@/pages/subjects-page"
import { TagsPage } from "@/pages/tags-page"
import { TodayPage } from "@/pages/today-page"
import { WeeklyDigestPage } from "@/pages/weekly-digest-page"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<TodayPage />} />
          <Route path="weekly" element={<WeeklyDigestPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="dsa" element={<DsaPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="recall" element={<RecallPage />} />
          <Route path="comprehension-debt" element={<ComprehensionChecksPage />} />
          <Route path="ask-graph" element={<GraphChatPage />} />
          <Route path="review-inbox" element={<ReviewInboxPage />} />
          <Route path="entities" element={<AllEntitiesPage />} />
          <Route path="entities/:entityId" element={<EntityDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
