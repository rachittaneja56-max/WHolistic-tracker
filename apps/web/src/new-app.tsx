import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom"

import { ToastProvider } from "@/components/toast-provider"
import { AuthProvider, useAuth } from "@/features/auth/auth-context"
import { RootLayout } from "@/layouts/root-layout"
import { AllEntitiesPage } from "@/pages/all-entities-page"
import { AnalystPage } from "@/pages/analyst-page"
import { AssistantPage } from "@/pages/assistant-page"
import { CapturePage } from "@/pages/capture-page"
import { ComprehensionChecksPage } from "@/pages/comprehension-checks-page"
import { DsaPage } from "@/pages/dsa-page"
import { EntityDetailPage } from "@/pages/entity-detail-page"
import { GraphChatPage } from "@/pages/graph-chat-page"
import { GraphPage } from "@/pages/graph-page"
import { IdeasPage } from "@/pages/ideas-page"
import { LoginPage } from "@/pages/login-page"
import { ProjectsPage } from "@/pages/projects-page"
import { RecallPage } from "@/pages/recall-page"
import { ReviewInboxPage } from "@/pages/review-inbox-page"
import { SettingsPage } from "@/pages/settings-page"
import { SubjectDetailPage } from "@/pages/subject-detail-page"
import { UpgradedSubjectsPage } from "@/pages/upgraded-subjects-page"
import { TagsPage } from "@/pages/tags-page"
import { TodayPage } from "@/pages/today-page"
import { WeeklyDigestPage } from "@/pages/weekly-digest-page"

function LegacyEntityRedirect() {
  const { entityId } = useParams()
  return <Navigate replace to={`/knowledge/entities/${entityId ?? ""}`} />
}

function AuthGate() {
  const { session, loading, error } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-mono text-sm text-zinc-500">Checking owner session...</div>
  if (error) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-sm text-red-300">{error}</div>
  if (!session?.authenticated) return <LoginPage />
  return <Routes>
    <Route element={<RootLayout />}>
      <Route index element={<TodayPage />} />
      <Route path="capture" element={<CapturePage />} />
      <Route path="trackers/dsa" element={<DsaPage />} />
      <Route path="trackers/projects" element={<ProjectsPage />} />
      <Route path="trackers/subjects" element={<UpgradedSubjectsPage />} />
      <Route path="trackers/subjects/:subjectId" element={<SubjectDetailPage />} />
      <Route path="knowledge/entities" element={<AllEntitiesPage />} />
      <Route path="knowledge/entities/:entityId" element={<EntityDetailPage />} />
      <Route path="knowledge/graph" element={<GraphPage />} />
      <Route path="knowledge/tags" element={<TagsPage />} />
      <Route path="knowledge/recall" element={<RecallPage />} />
      <Route path="knowledge/recall/comprehension" element={<ComprehensionChecksPage />} />
      <Route path="agents/assistant" element={<AssistantPage />} />
      <Route path="agents/ask-graph" element={<GraphChatPage />} />
      <Route path="agents/review-inbox" element={<ReviewInboxPage />} />
      <Route path="agents/ideas" element={<IdeasPage />} />
      <Route path="agents/analyst" element={<AnalystPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="insights/weekly" element={<WeeklyDigestPage />} />
      <Route path="dsa" element={<Navigate replace to="/trackers/dsa" />} />
      <Route path="projects" element={<Navigate replace to="/trackers/projects" />} />
      <Route path="subjects" element={<Navigate replace to="/trackers/subjects" />} />
      <Route path="entities" element={<Navigate replace to="/knowledge/entities" />} />
      <Route path="entities/:entityId" element={<LegacyEntityRedirect />} />
      <Route path="graph" element={<Navigate replace to="/knowledge/graph" />} />
      <Route path="tags" element={<Navigate replace to="/knowledge/tags" />} />
      <Route path="recall" element={<Navigate replace to="/knowledge/recall" />} />
      <Route path="assistant" element={<Navigate replace to="/agents/assistant" />} />
      <Route path="ask-graph" element={<Navigate replace to="/agents/ask-graph" />} />
      <Route path="review-inbox" element={<Navigate replace to="/agents/review-inbox" />} />
      <Route path="ideas" element={<Navigate replace to="/agents/ideas" />} />
      <Route path="analyst" element={<Navigate replace to="/agents/analyst" />} />
      <Route path="weekly" element={<Navigate replace to="/insights/weekly" />} />
      <Route path="comprehension-debt" element={<Navigate replace to="/knowledge/recall/comprehension" />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Route>
  </Routes>
}

export default function NewApp() {
  return <BrowserRouter><AuthProvider><ToastProvider><AuthGate /></ToastProvider></AuthProvider></BrowserRouter>
}

