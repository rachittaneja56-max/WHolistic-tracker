import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, BookOpen, CalendarClock, CheckCircle2, Clock3, ExternalLink, FileText, GraduationCap, History, ListChecks, Plus, RotateCcw, Timer } from "lucide-react"

import { ErrorState, LoadingSkeleton } from "@/components/page-state"
import { PageHeader } from "@/components/page-header"
import { useToast } from "@/components/toast-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  activityLabel,
  clampPercent,
  confidencePercent,
  daysUntil,
  entityDueDate,
  formatCompactDate,
  formatMinutes,
  metadataNumber,
  metadataString,
  relativeDeadline,
  subjectColor,
  subjectCourseLabel,
  subjectExamDate,
  subjectStatus,
  taskIsDone,
  taskIsOverdue,
  taskKind,
  taskStatus,
  topicProgress,
} from "@/features/subjects/subject-utils"
import { cn } from "@/lib/utils"
import { createSession, type Entity, type RecallDueItem, type SessionRecord } from "@/lib/api"
import { getSubjectOverview, type SubjectOverview, type SubjectSummaryMetrics } from "@/lib/system-api"

function fallbackSummary(overview: SubjectOverview): SubjectSummaryMetrics {
  const topics = overview.topics ?? []
  const tasks = overview.academic_tasks ?? overview.linked_entities?.task ?? []
  const completedTopics = topics.filter((topic) => topicProgress(topic) >= 100).length
  const openTasks = tasks.filter((task) => !taskIsDone(task))
  const taskDeadlines = openTasks.map(entityDueDate).filter((value): value is string => Boolean(value))
  const examDate = subjectExamDate(overview.subject)
  const nextDeadline = [...taskDeadlines, ...(examDate ? [examDate] : [])].sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null
  const progress = metadataNumber(overview.subject, "progress_percent")
    ?? (topics.length ? completedTopics / topics.length * 100 : 0)
  const mastery = topics.length
    ? topics.reduce((total, topic) => total + confidencePercent(topic.confidence_score), 0) / topics.length / 100
    : overview.subject.confidence_score
  return {
    topic_count: topics.length,
    completed_topic_count: completedTopics,
    open_task_count: openTasks.length,
    overdue_task_count: openTasks.filter(taskIsOverdue).length,
    due_review_count: overview.due_reviews?.length ?? 0,
    progress_percent: progress,
    mastery_score: mastery,
    grade_percent: metadataNumber(overview.subject, "grade_percent", "current_grade"),
    next_deadline: nextDeadline,
    planned_minutes_7d: 0,
    studied_minutes_7d: 0,
    last_studied_at: overview.recent_sessions?.[0]?.date ?? null,
  }
}

function badgeVariantForTask(task: Entity): "default" | "blue" | "success" | "warning" | "danger" {
  if (taskIsOverdue(task)) return "danger"
  if (taskIsDone(task)) return "success"
  const kind = taskKind(task).toLowerCase()
  if (kind === "exam") return "danger"
  if (kind === "quiz" || kind === "test") return "warning"
  if (kind === "assignment") return "blue"
  return "default"
}

function TaskList({ tasks, subjectId }: { tasks: Entity[]; subjectId: string }) {
  const sorted = useMemo(() => [...tasks].sort((left, right) => {
    if (taskIsDone(left) !== taskIsDone(right)) return taskIsDone(left) ? 1 : -1
    const leftDate = entityDueDate(left)
    const rightDate = entityDueDate(right)
    if (!leftDate && !rightDate) return (left.title ?? "").localeCompare(right.title ?? "")
    if (!leftDate) return 1
    if (!rightDate) return -1
    return new Date(leftDate).getTime() - new Date(rightDate).getTime()
  }), [tasks])

  return <Card className="overflow-hidden">
    <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-800 p-4">
      <div><CardTitle className="text-sm">Assignments & assessments</CardTitle><p className="mt-1 text-xs text-zinc-600">Work ordered by urgency</p></div>
      <Button asChild size="sm" variant="outline"><Link to={`/capture?type=task&parent_id=${subjectId}&academic_kind=assignment`}><Plus className="mr-1.5 h-3.5 w-3.5" />Add</Link></Button>
    </CardHeader>
    {sorted.length ? <div>
      <div className="hidden grid-cols-[minmax(190px,1fr)_100px_120px_90px] gap-3 border-b border-zinc-800 bg-zinc-950/70 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-600 sm:grid"><span>Work</span><span>Type</span><span>Due</span><span>Status</span></div>
      {sorted.map((task) => {
        const dueDate = entityDueDate(task)
        const dueDays = daysUntil(dueDate)
        const estimate = metadataNumber(task, "estimated_minutes", "duration_minutes")
        return <Link key={task.id} to={`/knowledge/entities/${task.id}`} className="grid gap-2 border-b border-zinc-800/80 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-zinc-950 sm:grid-cols-[minmax(190px,1fr)_100px_120px_90px] sm:items-center sm:gap-3">
          <div className="min-w-0"><p className={cn("truncate text-sm font-medium", taskIsDone(task) ? "text-zinc-500 line-through" : "text-zinc-100")}>{task.title ?? "Untitled work"}</p>{estimate !== null ? <p className="mt-0.5 text-[10px] text-zinc-600">{formatMinutes(estimate)} estimated</p> : null}</div>
          <div><Badge variant={badgeVariantForTask(task)} className="py-0.5 capitalize">{taskKind(task)}</Badge></div>
          <div><p className={cn("text-xs", dueDays !== null && dueDays < 0 && !taskIsDone(task) ? "text-red-300" : dueDays !== null && dueDays <= 3 && !taskIsDone(task) ? "text-amber-300" : "text-zinc-400")}>{relativeDeadline(dueDate)}</p>{dueDate ? <p className="mt-0.5 text-[10px] text-zinc-600">{formatCompactDate(dueDate, true)}</p> : null}</div>
          <span className="text-xs capitalize text-zinc-500">{taskStatus(task).split("_").join(" ")}</span>
        </Link>
      })}
    </div> : <CardContent className="p-6 text-center"><ListChecks className="mx-auto h-5 w-5 text-zinc-700" /><p className="mt-2 text-sm text-zinc-400">No academic work captured.</p><p className="mt-1 text-xs text-zinc-600">Add an assignment, quiz, or exam to see deadlines here.</p></CardContent>}
  </Card>
}

function TopicTable({ topics, dueReviews, subjectId }: { topics: Entity[]; dueReviews: RecallDueItem[]; subjectId: string }) {
  const reviewsById = useMemo(() => new Map(dueReviews.map((item) => [item.entity.id, item])), [dueReviews])
  const sorted = useMemo(() => [...topics].sort((left, right) => {
    const leftDue = reviewsById.has(left.id) ? 0 : 1
    const rightDue = reviewsById.has(right.id) ? 0 : 1
    return leftDue - rightDue || left.confidence_score - right.confidence_score || (left.title ?? "").localeCompare(right.title ?? "")
  }), [reviewsById, topics])

  return <Card className="overflow-hidden">
    <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-800 p-4">
      <div><CardTitle className="text-sm">Syllabus & mastery</CardTitle><p className="mt-1 text-xs text-zinc-600">Reviews and weak areas surface first</p></div>
      <Button asChild size="sm" variant="outline"><Link to={`/capture?type=subject_topic&parent_id=${subjectId}`}><Plus className="mr-1.5 h-3.5 w-3.5" />Topic</Link></Button>
    </CardHeader>
    {sorted.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] table-fixed border-collapse">
      <thead className="border-b border-zinc-800 bg-zinc-950/70 text-left text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="w-[34%] px-4 py-2">Topic</th><th className="w-[10%] px-3 py-2">Weight</th><th className="w-[14%] px-3 py-2">Progress</th><th className="w-[14%] px-3 py-2">Mastery</th><th className="w-[15%] px-3 py-2">Last studied</th><th className="w-[13%] px-3 py-2">Review</th></tr></thead>
      <tbody>{sorted.map((topic) => {
        const due = reviewsById.get(topic.id)
        const progress = topicProgress(topic)
        const mastery = confidencePercent(topic.confidence_score)
        const weight = metadataNumber(topic, "exam_weightage", "exam_weight")
        return <tr key={topic.id} className="h-12 border-b border-zinc-800/80 last:border-b-0 hover:bg-zinc-950">
          <td className="px-4 py-2"><Link to={`/knowledge/entities/${topic.id}`} className="block truncate rounded-sm text-sm font-medium text-zinc-200 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{topic.title ?? "Untitled topic"}</Link></td>
          <td className="px-3 py-2 font-mono text-xs text-zinc-500">{weight === null ? "—" : `${Math.round(weight)}%`}</td>
          <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-blue-500" style={{ width: `${progress}%` }} /></div><span className="font-mono text-[10px] text-zinc-500">{Math.round(progress)}%</span></div></td>
          <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800"><div className={cn("h-full", mastery < 50 ? "bg-amber-500" : "bg-teal-500")} style={{ width: `${mastery}%` }} /></div><span className={cn("font-mono text-[10px]", mastery < 50 ? "text-amber-300" : "text-zinc-500")}>{Math.round(mastery)}%</span></div></td>
          <td className="px-3 py-2 text-xs text-zinc-500">{topic.last_revisited_at ? formatCompactDate(topic.last_revisited_at) : "Never"}</td>
          <td className="px-3 py-2">{due ? <Link to="/knowledge/recall" className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Badge variant="warning" className="py-0.5">Due now</Badge></Link> : <span className="text-xs text-zinc-600">Clear</span>}</td>
        </tr>
      })}</tbody>
    </table></div> : <CardContent className="p-6 text-center"><BookOpen className="mx-auto h-5 w-5 text-zinc-700" /><p className="mt-2 text-sm text-zinc-400">No syllabus topics yet.</p><Button asChild size="sm" variant="outline" className="mt-3"><Link to={`/capture?type=subject_topic&parent_id=${subjectId}`}>Add first topic</Link></Button></CardContent>}
  </Card>
}

function RecentActivity({ sessions }: { sessions: SessionRecord[] }) {
  return <Card>
    <CardHeader className="border-b border-zinc-800 p-4"><CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4 text-zinc-500" />Recent study & activity</CardTitle></CardHeader>
    <CardContent className="p-0">{sessions.length ? sessions.slice(0, 10).map((session, index) => {
      const duration = typeof session.meta.duration_minutes === "number" ? session.meta.duration_minutes : null
      return <div key={session.id} className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-2.5 last:border-b-0">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", index === 0 ? "bg-blue-400" : "bg-zinc-700")} />
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">{activityLabel(session.action)}{duration !== null ? <span className="ml-2 font-mono text-zinc-500">{formatMinutes(duration)}</span> : null}</p>
        <time className="shrink-0 text-[10px] text-zinc-600" dateTime={session.date ?? undefined}>{session.date ? formatCompactDate(session.date, true) : "No date"}</time>
      </div>
    }) : <p className="p-5 text-sm text-zinc-500">No study activity recorded yet.</p>}</CardContent>
  </Card>
}

export function SubjectDetailPage() {
  const { subjectId } = useParams()
  const { show } = useToast()
  const [overview, setOverview] = useState<SubjectOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(25)
  const [loggingStudy, setLoggingStudy] = useState(false)
  const [planAt, setPlanAt] = useState("")
  const [planningStudy, setPlanningStudy] = useState(false)

  const load = useCallback(async () => {
    if (!subjectId) {
      setError("Subject id is missing.")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setOverview(await getSubjectOverview(subjectId))
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load this subject.")
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => { void load() }, [load])

  async function logStudy() {
    if (!subjectId || !overview) return
    setLoggingStudy(true)
    try {
      const session = await createSession({ entity_id: subjectId, action: "study_completed", meta: { duration_minutes: duration, source: "subject_tracker" } })
      setOverview((current) => {
        if (!current) return current
        const summary = current.summary ?? fallbackSummary(current)
        return { ...current, recent_sessions: [session, ...(current.recent_sessions ?? [])], summary: { ...summary, studied_minutes_7d: summary.studied_minutes_7d + duration, last_studied_at: session.date } }
      })
      show({ message: `${duration} minute study session logged.` }, 5000)
    } catch (value) {
      show({ message: value instanceof Error ? value.message : "Unable to log study time." })
    } finally {
      setLoggingStudy(false)
    }
  }

  async function planStudy() {
    if (!subjectId || !overview || !planAt) return
    const plannedFor = new Date(planAt)
    if (Number.isNaN(plannedFor.getTime()) || plannedFor.getTime() <= Date.now()) {
      show({ message: "Choose a future date and time for the study block." })
      return
    }
    setPlanningStudy(true)
    try {
      const session = await createSession({
        entity_id: subjectId,
        action: "study_planned",
        date: plannedFor.toISOString(),
        meta: { duration_minutes: duration, source: "subject_tracker" },
      })
      setOverview((current) => {
        if (!current) return current
        const summary = current.summary ?? fallbackSummary(current)
        const withinSevenDays = plannedFor.getTime() <= Date.now() + 7 * 86_400_000
        return {
          ...current,
          recent_sessions: [session, ...(current.recent_sessions ?? [])],
          summary: {
            ...summary,
            planned_minutes_7d: summary.planned_minutes_7d + (withinSevenDays ? duration : 0),
          },
        }
      })
      setPlanAt("")
      show({ message: `${duration} minute study block planned for ${formatCompactDate(session.date, true)}.` }, 5000)
    } catch (value) {
      show({ message: value instanceof Error ? value.message : "Unable to plan study time." })
    } finally {
      setPlanningStudy(false)
    }
  }

  if (loading) return <LoadingSkeleton rows={6} />
  if (error) return <div className="space-y-4"><Button asChild size="sm" variant="ghost"><Link to="/trackers/subjects"><ArrowLeft className="mr-1.5 h-4 w-4" />Subjects</Link></Button><ErrorState message={error} onRetry={() => void load()} /></div>
  if (!overview || !subjectId) return null

  const summary = overview.summary ?? fallbackSummary(overview)
  const tasks = overview.academic_tasks ?? overview.linked_entities?.task ?? []
  const topics = overview.topics ?? []
  const dueReviews = overview.due_reviews ?? []
  const weakTopics = overview.weak_topics ?? []
  const recentSessions = overview.recent_sessions ?? []
  const examDate = subjectExamDate(overview.subject)
  const deadline = summary.next_deadline ?? examDate
  const deadlineLabel = examDate && deadline === examDate ? "Exam" : "Next deadline"
  const linked = Object.entries(overview.linked_entities ?? {})
    .filter(([type]) => type !== "task")
    .flatMap(([, entities]) => entities)
    .filter((entity, index, entities) => entities.findIndex((candidate) => candidate.id === entity.id) === index)
  const studyCompletion = summary.planned_minutes_7d > 0 ? summary.studied_minutes_7d / summary.planned_minutes_7d * 100 : 0

  return <div className="space-y-5">
    <Link to="/trackers/subjects" className="inline-flex items-center gap-1.5 rounded-sm text-xs text-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ArrowLeft className="h-3.5 w-3.5" />All subjects</Link>
    <div className="border-l-4 pl-4" style={{ borderLeftColor: subjectColor(overview.subject) }}>
      <PageHeader
        title={overview.subject.title ?? "Untitled subject"}
        description={[subjectCourseLabel(overview.subject), deadline ? `${deadlineLabel} ${formatCompactDate(deadline)} · ${relativeDeadline(deadline)}` : "No upcoming deadline", summary.last_studied_at ? `Last studied ${formatCompactDate(summary.last_studied_at)}` : "Not studied yet"].filter(Boolean).join("  ·  ")}
        actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`/knowledge/entities/${overview.subject.id}`}>Edit subject</Link></Button><Button asChild variant="outline"><Link to={`/capture?type=subject_topic&parent_id=${overview.subject.id}`}><Plus className="mr-1.5 h-4 w-4" />Topic</Link></Button><Button asChild><Link to={`/capture?type=task&parent_id=${overview.subject.id}&academic_kind=assignment`}><Plus className="mr-1.5 h-4 w-4" />Assignment</Link></Button></div>}
      />
      <div className="-mt-3 flex flex-wrap gap-1.5"><Badge className="capitalize">{subjectStatus(overview.subject)}</Badge>{metadataString(overview.subject, "priority") ? <Badge variant={metadataString(overview.subject, "priority") === "high" ? "warning" : "default"} className="capitalize">{metadataString(overview.subject, "priority")} priority</Badge> : null}{deadline && daysUntil(deadline) !== null && (daysUntil(deadline) ?? 99) <= 7 ? <Badge variant={(daysUntil(deadline) ?? 0) < 0 ? "danger" : "warning"}>{relativeDeadline(deadline)}</Badge> : null}</div>
    </div>

    <section aria-label="Subject summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-3 xl:grid-cols-6">
      {[
        ["Syllabus", `${Math.round(clampPercent(summary.progress_percent))}%`, `${summary.completed_topic_count}/${summary.topic_count} topics`],
        ["Mastery", `${Math.round(confidencePercent(summary.mastery_score))}%`, weakTopics.length ? `${weakTopics.length} weak` : "On track"],
        ["Open work", summary.open_task_count, summary.overdue_task_count ? `${summary.overdue_task_count} overdue` : "No overdue"],
        ["Reviews", summary.due_review_count, summary.due_review_count ? "Due now" : "Clear"],
        ["Current grade", summary.grade_percent === null ? "—" : `${Math.round(summary.grade_percent)}%`, summary.grade_percent === null ? "Not tracked" : "Recorded work"],
        ["Study · 7d", formatMinutes(summary.studied_minutes_7d), `${formatMinutes(summary.planned_minutes_7d)} planned`],
      ].map(([label, value, note]) => <div key={String(label)} className="bg-zinc-950 px-4 py-3"><p className="text-[11px] text-zinc-500">{label}</p><p className={cn("mt-1 font-mono text-xl font-medium text-zinc-100", label === "Open work" && summary.overdue_task_count > 0 && "text-red-300", label === "Reviews" && summary.due_review_count > 0 && "text-amber-300")}>{value}</p><p className="mt-0.5 text-[10px] text-zinc-600">{note}</p></div>)}
    </section>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.75fr)]">
      <main className="min-w-0 space-y-4">
        <TaskList tasks={tasks} subjectId={subjectId} />
        <TopicTable topics={topics} dueReviews={dueReviews} subjectId={subjectId} />
        <RecentActivity sessions={recentSessions} />
      </main>

      <aside className="space-y-4">
        <Card>
          <CardHeader className="border-b border-zinc-800 p-4"><CardTitle className="flex items-center gap-2 text-sm"><Timer className="h-4 w-4 text-violet-400" />Study plan</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-4">
            <div><div className="flex items-end justify-between gap-3"><div><p className="font-mono text-lg text-zinc-100">{formatMinutes(summary.studied_minutes_7d)}</p><p className="text-[10px] text-zinc-600">studied this week</p></div><p className="text-xs text-zinc-500">of {formatMinutes(summary.planned_minutes_7d)} planned</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-violet-500" style={{ width: `${clampPercent(studyCompletion)}%` }} /></div></div>
            <fieldset><legend className="mb-2 text-xs text-zinc-500">Session duration</legend><div className="flex flex-wrap gap-1.5">{[15, 25, 45, 60].map((minutes) => <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => setDuration(minutes)} className={cn("h-8 rounded-md border px-2.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500", duration === minutes ? "border-violet-500/50 bg-violet-500/10 text-violet-200" : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200")}>{minutes}m</button>)}</div><Button className="mt-2 w-full bg-violet-600 hover:bg-violet-500" size="sm" disabled={loggingStudy || planningStudy} onClick={() => void logStudy()}><Clock3 className="mr-1.5 h-3.5 w-3.5" />{loggingStudy ? "Logging…" : `Log ${duration} minutes now`}</Button></fieldset>
            <fieldset className="border-t border-zinc-800 pt-3"><legend className="px-1 text-xs text-zinc-500">Plan a study block</legend><div className="mt-2 flex gap-2"><label htmlFor="study-plan-at" className="sr-only">Study block date and time</label><Input id="study-plan-at" type="datetime-local" className="h-8 min-w-0 text-xs" value={planAt} onChange={(event) => setPlanAt(event.target.value)} /><Button size="sm" variant="outline" disabled={!planAt || planningStudy || loggingStudy} onClick={() => void planStudy()}>{planningStudy ? "Planning…" : "Plan"}</Button></div></fieldset>
            <div className="border-t border-zinc-800 pt-3"><p className="mb-2 text-xs font-medium text-zinc-300">Next best topics</p>{weakTopics.length ? <ol className="space-y-1">{weakTopics.slice(0, 5).map((topic, index) => <li key={topic.id}><Link to={`/knowledge/entities/${topic.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="font-mono text-[10px] text-zinc-600">{index + 1}</span><span className="min-w-0 flex-1 truncate text-zinc-300">{topic.title ?? "Untitled topic"}</span><span className="font-mono text-[10px] text-amber-300">{Math.round(confidencePercent(topic.confidence_score))}%</span></Link></li>)}</ol> : <div className="flex items-center gap-2 rounded-md bg-teal-500/5 p-2 text-xs text-teal-300"><CheckCircle2 className="h-4 w-4" />No weak topics detected.</div>}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-800 p-4"><CardTitle className="flex items-center gap-2 text-sm"><RotateCcw className="h-4 w-4 text-amber-400" />Reviews due</CardTitle>{dueReviews.length ? <Badge variant="warning" className="py-0.5">{dueReviews.length}</Badge> : null}</CardHeader>
          <CardContent className="p-0">{dueReviews.length ? dueReviews.slice(0, 6).map((item) => <Link key={item.entity.id} to="/knowledge/recall" className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-2.5 last:border-b-0 hover:bg-zinc-950"><span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" /><span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{item.entity.title ?? "Untitled topic"}</span><span className="font-mono text-[10px] text-amber-300">{item.due_score.toFixed(1)}</span></Link>) : <div className="flex items-center gap-2 p-4 text-xs text-teal-300"><CheckCircle2 className="h-4 w-4" />Review queue is clear.</div>}</CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-zinc-800 p-4"><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4 text-blue-400" />Quick capture</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 p-3">
            <Link to={`/capture?type=task&parent_id=${subjectId}&academic_kind=assignment`} className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 hover:border-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><FileText className="mb-2 h-4 w-4 text-blue-400" />Assignment</Link>
            <Link to={`/capture?type=task&parent_id=${subjectId}&academic_kind=exam`} className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 hover:border-red-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><GraduationCap className="mb-2 h-4 w-4 text-red-400" />Exam</Link>
            <Link to={`/capture?type=subject_topic&parent_id=${subjectId}`} className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 hover:border-teal-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><BookOpen className="mb-2 h-4 w-4 text-teal-400" />Topic</Link>
            <Link to="/knowledge/recall" className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 hover:border-amber-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><RotateCcw className="mb-2 h-4 w-4 text-amber-400" />Start review</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-800 p-4"><CardTitle className="text-sm">Resources & connections</CardTitle><span className="font-mono text-[10px] text-zinc-600">{linked.length}</span></CardHeader>
          <CardContent className="p-0">{linked.length ? linked.slice(0, 8).map((entity) => <Link key={entity.id} to={`/knowledge/entities/${entity.id}`} className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5 text-xs last:border-b-0 hover:bg-zinc-950"><span className="min-w-0 flex-1 truncate text-zinc-300">{entity.title ?? "Untitled resource"}</span><Badge className="py-0.5">{entity.type}</Badge><ExternalLink className="h-3 w-3 text-zinc-700" /></Link>) : <p className="p-4 text-xs text-zinc-600">No linked notes, concepts, or problems yet.</p>}</CardContent>
        </Card>

        {summary.overdue_task_count > 0 ? <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Resolve {summary.overdue_task_count} overdue {summary.overdue_task_count === 1 ? "item" : "items"} before adding more study load.</div> : null}
      </aside>
    </div>
  </div>
}
