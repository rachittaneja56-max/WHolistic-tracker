import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom"

import { ToastProvider } from "@/components/toast-provider"
import { AuthProvider, useAuth } from "@/features/auth/auth-context"
import { RootLayout } from "@/layouts/root-layout"
import { buildLoginUrl, getSafeReturnTo } from "@/lib/auth-routing"
import { AllEntitiesPage } from "@/pages/all-entities-page"
import { AnalystPage } from "@/pages/analyst-page"
import { AssistantPage } from "@/pages/assistant-page"
import { CapturePage } from "@/pages/capture-page"
import { ComprehensionChecksPage } from "@/pages/comprehension-checks-page"
import { DsaPage } from "@/pages/dsa-page"
import { EntityDetailPage } from "@/pages/entity-detail-page"
import { GraphPage } from "@/pages/graph-page"
import { LandingPage } from "@/pages/landing-page"
import { LoginPage } from "@/pages/login-page"
import { InvitePage } from "@/pages/invite-page"
import { AdminPage } from "@/pages/admin-page"
import { ResetPasswordPage } from "@/pages/reset-password-page"
import { SignupPage } from "@/pages/signup-page"
import { ProjectsPage } from "@/pages/projects-page"
import { ProjectWorkspacePage } from "@/pages/project-workspace-page"
import { RecallPage } from "@/pages/recall-page"
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

function SessionLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-mono text-sm text-zinc-500">Checking session...</div>
}

function SessionError({ message }: { message: string }) {
  return <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-sm text-red-300">{message}</div>
}

function PublicHome() {
  const { user } = useAuth()
  return user ? <Navigate replace to="/app" /> : <LandingPage />
}

function PublicLogin() {
  const { user, loading, error } = useAuth()
  const [params] = useSearchParams()
  if (loading) return <SessionLoading />
  if (error) return <SessionError message={error} />
  if (user) return <Navigate replace to={getSafeReturnTo(params.get("returnTo"))} />
  return <LoginPage />
}

function PublicSignup() {
  const { user, loading, error } = useAuth()
  const [params] = useSearchParams()
  if (loading) return <SessionLoading />
  if (error) return <SessionError message={error} />
  if (user) return <Navigate replace to={getSafeReturnTo(params.get("returnTo"))} />
  return <SignupPage />
}

function RequireAuth() {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <SessionLoading />
  if (error) return <SessionError message={error} />
  if (!user) {
    return <Navigate replace to={buildLoginUrl(location.pathname, location.search, location.hash)} />
  }
  return <Outlet />
}

function AppRoutes() {
  const { user } = useAuth()
  return <Routes>
    <Route path="/" element={<PublicHome />} />
    <Route path="/login" element={<PublicLogin />} />
    <Route path="/signup" element={<PublicSignup />} />
    <Route path="/invite" element={<InvitePage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<RequireAuth />}>
      <Route element={<RootLayout />}>
      <Route path="app" element={<TodayPage />} />
      <Route path="capture" element={<CapturePage />} />
      <Route path="trackers/dsa" element={<DsaPage />} />
      <Route path="trackers/projects" element={<ProjectsPage />} />
      <Route path="trackers/projects/:projectId" element={<ProjectWorkspacePage />} />
      <Route path="trackers/subjects" element={<UpgradedSubjectsPage />} />
      <Route path="trackers/subjects/:subjectId" element={<SubjectDetailPage />} />
      <Route path="knowledge/entities" element={<AllEntitiesPage />} />
      <Route path="knowledge/entities/:entityId" element={<EntityDetailPage />} />
      <Route path="knowledge/graph" element={<GraphPage />} />
      <Route path="knowledge/tags" element={<TagsPage />} />
      <Route path="knowledge/recall" element={<RecallPage />} />
      <Route path="knowledge/recall/comprehension" element={<ComprehensionChecksPage />} />
      <Route path="agents/assistant" element={<AssistantPage />} />
      <Route path="agents/ask-graph" element={<Navigate replace to="/agents/assistant?view=ask-graph" />} />
      <Route path="agents/review-inbox" element={<Navigate replace to="/agents/assistant?view=review-inbox" />} />
      <Route path="agents/ideas" element={<Navigate replace to="/agents/assistant?view=ideas" />} />
      <Route path="agents/analyst" element={<AnalystPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="admin" element={user?.role === "admin" || user?.role === "root_admin" ? <AdminPage /> : <Navigate replace to="/app" />} />
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
      <Route path="ask-graph" element={<Navigate replace to="/agents/assistant?view=ask-graph" />} />
      <Route path="review-inbox" element={<Navigate replace to="/agents/assistant?view=review-inbox" />} />
      <Route path="ideas" element={<Navigate replace to="/agents/assistant?view=ideas" />} />
      <Route path="analyst" element={<Navigate replace to="/agents/analyst" />} />
      <Route path="weekly" element={<Navigate replace to="/insights/weekly" />} />
      <Route path="comprehension-debt" element={<Navigate replace to="/knowledge/recall/comprehension" />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate replace to={user ? "/app" : "/"} />} />
  </Routes>
}

export default function NewApp() {
  return <BrowserRouter><AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider></BrowserRouter>
}

