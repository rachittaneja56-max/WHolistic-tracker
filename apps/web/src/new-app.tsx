import { lazy, Suspense, useEffect } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom"

import { ToastProvider } from "@/components/toast-provider"
import { AuthProvider, useAuth } from "@/features/auth/auth-context"
import { PreferencesProvider } from "@/features/preferences/preferences-context"
import { RootLayout } from "@/layouts/root-layout"
import { buildLoginUrl, getSafeReturnTo } from "@/lib/auth-routing"

const AcademicPlanningPage = lazy(() => import("@/pages/academic-planning-page").then((module) => ({ default: module.AcademicPlanningPage })))
const AdminPage = lazy(() => import("@/pages/admin-page").then((module) => ({ default: module.AdminPage })))
const AllEntitiesPage = lazy(() => import("@/pages/all-entities-page").then((module) => ({ default: module.AllEntitiesPage })))
const AnalystPage = lazy(() => import("@/pages/analyst-page").then((module) => ({ default: module.AnalystPage })))
const AssistantPage = lazy(() => import("@/pages/assistant-page").then((module) => ({ default: module.AssistantPage })))
const CapturePage = lazy(() => import("@/pages/capture-page").then((module) => ({ default: module.CapturePage })))
const ComprehensionChecksPage = lazy(() => import("@/pages/comprehension-checks-page").then((module) => ({ default: module.ComprehensionChecksPage })))
const DsaPage = lazy(() => import("@/pages/dsa-page").then((module) => ({ default: module.DsaPage })))
const EntityDetailPage = lazy(() => import("@/pages/entity-detail-page").then((module) => ({ default: module.EntityDetailPage })))
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password-page").then((module) => ({ default: module.ForgotPasswordPage })))
const GraphPage = lazy(() => import("@/pages/graph-page").then((module) => ({ default: module.GraphPage })))
const InsightsPage = lazy(() => import("@/pages/insights-page").then((module) => ({ default: module.InsightsPage })))
const InvitePage = lazy(() => import("@/pages/invite-page").then((module) => ({ default: module.InvitePage })))
const LandingPage = lazy(() => import("@/pages/landing-page").then((module) => ({ default: module.LandingPage })))
const LearnPage = lazy(() => import("@/pages/learn-page").then((module) => ({ default: module.LearnPage })))
const LibraryPage = lazy(() => import("@/pages/library-page").then((module) => ({ default: module.LibraryPage })))
const LoginPage = lazy(() => import("@/pages/login-page").then((module) => ({ default: module.LoginPage })))
const ProjectWorkspacePage = lazy(() => import("@/pages/project-workspace-page").then((module) => ({ default: module.ProjectWorkspacePage })))
const ProjectsPage = lazy(() => import("@/pages/projects-page").then((module) => ({ default: module.ProjectsPage })))
const RecallPage = lazy(() => import("@/pages/recall-page").then((module) => ({ default: module.RecallPage })))
const ResetPasswordPage = lazy(() => import("@/pages/reset-password-page").then((module) => ({ default: module.ResetPasswordPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
const SignupPage = lazy(() => import("@/pages/signup-page").then((module) => ({ default: module.SignupPage })))
const SubjectDetailPage = lazy(() => import("@/pages/subject-detail-page").then((module) => ({ default: module.SubjectDetailPage })))
const TagsPage = lazy(() => import("@/pages/tags-page").then((module) => ({ default: module.TagsPage })))
const TodayPage = lazy(() => import("@/pages/today-page").then((module) => ({ default: module.TodayPage })))
const UpgradedSubjectsPage = lazy(() => import("@/pages/upgraded-subjects-page").then((module) => ({ default: module.UpgradedSubjectsPage })))
const WeeklyDigestPage = lazy(() => import("@/pages/weekly-digest-page").then((module) => ({ default: module.WeeklyDigestPage })))

function LegacyEntityRedirect() {
  const { entityId } = useParams()
  return <Navigate replace to={`/knowledge/entities/${entityId ?? ""}`} />
}

function SessionLoading() {
  return <main id="main-content" className="flex min-h-screen items-center justify-center bg-background font-mono text-sm text-muted-foreground" aria-live="polite">Checking session...</main>
}

function SessionError({ message }: { message: string }) {
  return <main id="main-content" className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-danger" role="alert">{message}</main>
}

function RouteFocus() {
  const location = useLocation()
  useEffect(() => {
    window.requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>("main")
      if (!main) return
      main.tabIndex = -1
      main.focus({ preventScroll: true })
    })
  }, [location.pathname])
  return null
}

function PublicHome() {
  const { user } = useAuth()
  return user ? <Navigate replace to="/app" /> : <LandingPage />
}

function PublicLogin() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  if (user) return <Navigate replace to={getSafeReturnTo(params.get("returnTo"))} />
  return <LoginPage />
}

function PublicSignup() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  if (user) return <Navigate replace to={getSafeReturnTo(params.get("returnTo"))} />
  return <SignupPage />
}

function RequireAuth() {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <SessionLoading />
  if (error) return <SessionError message={error} />
  if (!user) return <Navigate replace to={buildLoginUrl(location.pathname, location.search, location.hash)} />
  return <Outlet />
}

function LoadingRoute() {
  return <main id="main-content" className="flex min-h-[50vh] items-center justify-center font-mono text-sm text-muted-foreground" aria-live="polite">Loading workspace...</main>
}

function AppRoutes() {
  const { user } = useAuth()
  return <Suspense fallback={<LoadingRoute />}><RouteFocus /><Routes>
    <Route path="/" element={<PublicHome />} />
    <Route path="/login" element={<PublicLogin />} />
    <Route path="/signup" element={<PublicSignup />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/invite" element={<InvitePage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<RequireAuth />}>
      <Route element={<RootLayout />}>
        <Route path="app" element={<TodayPage />} />
        <Route path="app/insights" element={<InsightsPage />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="academic" element={<AcademicPlanningPage />} />
        <Route path="library" element={<LibraryPage />} />
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
        <Route path="agents/analyst" element={<AnalystPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={user?.role === "admin" || user?.role === "root_admin" ? <AdminPage /> : <Navigate replace to="/app" />} />
        <Route path="insights/weekly" element={<WeeklyDigestPage />} />

        <Route path="agents/ask-graph" element={<Navigate replace to="/agents/assistant?view=ask-graph" />} />
        <Route path="agents/review-inbox" element={<Navigate replace to="/agents/assistant?view=review-inbox" />} />
        <Route path="agents/ideas" element={<Navigate replace to="/agents/assistant?view=ideas" />} />
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
  </Routes></Suspense>
}

export default function NewApp() {
  return <BrowserRouter><AuthProvider><PreferencesProvider><ToastProvider><AppRoutes /></ToastProvider></PreferencesProvider></AuthProvider></BrowserRouter>
}
