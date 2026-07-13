import { Bot, Brain, ChartColumnIncreasing, Database, Inbox, LayoutGrid, Library, Lightbulb, ListChecks, MessageSquareText, Network, NotebookPen, RotateCcw, Settings, SunMedium, Tags, type LucideIcon } from "lucide-react"

export type NavigationItem = { to: string; label: string; icon: LucideIcon; exact?: boolean }
export type NavigationGroup = { label: string; items: NavigationItem[] }

export const navigationGroups: NavigationGroup[] = [
  { label: "Capture", items: [{ to: "/capture", label: "Capture", icon: NotebookPen }] },
  { label: "Today", items: [{ to: "/", label: "Today", icon: SunMedium, exact: true }] },
  { label: "Trackers", items: [
    { to: "/trackers/dsa", label: "DSA", icon: LayoutGrid },
    { to: "/trackers/projects", label: "Projects", icon: ListChecks },
    { to: "/trackers/subjects", label: "Subjects", icon: Library },
  ] },
  { label: "Knowledge", items: [
    { to: "/knowledge/entities", label: "All Entities", icon: Database },
    { to: "/knowledge/graph", label: "Graph", icon: Network },
    { to: "/knowledge/tags", label: "Tags", icon: Tags },
    { to: "/knowledge/recall", label: "Recall", icon: RotateCcw },
  ] },
  { label: "Agents", items: [
    { to: "/agents/assistant", label: "Central AI", icon: Bot },
    { to: "/agents/ask-graph", label: "Ask Graph", icon: MessageSquareText },
    { to: "/agents/review-inbox", label: "Review Inbox", icon: Inbox },
    { to: "/agents/ideas", label: "Ideas", icon: Lightbulb },
    { to: "/agents/analyst", label: "Analyst", icon: ChartColumnIncreasing },
  ] },
  { label: "System", items: [{ to: "/settings", label: "Settings", icon: Settings }] },
]

export const BrandIcon = Brain

export function routeMeta(pathname: string) {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if ((item.exact && pathname === item.to) || (!item.exact && pathname.startsWith(item.to))) {
        return { title: item.label, group: group.label }
      }
    }
  }
  if (pathname.startsWith("/insights/weekly")) return { title: "Weekly Digest", group: "Insights" }
  if (pathname.startsWith("/knowledge/recall/comprehension")) return { title: "Comprehension Checks", group: "Knowledge" }
  return { title: "Personal Dev KG", group: "Workspace" }
}
