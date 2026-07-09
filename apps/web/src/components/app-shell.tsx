import type { ReactNode } from "react"
import { Database, PanelsTopLeft } from "lucide-react"
import { Link } from "react-router-dom"

import type { Entity } from "@/lib/api"
import { EntityList } from "@/components/entities/entity-list"

type AppShellProps = {
  children: ReactNode
  entities: Entity[]
  activeEntityId?: string
}

export function AppShell({ children, entities, activeEntityId }: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid min-h-screen lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-zinc-800 bg-zinc-900 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <Link to="/" className="flex items-center gap-3 text-zinc-100">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <Database className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Personal Dev KG</p>
                <p className="font-mono text-xs text-zinc-500">Phase 0 foundation</p>
              </div>
            </Link>
            <PanelsTopLeft className="h-4 w-4 text-zinc-500" />
          </div>

          <div className="p-4">
            <EntityList
              entities={entities}
              activeEntityId={activeEntityId}
              title="Entity List"
              description="Captured entities are the only first-class content objects in Phase 0."
              compact
            />
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">Knowledge capture workspace</p>
                <p className="text-sm text-zinc-500">Hierarchy stays in parent references. Cross-cutting relationships stay in links.</p>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-400">
                No AI features enabled
              </div>
            </div>
          </header>

          <main className="flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
