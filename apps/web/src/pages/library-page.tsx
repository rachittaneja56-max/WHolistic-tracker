import { Link } from "react-router-dom"
import { FileText, Network, Tags } from "lucide-react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const destinations = [
  { to: "/knowledge/entities", title: "Notes", description: "Browse and edit the items in your learning workspace.", icon: FileText },
  { to: "/knowledge/graph", title: "Graph", description: "Inspect confirmed connections and supporting context.", icon: Network },
  { to: "/knowledge/tags", title: "Tags", description: "Move through your workspace by topic and pattern.", icon: Tags },
]

export function LibraryPage() {
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Library</p><h1 className="mt-2 text-3xl font-semibold text-foreground">Find the knowledge behind your work</h1><p className="mt-2 max-w-2xl text-secondary">Notes are the source of truth. Graph links and tags are ways to navigate them, not separate silos.</p></header>
    <div className="grid gap-4 md:grid-cols-3">{destinations.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full transition group-hover:border-primary/50"><CardHeader><Icon className="mb-4 h-6 w-6 text-primary" /><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader></Card></Link>)}</div>
  </div>
}
