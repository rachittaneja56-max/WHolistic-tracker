import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatExamDate, getEntityExamDate } from "@/features/entities/metadata"
import { getSubjectOverview, type SubjectOverview } from "@/lib/system-api"

const tabs = ["Overview", "Topics", "Linked Entities", "Reviews Due", "Study Plan", "Recent Activity"] as const

export function SubjectDetailPage() {
  const { subjectId } = useParams()
  const [overview, setOverview] = useState<SubjectOverview | null>(null)
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (subjectId) void getSubjectOverview(subjectId).then(setOverview).catch((value) => setError(value instanceof Error ? value.message : "Unable to load subject.")) }, [subjectId])
  const metadata = overview?.subject.metadata ?? {}
  const linked = useMemo(() => Object.values(overview?.linked_entities ?? {}).flat(), [overview])

  if (error) return <p className="rounded-md border border-red-500/30 p-4 text-red-300">{error}</p>
  if (!overview) return <div className="space-y-3">{[1,2,3].map((item) => <div key={item} className="h-24 animate-pulse rounded-md border border-zinc-800 bg-zinc-900" />)}</div>

  return <div>
    <PageHeader title={overview.subject.title ?? "Untitled subject"} description={`Exam ${formatExamDate(getEntityExamDate(overview.subject))}`} actions={<Button asChild variant="outline"><Link to={`/capture?type=subject_topic&parent_id=${overview.subject.id}`}>Capture Topic</Link></Button>} />
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-800">{tabs.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${activeTab === tab ? "border-blue-400 text-zinc-100" : "border-transparent text-zinc-500"}`}>{tab}</button>)}</div>
    {activeTab === "Overview" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[["Status", metadata.status ?? "active"], ["Priority", metadata.priority ?? "medium"], ["Progress", `${metadata.progress_percent ?? 0}%`], ["Target confidence", metadata.target_confidence ?? 0.8], ["Planned sessions", metadata.study_sessions_planned ?? 0], ["Syllabus units", Array.isArray(metadata.syllabus_units) ? metadata.syllabus_units.length : 0]].map(([label,value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-zinc-500">{String(label)}</p><p className="mt-2 font-mono text-zinc-100">{String(value)}</p></CardContent></Card>)}</div> : null}
    {activeTab === "Topics" ? <Card><CardHeader><CardTitle>Topics</CardTitle></CardHeader><CardContent className="space-y-2">{overview.topics.length ? overview.topics.map((topic) => <Link key={topic.id} to={`/knowledge/entities/${topic.id}`} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 p-3"><span className="text-zinc-100">{topic.title}</span><span className="font-mono text-xs text-zinc-500">confidence {topic.confidence_score.toFixed(2)} ? weight {String(topic.metadata.exam_weightage ?? "?")}</span></Link>) : <p className="text-sm text-zinc-500">No child topics yet.</p>}</CardContent></Card> : null}
    {activeTab === "Linked Entities" ? <Card><CardHeader><CardTitle>Confirmed linked entities</CardTitle></CardHeader><CardContent className="space-y-2">{linked.length ? linked.map((entity) => <Link key={entity.id} to={`/knowledge/entities/${entity.id}`} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 p-3"><span>{entity.title}</span><Badge>{entity.type}</Badge></Link>) : <p className="text-sm text-zinc-500">No confirmed linked notes, TILs, problems, concepts, or tasks.</p>}</CardContent></Card> : null}
    {activeTab === "Reviews Due" ? <Card><CardHeader><CardTitle>Reviews Due</CardTitle></CardHeader><CardContent className="space-y-2">{overview.due_reviews.length ? overview.due_reviews.map((item) => <Link key={item.entity.id} to="/knowledge/recall" className="block rounded-md border border-amber-500/30 bg-amber-500/5 p-3"><span className="text-zinc-100">{item.entity.title}</span><span className="ml-3 font-mono text-xs text-amber-300">due {item.due_score.toFixed(2)}</span></Link>) : <p className="text-sm text-zinc-500">Nothing due in this subject.</p>}</CardContent></Card> : null}
    {activeTab === "Study Plan" ? <Card><CardHeader><CardTitle>Deterministic study plan</CardTitle></CardHeader><CardContent><p className="text-sm text-zinc-300">Plan {String(metadata.study_sessions_planned ?? 0)} sessions around the weakest topics first.</p><ol className="mt-4 space-y-2">{overview.weak_topics.map((topic, index) => <li key={topic.id} className="rounded-md border border-amber-500/20 bg-zinc-950 p-3"><span className="mr-3 font-mono text-xs text-amber-300">{index + 1}</span>{topic.title} <span className="font-mono text-xs text-zinc-500">({topic.confidence_score.toFixed(2)})</span></li>)}</ol></CardContent></Card> : null}
    {activeTab === "Recent Activity" ? <Card><CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader><CardContent className="space-y-2">{overview.recent_sessions.map((session) => <div key={session.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3"><span className="font-mono text-xs text-zinc-500">{session.action} ? {session.date ? new Date(session.date).toLocaleString() : "No timestamp"}</span></div>)}</CardContent></Card> : null}
  </div>
}

