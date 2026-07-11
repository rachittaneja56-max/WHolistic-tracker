import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getEntities, type Entity } from "@/lib/api"

type Filter = "all" | "exam-soon" | "low-confidence" | "active" | "completed"
const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }

function dateOnly(value: unknown) {
  if (typeof value !== "string") return null
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}
function daysToExam(entity: Entity) {
  const exam = dateOnly(entity.metadata.exam_date)
  if (!exam) return null
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((exam.getTime() - today.getTime()) / 86400000)
}
function countdown(entity: Entity) {
  const days = daysToExam(entity)
  if (days === null) return "No exam date"
  if (days === 0) return "Exam today"
  if (days < 0) return "Exam passed"
  return `${days} days left`
}
function metaString(entity: Entity, key: string, fallback: string) {
  return typeof entity.metadata[key] === "string" ? String(entity.metadata[key]) : fallback
}
function metaNumber(entity: Entity, key: string, fallback: number) {
  return typeof entity.metadata[key] === "number" ? Number(entity.metadata[key]) : fallback
}

export function UpgradedSubjectsPage() {
  const [subjects, setSubjects] = useState<Entity[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void getEntities({ type: "subject_topic", limit: 500 }).then((items) => setSubjects(items.filter((item) => item.parent_id === null))).catch((value) => setError(value instanceof Error ? value.message : "Unable to load subjects.")) }, [])

  const filtered = useMemo(() => subjects.filter((subject) => {
    const status = metaString(subject, "status", "active")
    const target = metaNumber(subject, "target_confidence", 0.8)
    const days = daysToExam(subject)
    if (filter === "active") return status === "active"
    if (filter === "completed") return status === "completed"
    if (filter === "exam-soon") return days !== null && days >= 0 && days <= 14
    if (filter === "low-confidence") return subject.confidence_score < target
    return true
  }).sort((left, right) => {
    const leftActive = metaString(left, "status", "active") === "active" ? 0 : 1
    const rightActive = metaString(right, "status", "active") === "active" ? 0 : 1
    if (leftActive !== rightActive) return leftActive - rightActive
    const leftDays = daysToExam(left), rightDays = daysToExam(right)
    const leftDate = leftDays !== null && leftDays >= 0 ? leftDays : Number.MAX_SAFE_INTEGER
    const rightDate = rightDays !== null && rightDays >= 0 ? rightDays : Number.MAX_SAFE_INTEGER
    if (leftDate !== rightDate) return leftDate - rightDate
    const priority = (priorityRank[metaString(left, "priority", "medium")] ?? 1) - (priorityRank[metaString(right, "priority", "medium")] ?? 1)
    return priority || (left.title ?? "").localeCompare(right.title ?? "")
  }), [filter, subjects])

  return <div>
    <PageHeader title="Subjects" description="Courses and topics remain entities; hierarchy uses parent_id and relationships use confirmed links." actions={<Button asChild><Link to="/capture?type=subject_topic">Capture Subject</Link></Button>} />
    <div className="mb-6 flex flex-wrap gap-2">{(["all","exam-soon","low-confidence","active","completed"] as Filter[]).map((item) => <Button key={item} size="sm" variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)}>{item.replace("-", " ")}</Button>)}</div>
    {error ? <p className="rounded-md border border-red-500/30 p-4 text-red-300">{error}</p> : null}
    {!error && subjects.length === 0 ? <Card><CardContent className="p-8 text-center"><p className="text-zinc-300">No subjects captured yet.</p><Button asChild className="mt-4"><Link to="/capture?type=subject_topic">Capture your first subject</Link></Button></CardContent></Card> : null}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((subject) => {
      const progress = metaNumber(subject, "progress_percent", 0)
      const target = metaNumber(subject, "target_confidence", 0.8)
      return <Link key={subject.id} to={`/trackers/subjects/${subject.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Card className="h-full hover:border-blue-500/40"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle>{subject.title ?? "Untitled subject"}</CardTitle><Badge variant={daysToExam(subject) !== null && (daysToExam(subject) ?? 99) <= 14 ? "warning" : "default"}>{countdown(subject)}</Badge></div></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Badge>{metaString(subject, "status", "active")}</Badge><Badge variant={metaString(subject, "priority", "medium") === "high" ? "warning" : "default"}>{metaString(subject, "priority", "medium")}</Badge></div>
        <div><div className="mb-2 flex justify-between font-mono text-xs text-zinc-500"><span>Progress</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div></div>
        <div className="grid grid-cols-2 gap-3 font-mono text-xs text-zinc-500"><span>confidence {subject.confidence_score.toFixed(2)} / {target.toFixed(2)}</span><span>sessions {metaNumber(subject, "study_sessions_planned", 0)}</span></div>
      </CardContent></Card></Link>
    })}</div>
  </div>
}
