import { Link } from "react-router-dom"
import { BookOpen, Braces, Brain, ClipboardCheck, RotateCcw } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const destinations = [
  { to: "/trackers/subjects", title: "Subjects", description: "Plan courses, topics, assignments, and exam deadlines.", icon: BookOpen },
  { to: "/trackers/dsa", title: "DSA practice", description: "Track problems, patterns, accepted code, and review dates.", icon: Braces },
  { to: "/knowledge/recall", title: "Recall", description: "Review fading knowledge from memory before opening the source.", icon: RotateCcw },
  { to: "/knowledge/recall/comprehension", title: "Comprehension", description: "Confirm that shipped, AI-assisted work is understood.", icon: ClipboardCheck },
]

export function LearnPage() {
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Learn</p><h1 className="mt-2 text-3xl font-semibold text-foreground">Turn activity into durable understanding</h1><p className="mt-2 max-w-2xl text-secondary">Organize what you are studying, practice deliberately, then use recall and comprehension checks to retain it.</p></header>
    <div className="grid gap-4 sm:grid-cols-2">{destinations.map(({ to, title, description, icon: Icon }) => <Link key={to} to={to} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full transition group-hover:border-primary/50"><CardHeader><span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="text-sm font-medium text-primary">Open {title.toLowerCase()} <span aria-hidden="true">-&gt;</span></CardContent></Card></Link>)}</div>
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle p-4"><Brain className="mt-0.5 h-5 w-5 text-primary" /><p className="text-sm text-secondary">AI guidance is advisory. Recall and comprehension results change durable confidence only after you confirm the score or grade.</p></div>
  </div>
}
