import { Bot, Brain, Braces, ChartColumnIncreasing, FileText, FolderKanban, GraduationCap, Home, Library, Network, RotateCcw, Tags, type LucideIcon } from "lucide-react"

export type NavigationItem = { to: string; label: string; icon: LucideIcon; exact?: boolean }
export type NavigationGroup = { label: string; items: NavigationItem[] }

export const navigationGroups: NavigationGroup[] = [
  { label: "Home", items: [
    { to: "/app", label: "Home", icon: Home, exact: true },
    { to: "/app/insights", label: "Insights", icon: ChartColumnIncreasing },
  ] },
  { label: "Learn", items: [
    { to: "/learn", label: "Learn overview", icon: GraduationCap, exact: true },
    { to: "/trackers/subjects", label: "Subjects", icon: Library },
    { to: "/trackers/dsa", label: "DSA practice", icon: Braces },
    { to: "/knowledge/recall/comprehension", label: "Comprehension", icon: Brain },
    { to: "/knowledge/recall", label: "Recall", icon: RotateCcw },
  ] },
  { label: "Projects", items: [{ to: "/trackers/projects", label: "Projects", icon: FolderKanban }] },
  { label: "Library", items: [
    { to: "/library", label: "Library overview", icon: Library, exact: true },
    { to: "/knowledge/entities", label: "Notes", icon: FileText },
    { to: "/knowledge/graph", label: "Graph", icon: Network },
    { to: "/knowledge/tags", label: "Tags", icon: Tags },
  ] },
  { label: "AI Coach", items: [{ to: "/agents/assistant", label: "AI Coach", icon: Bot }] },
]

export const mobileDestinations: NavigationItem[] = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/learn", label: "Learn", icon: GraduationCap },
  { to: "/trackers/projects", label: "Projects", icon: FolderKanban },
  { to: "/library", label: "Library", icon: Library },
  { to: "/agents/assistant", label: "AI Coach", icon: Bot },
]

export const BrandIcon = Brain

export function routeMeta(pathname: string) {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if ((item.exact && pathname === item.to) || (!item.exact && pathname.startsWith(item.to))) return { title: item.label, group: group.label }
    }
  }
  if (pathname.startsWith("/settings")) return { title: "Settings", group: "Account" }
  if (pathname.startsWith("/admin")) return { title: "Administration", group: "Account" }
  if (pathname.startsWith("/insights/weekly")) return { title: "Weekly digest", group: "Home / Insights" }
  if (pathname.startsWith("/capture")) return { title: "Capture", group: "Workspace" }
  return { title: "Personal Dev KG", group: "Workspace" }
}
