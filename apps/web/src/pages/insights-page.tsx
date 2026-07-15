import { Link } from "react-router-dom"
import { ArrowRight, ChartColumnIncreasing, CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GithubAnalyticsPanel } from "@/components/github-analytics-panel"

export function InsightsPage() {
  return <div className="space-y-6">
    <header><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Home / Insights</p><h1 className="mt-2 text-3xl font-semibold text-foreground">See patterns without crowding today</h1><p className="mt-2 max-w-2xl text-secondary">Weekly reporting, GitHub signals, and gap analysis live here so Home can stay focused on the next useful action.</p></header>
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CalendarDays className="mb-3 h-5 w-5 text-primary" /><CardTitle>Weekly digest</CardTitle><CardDescription>Review wins, fading topics, connections, and upcoming deadlines.</CardDescription><Button asChild variant="outline" className="mt-4 w-fit"><Link to="/insights/weekly">Open digest <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardHeader></Card>
      <Card><CardHeader><ChartColumnIncreasing className="mb-3 h-5 w-5 text-primary" /><CardTitle>Learning analyst</CardTitle><CardDescription>Inspect grounded trends and review suggestions before capturing anything.</CardDescription><Button asChild variant="outline" className="mt-4 w-fit"><Link to="/agents/analyst">Open analyst <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardHeader></Card>
    </div>
    <GithubAnalyticsPanel />
  </div>
}
