import type { ReactNode } from "react"
import { BookOpenText, Brain, ChartColumnIncreasing, Database, Inbox, LayoutGrid, Library, Lightbulb, ListChecks, MessageSquareText, Network, NotebookPen, RotateCcw, ShieldCheck, SunMedium, Tags } from "lucide-react"
import { Link, NavLink } from "react-router-dom"

import type { Entity } from "@/lib/api"
import { EntityList } from "@/features/entities/components/entity-list"
import { cn } from "@/lib/utils"

type AppShellProps = {
  children: ReactNode
  entities: Entity[]
  activeEntityId?: string
  isEntitiesLoading: boolean
  entitiesError: string | null
  onRetry: () => void
}

const navigationItems = [
  { to: "/", label: "Today", icon: SunMedium },
  { to: "/weekly", label: "Weekly", icon: BookOpenText },
  { to: "/analyst", label: "Analyst", icon: ChartColumnIncreasing },
  { to: "/capture", label: "Capture", icon: NotebookPen },
  { to: "/ideas", label: "Ideas", icon: Lightbulb },
  { to: "/dsa", label: "DSA", icon: LayoutGrid },
  { to: "/projects", label: "Projects", icon: ListChecks },
  { to: "/subjects", label: "Subjects", icon: Library },
  { to: "/tags", label: "Tags", icon: Tags },
  { to: "/graph", label: "Graph", icon: Network },
  { to: "/recall", label: "Recall", icon: RotateCcw },
  { to: "/comprehension-debt", label: "Comprehension Debt", icon: ShieldCheck },
  { to: "/ask-graph", label: "Ask Graph", icon: MessageSquareText },
  { to: "/review-inbox", label: "Review Inbox", icon: Inbox },
  { to: "/entities", label: "All Entities", icon: Database },
]

export function AppShell({ children, entities, activeEntityId, isEntitiesLoading, entitiesError, onRetry }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      <div className="grid min-h-screen lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-zinc-800 bg-zinc-900 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <Link to="/" className="flex items-center gap-3 text-zinc-100">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <Brain className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">Personal Dev KG</p>
                <p className="font-mono text-xs text-zinc-500">Phase 5 weekly sensemaking</p>
              </div>
            </Link>
          </div>

          <div className="space-y-6 p-4">
            <nav className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100",
                        isActive && "border-blue-500/50 text-zinc-100",
                      )
                    }
                  >
                    <Icon className="h-4 w-4 text-zinc-500" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            <EntityList
              entities={entities.slice(0, 8)}
              activeEntityId={activeEntityId}
              title="Recent Entities"
              description="Entities stay shared across trackers, graph links stay separate from parent hierarchy, and agent suggestions wait for review." 
              compact
              isLoading={isEntitiesLoading}
              errorMessage={entitiesError}
              onRetry={onRetry}
            />
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-zinc-100">Knowledge graph workspace</p>
                <p className="text-sm text-zinc-500">Daily guidance, weekly digests, taxonomy gaps, and graph-scoped answers stay grounded in your own entities, links, reviews, and sessions.</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-500">
                Embeddings retrieve, agents suggest, users confirm
              </div>
            </div>
          </header>

          <main className="flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
