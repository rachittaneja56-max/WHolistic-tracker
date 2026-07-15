import { useMemo, useState, type DragEvent } from "react"
import { AlertTriangle, GripVertical, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { boardColumns, formatDate, metaString, priorityVariant, taskBoardStatus, type BoardStatus } from "@/features/projects/project-utils"
import { priorityOptions, type Entity } from "@/lib/api"

type Props = {
  tasks: Entity[]
  milestones: Entity[]
  onSelectTask: (task: Entity) => void
  onStatus: (task: Entity, status: BoardStatus) => void
  onAddTask: (milestoneId?: string) => void
}

export function ProjectBoard({ tasks, milestones, onSelectTask, onStatus, onAddTask }: Props) {
  const [query, setQuery] = useState("")
  const [milestoneFilter, setMilestoneFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const milestoneById = useMemo(() => new Map(milestones.map((item) => [item.id, item])), [milestones])
  const filtered = tasks.filter((task) => `${task.title ?? ""} ${task.content ?? ""} ${task.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) && (milestoneFilter === "all" || task.parent_id === milestoneFilter) && (priorityFilter === "all" || metaString(task, "priority", "medium") === priorityFilter))
  const inProgressCount = tasks.filter((task) => taskBoardStatus(task) === "in_progress").length

  function drop(event: DragEvent<HTMLDivElement>, status: BoardStatus) {
    event.preventDefault()
    const task = tasks.find((item) => item.id === event.dataTransfer.getData("text/project-task"))
    if (task) onStatus(task, status)
  }

  return <div className="space-y-4">
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tasks" /><Select value={milestoneFilter} onValueChange={setMilestoneFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All milestones</SelectItem>{milestones.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select><Select value={priorityFilter} onValueChange={setPriorityFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All priorities</SelectItem>{priorityOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    {inProgressCount > 3 ? <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"><AlertTriangle className="h-4 w-4" />{inProgressCount} tasks are in progress. Finish or block work before starting more.</div> : null}

    <div className="space-y-3 md:hidden" aria-label="Tasks grouped by status">
      {boardColumns.map((column) => {
        const columnTasks = filtered.filter((task) => taskBoardStatus(task) === column.value)
        return <section key={column.value} className="overflow-hidden rounded-xl border border-border bg-surface/50">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div><h3 className="text-sm font-semibold text-foreground">{column.label}</h3><p className="mt-0.5 text-[11px] text-muted-foreground">{column.description}</p></div>
            <Badge>{columnTasks.length}</Badge>
          </div>
          <div className="divide-y divide-border/80">
            {columnTasks.map((task) => <article key={task.id} className="bg-background/70 p-4">
              <button type="button" onClick={() => onSelectTask(task)} className="min-h-11 w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p className="text-sm font-medium text-foreground">{task.title ?? "Untitled task"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.content || "No description"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant={priorityVariant(metaString(task, "priority", "medium"))}>{metaString(task, "priority", "medium")}</Badge>
                  {metaString(task, "due_at") ? <Badge>{formatDate(metaString(task, "due_at"))}</Badge> : null}
                </div>
                {milestoneById.get(task.parent_id ?? "")?.title ? <p className="mt-2 truncate text-[11px] text-muted-foreground">{milestoneById.get(task.parent_id ?? "")?.title}</p> : null}
              </button>
              <Select value={column.value} onValueChange={(value) => onStatus(task, value as BoardStatus)}>
                <SelectTrigger aria-label={`Move ${task.title ?? "task"} to another status`} className="mt-3 min-h-11 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{boardColumns.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </article>)}
            {!columnTasks.length ? <p className="px-4 py-5 text-center text-xs text-muted-foreground">No matching tasks</p> : null}
          </div>
          <button type="button" onClick={() => onAddTask(milestoneFilter === "all" ? undefined : milestoneFilter)} className="min-h-11 w-full border-t border-dashed border-border px-4 text-xs text-muted-foreground hover:bg-background hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><Plus className="mr-1 inline h-3.5 w-3.5" />Add task</button>
        </section>
      })}
    </div>

    <div className="hidden overflow-x-auto pb-4 md:block"><div className="grid min-w-[1320px] grid-cols-6 gap-3">{boardColumns.map((column) => { const columnTasks = filtered.filter((task) => taskBoardStatus(task) === column.value); return <div key={column.value} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, column.value)} className="min-h-[420px] rounded-xl border border-border bg-surface/50 p-3"><div className="mb-3 flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{column.label}</p><p className="text-[11px] text-muted-foreground">{column.description}</p></div><Badge>{columnTasks.length}</Badge></div><div className="space-y-3">{columnTasks.map((task) => <div key={task.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/project-task", task.id); event.dataTransfer.effectAllowed = "move" }} className="group rounded-lg border border-border bg-background p-3 hover:border-border-strong"><button type="button" onClick={() => onSelectTask(task)} className="w-full text-left"><div className="flex items-start gap-2"><GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground group-hover:text-muted-foreground" /><div className="min-w-0"><p className="text-sm font-medium text-foreground">{task.title}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.content || "No description"}</p></div></div><div className="mt-3 flex flex-wrap gap-1.5"><Badge variant={priorityVariant(metaString(task, "priority", "medium"))}>{metaString(task, "priority", "medium")}</Badge>{metaString(task, "due_at") ? <Badge>{formatDate(metaString(task, "due_at"))}</Badge> : null}</div><p className="mt-2 truncate text-[11px] text-muted-foreground">{milestoneById.get(task.parent_id ?? "")?.title}</p></button><Select value={column.value} onValueChange={(value) => onStatus(task, value as BoardStatus)}><SelectTrigger className="mt-3 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{boardColumns.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>)}<button type="button" onClick={() => onAddTask(milestoneFilter === "all" ? undefined : milestoneFilter)} className="w-full rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground hover:border-border-strong hover:text-secondary"><Plus className="mr-1 inline h-3.5 w-3.5" />Add task</button></div></div> })}</div></div>
  </div>
}
