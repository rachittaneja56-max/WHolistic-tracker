import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BookOpen, ChevronRight, Clock3, Plus, Search } from "lucide-react"

import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/page-state"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  clampPercent,
  confidencePercent,
  daysUntil,
  formatMinutes,
  metadataString,
  parseTrackerDate,
  relativeDeadline,
  subjectColor,
  subjectCourseLabel,
  subjectExamDate,
  subjectStatus,
} from "@/features/subjects/subject-utils"
import { cn } from "@/lib/utils"
import { getSubjectTracker, type SubjectTrackerSummary } from "@/lib/system-api"

type Filter = "all" | "at-risk" | "exam-soon" | "low-mastery" | "completed"
type SortKey = "subject" | "deadline" | "tasks" | "progress" | "mastery" | "reviews" | "grade" | "study"
type SortDirection = "asc" | "desc"

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "at-risk", label: "At risk" },
  { value: "exam-soon", label: "Exam soon" },
  { value: "low-mastery", label: "Low mastery" },
  { value: "completed", label: "Completed" },
]

function isCompleted(row: SubjectTrackerSummary) {
  return subjectStatus(row.subject) === "completed" || row.progress_percent >= 100
}

function isExamSoon(row: SubjectTrackerSummary) {
  const days = daysUntil(subjectExamDate(row.subject) ?? row.next_deadline)
  return days !== null && days >= 0 && days <= 14
}

function isAtRisk(row: SubjectTrackerSummary) {
  if (isCompleted(row)) return false
  return row.overdue_task_count > 0
    || row.due_review_count > 0
    || (row.open_task_count > 0 && confidencePercent(row.mastery_score) < 60)
}

function matchesFilter(row: SubjectTrackerSummary, filter: Filter) {
  if (filter === "at-risk") return isAtRisk(row)
  if (filter === "exam-soon") return isExamSoon(row)
  if (filter === "low-mastery") return !isCompleted(row) && confidencePercent(row.mastery_score) < 60
  if (filter === "completed") return isCompleted(row)
  return true
}

function sortValue(row: SubjectTrackerSummary, key: SortKey): string | number | null {
  if (key === "subject") return row.subject.title?.toLocaleLowerCase() ?? ""
  if (key === "deadline") return parseTrackerDate(row.next_deadline)?.getTime() ?? null
  if (key === "tasks") return row.open_task_count
  if (key === "progress") return row.progress_percent
  if (key === "mastery") return confidencePercent(row.mastery_score)
  if (key === "reviews") return row.due_review_count
  if (key === "grade") return row.grade_percent
  return row.studied_minutes_7d
}

function SortButton({ label, sortKey, activeKey, direction, onSort }: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === activeKey
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return <button
    type="button"
    className="inline-flex items-center gap-1 rounded-sm py-1 text-left hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    onClick={() => onSort(sortKey)}
  >
    {label}<Icon className={cn("h-3 w-3", active ? "text-primary" : "text-muted-foreground")} />
  </button>
}

function ProgressCell({ value, tone = "blue" }: { value: number; tone?: "blue" | "teal" }) {
  const progress = clampPercent(value)
  return <div className="min-w-[84px]">
    <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[11px] text-secondary">
      <span>{Math.round(progress)}%</span>
    </div>
    <div className="h-1 overflow-hidden rounded-full bg-surface-subtle">
      <div className={cn("h-full rounded-full", tone === "teal" ? "bg-teal-500" : "bg-primary")} style={{ width: `${progress}%` }} />
    </div>
  </div>
}

function SubjectMobileRow({ row }: { row: SubjectTrackerSummary }) {
  const subject = row.subject
  const deadlineDays = daysUntil(row.next_deadline)
  return <article className="border-b border-border p-3 last:border-b-0">
    <div className="flex items-start justify-between gap-3">
      <Link to={`/trackers/subjects/${subject.id}`} className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-1 shrink-0 rounded-full" style={{ backgroundColor: subjectColor(subject) }} />
          <span className="truncate text-sm font-medium text-foreground">{subject.title ?? "Untitled subject"}</span>
        </div>
        <p className="ml-3 mt-1 truncate text-[11px] text-muted-foreground">{subjectCourseLabel(subject) ?? subjectStatus(subject)}</p>
      </Link>
      <div className="text-right">
        <p className={cn("whitespace-nowrap text-xs font-medium", deadlineDays !== null && deadlineDays < 0 ? "text-danger" : deadlineDays !== null && deadlineDays <= 7 ? "text-warning" : "text-secondary")}>{relativeDeadline(row.next_deadline)}</p>
        {row.next_deadline ? <p className="mt-0.5 text-[10px] text-muted-foreground">next deadline</p> : null}
      </div>
    </div>
    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
      {[
        ["Open", row.open_task_count],
        ["Progress", `${Math.round(clampPercent(row.progress_percent))}%`],
        ["Mastery", `${Math.round(confidencePercent(row.mastery_score))}%`],
        ["Reviews", row.due_review_count],
      ].map(([label, value]) => <div key={label} className="rounded-md bg-surface px-1.5 py-2"><p className="font-mono text-xs text-foreground">{value}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p></div>)}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2">
      <p className="text-[11px] text-muted-foreground">{formatMinutes(row.studied_minutes_7d)} / {formatMinutes(row.planned_minutes_7d)} this week</p>
      <div className="flex gap-1">
        <Button asChild size="sm" variant="ghost"><Link to={`/capture?type=task&parent_id=${subject.id}`}><Plus className="mr-1 h-3.5 w-3.5" />Task</Link></Button>
        <Button asChild size="sm" variant="ghost"><Link to={`/trackers/subjects/${subject.id}`}>Open<ChevronRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
      </div>
    </div>
  </article>
}

export function UpgradedSubjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<SubjectTrackerSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const rawFilter = searchParams.get("filter")
  const filter = filters.some((item) => item.value === rawFilter) ? rawFilter as Filter : "all"
  const query = searchParams.get("q") ?? ""
  const rawSort = searchParams.get("sort")
  const sortKey = (["subject", "deadline", "tasks", "progress", "mastery", "reviews", "grade", "study"] as SortKey[]).includes(rawSort as SortKey) ? rawSort as SortKey : "deadline"
  const direction: SortDirection = searchParams.get("direction") === "desc" ? "desc" : "asc"

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await getSubjectTracker())
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load the subject tracker.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function setParam(key: string, value: string, defaultValue = "") {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (!value || value === defaultValue) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  function setSort(key: SortKey) {
    const nextDirection = sortKey === key && direction === "asc" ? "desc" : "asc"
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (key === "deadline") next.delete("sort")
      else next.set("sort", key)
      if (nextDirection === "asc") next.delete("direction")
      else next.set("direction", nextDirection)
      return next
    }, { replace: true })
  }

  const searchedRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return rows
    return rows.filter(({ subject }) => [subject.title, subjectCourseLabel(subject), ...subject.tags]
      .some((value) => value?.toLocaleLowerCase().includes(needle)))
  }, [query, rows])

  const filterCounts = useMemo(() => Object.fromEntries(filters.map((item) => [item.value, searchedRows.filter((row) => matchesFilter(row, item.value)).length])) as Record<Filter, number>, [searchedRows])

  const visibleRows = useMemo(() => searchedRows.filter((row) => matchesFilter(row, filter)).sort((left, right) => {
    const leftValue = sortValue(left, sortKey)
    const rightValue = sortValue(right, sortKey)
    if (leftValue === null && rightValue === null) return 0
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    const comparison = typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : Number(leftValue) - Number(rightValue)
    return comparison * (direction === "asc" ? 1 : -1)
  }), [direction, filter, searchedRows, sortKey])

  const totals = useMemo(() => rows.reduce((current, row) => ({
    active: current.active + (isCompleted(row) ? 0 : 1),
    open: current.open + row.open_task_count,
    overdue: current.overdue + row.overdue_task_count,
    reviews: current.reviews + row.due_review_count,
    planned: current.planned + row.planned_minutes_7d,
    studied: current.studied + row.studied_minutes_7d,
  }), { active: 0, open: 0, overdue: 0, reviews: 0, planned: 0, studied: 0 }), [rows])

  return <div className="space-y-5">
    <PageHeader
      title="Subject tracker"
      description="Deadlines, syllabus coverage, mastery, and weekly study load in one operational view."
      actions={<Button asChild><Link to="/capture?type=subject_topic"><Plus className="mr-2 h-4 w-4" />Add subject</Link></Button>}
    />

    {!loading && !error && rows.length > 0 ? <section aria-label="Subject workload summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-surface-subtle sm:grid-cols-3 xl:grid-cols-6">
      {[
        ["Active subjects", totals.active, null],
        ["Open tasks", totals.open, null],
        ["Overdue", totals.overdue, totals.overdue > 0 ? "danger" : null],
        ["Reviews due", totals.reviews, totals.reviews > 0 ? "warning" : null],
        ["Planned / 7d", formatMinutes(totals.planned), null],
        ["Studied / 7d", formatMinutes(totals.studied), null],
      ].map(([label, value, tone]) => <div key={String(label)} className="bg-background px-4 py-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-mono text-xl font-medium text-foreground", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{value}</p>
      </div>)}
    </section> : null}

    {!loading && !error && rows.length > 0 ? <section aria-label="Subject filters" className="rounded-xl border border-border bg-surface/40 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full xl:max-w-sm">
          <label htmlFor="subject-search" className="sr-only">Search subjects</label>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input id="subject-search" className="h-9 pl-9" placeholder="Search subjects, codes, or tags" value={query} onChange={(event) => setParam("q", event.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 xl:pb-0">
          {filters.map((item) => <button
            type="button"
            key={item.value}
            aria-pressed={filter === item.value}
            onClick={() => setParam("filter", item.value, "all")}
            className={cn("inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", filter === item.value ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-secondary hover:text-foreground")}
          >{item.label}<span className="font-mono text-[10px] text-muted-foreground">{filterCounts[item.value]}</span></button>)}
        </div>
      </div>
    </section> : null}

    {loading ? <LoadingSkeleton rows={6} /> : null}
    {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    {!loading && !error && rows.length === 0 ? <EmptyState title="No subjects yet" description="Add a subject to start tracking deadlines, topics, and study time." action={<Button asChild><Link to="/capture?type=subject_topic">Add your first subject</Link></Button>} /> : null}

    {!loading && !error && rows.length > 0 ? <section className="overflow-hidden rounded-xl border border-border bg-background" aria-label="Subjects">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1040px] table-fixed border-collapse">
          <thead className="border-b border-border bg-surface/70 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-[25%] px-3 py-1.5"><SortButton label="Subject" sortKey="subject" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[13%] px-3 py-1.5"><SortButton label="Next deadline" sortKey="deadline" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[8%] px-3 py-1.5"><SortButton label="Open" sortKey="tasks" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[11%] px-3 py-1.5"><SortButton label="Syllabus" sortKey="progress" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[11%] px-3 py-1.5"><SortButton label="Mastery" sortKey="mastery" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[8%] px-3 py-1.5"><SortButton label="Reviews" sortKey="reviews" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[7%] px-3 py-1.5"><SortButton label="Grade" sortKey="grade" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[11%] px-3 py-1.5"><SortButton label="Week" sortKey="study" activeKey={sortKey} direction={direction} onSort={setSort} /></th>
              <th className="w-[6%] px-3 py-1.5 text-right"><span className="sr-only">Quick actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const subject = row.subject
              const deadlineDays = daysUntil(row.next_deadline)
              const studyProgress = row.planned_minutes_7d > 0 ? row.studied_minutes_7d / row.planned_minutes_7d * 100 : 0
              return <tr key={subject.id} className="h-[52px] border-b border-border/80 transition-colors last:border-b-0 hover:bg-surface/60">
                <td className="px-3 py-1.5">
                  <Link to={`/trackers/subjects/${subject.id}`} className="group flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: subjectColor(subject) }} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{subject.title ?? "Untitled subject"}</span><span className="block truncate text-[10px] text-muted-foreground">{subjectCourseLabel(subject) ?? subjectStatus(subject)}</span></span>
                  </Link>
                </td>
                <td className="px-3 py-1.5"><p className={cn("text-xs font-medium", deadlineDays !== null && deadlineDays < 0 ? "text-danger" : deadlineDays !== null && deadlineDays <= 7 ? "text-warning" : "text-secondary")}>{relativeDeadline(row.next_deadline)}</p>{row.next_deadline ? <p className="mt-0.5 text-[10px] text-muted-foreground">{metadataString(subject, "next_deadline_label") ?? "Upcoming"}</p> : null}</td>
                <td className="px-3 py-1.5"><span className="font-mono text-sm text-foreground">{row.open_task_count}</span>{row.overdue_task_count > 0 ? <span className="ml-1 text-[10px] text-danger">{row.overdue_task_count} late</span> : null}</td>
                <td className="px-3 py-1.5"><ProgressCell value={row.progress_percent} /><p className="mt-0.5 text-[9px] text-muted-foreground">{row.completed_topic_count}/{row.topic_count} topics</p></td>
                <td className="px-3 py-1.5"><ProgressCell value={confidencePercent(row.mastery_score)} tone="teal" /></td>
                <td className="px-3 py-1.5">{row.due_review_count > 0 ? <Badge variant="warning" className="py-0.5">{row.due_review_count} due</Badge> : <span className="text-xs text-muted-foreground">Clear</span>}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-secondary">{row.grade_percent === null ? "\u2014" : `${Math.round(row.grade_percent)}%`}</td>
                <td className="px-3 py-1.5"><p className="font-mono text-[11px] text-secondary">{formatMinutes(row.studied_minutes_7d)} <span className="text-muted-foreground">/ {formatMinutes(row.planned_minutes_7d)}</span></p><div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-primary" style={{ width: `${clampPercent(studyProgress)}%` }} /></div></td>
                <td className="px-3 py-1.5"><div className="flex justify-end gap-0.5"><Link className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" to={`/capture?type=task&parent_id=${subject.id}`} aria-label={`Add task to ${subject.title ?? "subject"}`} title="Add task"><Plus className="h-3.5 w-3.5" /></Link><Link className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" to={`/trackers/subjects/${subject.id}`} aria-label={`Open ${subject.title ?? "subject"}`}><ChevronRight className="h-3.5 w-3.5" /></Link></div></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">{visibleRows.map((row) => <SubjectMobileRow key={row.subject.id} row={row} />)}</div>
      {visibleRows.length === 0 ? <div className="px-4 py-14 text-center"><BookOpen className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm text-secondary">No subjects match this view.</p><button type="button" className="mt-2 text-xs text-primary hover:underline" onClick={() => setSearchParams({}, { replace: true })}>Clear filters and search</button></div> : null}
      {visibleRows.length > 0 ? <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface/30 px-3 py-2 text-[11px] text-muted-foreground"><span aria-live="polite">Showing {visibleRows.length} of {rows.length} subjects</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />Planned: next 7 days · studied: previous 7 days</span></footer> : null}
    </section> : null}

    {!loading && !error && totals.overdue > 0 ? <div className="flex items-center gap-2 text-xs text-danger"><AlertTriangle className="h-3.5 w-3.5" />{totals.overdue} overdue {totals.overdue === 1 ? "task needs" : "tasks need"} attention.</div> : null}
  </div>
}
