import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Link, useNavigate, useOutletContext } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { formatEntityDate, getEntityAiAssistLevel, getEntityStatus } from "@/features/entities/metadata"
import {
  aiAssistLevelOptions,
  createEntity,
  createLink,
  generateComprehensionCheck,
  getEntities,
  getEntityChildren,
  taskStatusOptions,
  type AiAssistLevel,
  type Entity,
  type TaskStatus,
  updateEntity,
} from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load project tracker data."
}

function getStatusVariant(status: TaskStatus | null): "default" | "success" | "warning" {
  if (status === "done") {
    return "success"
  }
  if (status === "in_progress") {
    return "warning"
  }
  return "default"
}

function getAiAssistVariant(level: AiAssistLevel | null): "default" | "warning" | "blue" {
  if (level === "handwritten" || level === null) {
    return "default"
  }
  if (level === "ai-generated") {
    return "warning"
  }
  return "blue"
}

type TaskGroups = Record<TaskStatus, Entity[]>
type EntityCollectionSetter = Dispatch<SetStateAction<Entity[]>>

export function ProjectsPage() {
  const navigate = useNavigate()
  const { addEntityToList, refreshEntities, upsertEntityInList } = useOutletContext<EntitiesLayoutContext>()
  const [projects, setProjects] = useState<Entity[]>([])
  const [milestones, setMilestones] = useState<Entity[]>([])
  const [tasks, setTasks] = useState<Entity[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null)
  const [isProjectsLoading, setIsProjectsLoading] = useState(true)
  const [isMilestonesLoading, setIsMilestonesLoading] = useState(false)
  const [isTasksLoading, setIsTasksLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingCompletionTask, setPendingCompletionTask] = useState<Entity | null>(null)
  const [tilContent, setTilContent] = useState("")
  const [tilError, setTilError] = useState<string | null>(null)
  const [isSavingTil, setIsSavingTil] = useState(false)
  const [pendingComprehensionTask, setPendingComprehensionTask] = useState<Entity | null>(null)
  const [comprehensionContext, setComprehensionContext] = useState("")
  const [generatedCheckId, setGeneratedCheckId] = useState<string | null>(null)
  const [comprehensionError, setComprehensionError] = useState<string | null>(null)
  const [isGeneratingCheck, setIsGeneratingCheck] = useState(false)

  async function loadProjects() {
    setIsProjectsLoading(true)
    setError(null)

    try {
      const results = await getEntities({ type: "project", limit: 200 })
      setProjects(results)
      setSelectedProjectId((currentSelected) => currentSelected ?? results[0]?.id ?? null)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsProjectsLoading(false)
    }
  }

  async function loadMilestones(projectId: string) {
    setIsMilestonesLoading(true)
    setError(null)

    try {
      const results = await getEntityChildren(projectId, { type: "milestone", limit: 200 })
      setMilestones(results)
      setSelectedMilestoneId((currentSelected) => {
        const matchingMilestone = results.find((milestone) => milestone.id === currentSelected)
        return matchingMilestone?.id ?? results[0]?.id ?? null
      })
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsMilestonesLoading(false)
    }
  }

  async function loadTasks(milestoneId: string) {
    setIsTasksLoading(true)
    setError(null)

    try {
      const results = await getEntityChildren(milestoneId, { type: "task", limit: 200 })
      setTasks(results)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsTasksLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      setMilestones([])
      setSelectedMilestoneId(null)
      setTasks([])
      return
    }

    void loadMilestones(selectedProjectId)
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedMilestoneId) {
      setTasks([])
      return
    }

    void loadTasks(selectedMilestoneId)
  }, [selectedMilestoneId])

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedMilestone = milestones.find((milestone) => milestone.id === selectedMilestoneId) ?? null

  const taskGroups = useMemo<TaskGroups>(() => {
    const grouped: TaskGroups = {
      todo: [],
      in_progress: [],
      done: [],
    }

    tasks.forEach((task) => {
      const status = getEntityStatus(task) ?? "todo"
      grouped[status].push(task)
    })

    return grouped
  }, [tasks])

  async function handleStatusUpdate(
    entity: Entity,
    nextStatus: TaskStatus,
    setCollection: EntityCollectionSetter,
    options?: { promptForTil?: boolean },
  ) {
    const currentStatus = getEntityStatus(entity) ?? "todo"
    if (currentStatus === nextStatus) {
      return
    }

    if (options?.promptForTil && nextStatus === "done") {
      setPendingCompletionTask(entity)
      setTilContent("")
      setTilError(null)
      return
    }

    try {
      const updatedEntity = await updateEntity(entity.id, { metadata: { status: nextStatus } })
      setCollection((currentEntities) =>
        currentEntities.map((currentEntity) => (currentEntity.id === updatedEntity.id ? updatedEntity : currentEntity)),
      )
      upsertEntityInList(updatedEntity)
    } catch (updateError) {
      setError(getErrorMessage(updateError))
    }
  }

  async function handleProjectStatusChange(project: Entity, nextStatus: TaskStatus) {
    await handleStatusUpdate(project, nextStatus, setProjects)
  }

  async function handleMilestoneStatusChange(milestone: Entity, nextStatus: TaskStatus) {
    await handleStatusUpdate(milestone, nextStatus, setMilestones)
  }

  async function handleTaskStatusChange(task: Entity, nextStatus: TaskStatus) {
    await handleStatusUpdate(task, nextStatus, setTasks, { promptForTil: true })
  }

  async function handleTaskAiAssistChange(task: Entity, nextLevel: AiAssistLevel) {
    try {
      const updatedTask = await updateEntity(task.id, { metadata: { ai_assist_level: nextLevel } })
      setTasks((currentTasks) => currentTasks.map((currentTask) => (currentTask.id === updatedTask.id ? updatedTask : currentTask)))
      upsertEntityInList(updatedTask)
    } catch (updateError) {
      setError(getErrorMessage(updateError))
    }
  }

  async function handleCompleteTask() {
    if (!pendingCompletionTask) {
      return
    }
    if (!tilContent.trim()) {
      setTilError("What did you learn? is required to create the TIL.")
      return
    }

    setIsSavingTil(true)
    setTilError(null)

    try {
      const updatedTask = await updateEntity(pendingCompletionTask.id, { metadata: { status: "done" } })
      const tilEntity = await createEntity({
        title: `TIL: ${pendingCompletionTask.title ?? "Completed task"}`,
        type: "til",
        content: tilContent.trim(),
        content_type: "markdown",
        tags: pendingCompletionTask.tags,
        metadata: { source_task_id: pendingCompletionTask.id },
      })
      await createLink({
        from_id: pendingCompletionTask.id,
        to_id: tilEntity.id,
        relation_type: "used_in",
        explanation: "Learning captured after completing this task.",
        status: "confirmed",
      })

      setTasks((currentTasks) => currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)))
      upsertEntityInList(updatedTask)
      addEntityToList(tilEntity)
      void refreshEntities()

      const aiAssistLevel = getEntityAiAssistLevel(updatedTask)
      const needsComprehensionCheck = aiAssistLevel !== null && aiAssistLevel !== "handwritten"

      setPendingCompletionTask(null)
      setTilContent("")

      if (needsComprehensionCheck) {
        setPendingComprehensionTask(updatedTask)
        setGeneratedCheckId(null)
        setComprehensionContext("")
        setComprehensionError(null)
      }
    } catch (saveError) {
      setTilError(getErrorMessage(saveError))
    } finally {
      setIsSavingTil(false)
    }
  }

  async function handleGenerateComprehensionCheck() {
    if (!pendingComprehensionTask) {
      return
    }

    setIsGeneratingCheck(true)
    setComprehensionError(null)

    try {
      const result = await generateComprehensionCheck({
        task_entity_id: pendingComprehensionTask.id,
        diff_or_summary: comprehensionContext.trim() || null,
      })
      if (result.status === "not_required") {
        setComprehensionError(result.message ?? "This task does not require a comprehension check.")
      } else {
        setGeneratedCheckId(result.check_id)
      }
    } catch (generationError) {
      setComprehensionError(getErrorMessage(generationError))
    } finally {
      setIsGeneratingCheck(false)
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[280px_280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Top-level project entities. Milestones and tasks descend from these using `parent_id` only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isProjectsLoading ? <p className="text-sm text-zinc-500">Loading projects...</p> : null}
            {!isProjectsLoading && error ? <p className="text-sm text-red-300">{error}</p> : null}
            {!isProjectsLoading && !error && projects.length === 0 ? <p className="text-sm text-zinc-500">No projects captured yet.</p> : null}
            {projects.map((project) => (
              <div
                key={project.id}
                className={`rounded-lg border px-4 py-3 transition-colors ${
                  selectedProject?.id === project.id ? "border-blue-500/50 bg-zinc-950" : "border-zinc-800 bg-zinc-950"
                }`}
              >
                <div className="flex flex-col gap-3">
                  <button type="button" onClick={() => setSelectedProjectId(project.id)} className="text-left">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-100">{project.title ?? "Untitled project"}</p>
                      <Badge variant={getStatusVariant(getEntityStatus(project))}>{getEntityStatus(project) ?? "unset"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">{project.content?.slice(0, 80) || "No project notes yet."}</p>
                  </button>

                  <Select value={getEntityStatus(project) ?? "todo"} onValueChange={(value) => void handleProjectStatusChange(project, value as TaskStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Update project status" />
                    </SelectTrigger>
                    <SelectContent>
                      {taskStatusOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>{selectedProject ? `Children of ${selectedProject.title ?? "this project"}` : "Select a project first."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isMilestonesLoading ? <p className="text-sm text-zinc-500">Loading milestones...</p> : null}
            {!isMilestonesLoading && !selectedProject ? <p className="text-sm text-zinc-500">Choose a project to view milestones.</p> : null}
            {!isMilestonesLoading && selectedProject && milestones.length === 0 ? <p className="text-sm text-zinc-500">No milestones under this project yet.</p> : null}
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`rounded-lg border px-4 py-3 transition-colors ${
                  selectedMilestone?.id === milestone.id ? "border-blue-500/50 bg-zinc-950" : "border-zinc-800 bg-zinc-950"
                }`}
              >
                <div className="flex flex-col gap-3">
                  <button type="button" onClick={() => setSelectedMilestoneId(milestone.id)} className="text-left">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-100">{milestone.title ?? "Untitled milestone"}</p>
                      <Badge variant={getStatusVariant(getEntityStatus(milestone))}>{getEntityStatus(milestone) ?? "unset"}</Badge>
                    </div>
                    <p className="mt-2 font-mono text-xs text-zinc-500">{formatEntityDate(milestone.created_at)}</p>
                  </button>

                  <Select
                    value={getEntityStatus(milestone) ?? "todo"}
                    onValueChange={(value) => void handleMilestoneStatusChange(milestone, value as TaskStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Update milestone status" />
                    </SelectTrigger>
                    <SelectContent>
                      {taskStatusOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>
              {selectedMilestone
                ? `Children of ${selectedMilestone.title ?? "this milestone"}. Move a task to done to capture a TIL, then generate a comprehension check for AI-assisted work.`
                : "Select a milestone to manage tasks."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isTasksLoading ? <p className="text-sm text-zinc-500">Loading tasks...</p> : null}
            {!isTasksLoading && !selectedMilestone ? <p className="text-sm text-zinc-500">Choose a milestone to view tasks.</p> : null}
            {!isTasksLoading && selectedMilestone && tasks.length === 0 ? <p className="text-sm text-zinc-500">No tasks under this milestone yet.</p> : null}

            {!isTasksLoading && selectedMilestone
              ? (["todo", "in_progress", "done"] as TaskStatus[]).map((statusKey) => (
                  <div key={statusKey} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">{statusKey}</h3>
                      <Badge variant={getStatusVariant(statusKey)}>{taskGroups[statusKey].length}</Badge>
                    </div>
                    {taskGroups[statusKey].length === 0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-zinc-500">No tasks in this group.</div>
                    ) : (
                      taskGroups[statusKey].map((task) => {
                        const aiAssistLevel = getEntityAiAssistLevel(task)
                        const requiresComprehension = aiAssistLevel !== null && aiAssistLevel !== "handwritten"
                        return (
                          <div key={task.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-zinc-100">{task.title ?? "Untitled task"}</p>
                                <p className="text-sm text-zinc-300">{task.content?.trim() || "No task notes yet."}</p>
                                <div className="flex flex-wrap gap-2">
                                  {task.tags.map((tag) => (
                                    <Badge key={tag}>{tag}</Badge>
                                  ))}
                                  <Badge variant={getAiAssistVariant(aiAssistLevel)}>{aiAssistLevel ?? "handwritten"}</Badge>
                                  {requiresComprehension ? <Badge variant="warning">comprehension debt when done</Badge> : null}
                                </div>
                                <p className="font-mono text-xs text-zinc-500">{formatEntityDate(task.created_at)}</p>
                              </div>

                              <div className="flex w-full gap-3 lg:w-[240px] lg:flex-col">
                                <Select value={getEntityStatus(task) ?? "todo"} onValueChange={(value) => void handleTaskStatusChange(task, value as TaskStatus)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Update status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {taskStatusOptions.map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select value={aiAssistLevel ?? "handwritten"} onValueChange={(value) => void handleTaskAiAssistChange(task, value as AiAssistLevel)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="AI assist level" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {aiAssistLevelOptions.map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button asChild variant="outline">
                                  <Link to={`/entities/${task.id}`}>Open Entity</Link>
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                ))
              : null}
          </CardContent>
        </Card>
      </div>

      {pendingCompletionTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>What did you learn?</CardTitle>
              <CardDescription>
                Marking <span className="text-zinc-100">{pendingCompletionTask.title ?? "this task"}</span> as done should create a TIL entity and a link back to the task.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="til-content">Learning note</Label>
                <Textarea
                  id="til-content"
                  value={tilContent}
                  onChange={(event) => setTilContent(event.target.value)}
                  placeholder="Write the key learning from completing this task."
                />
              </div>

              {getEntityAiAssistLevel(pendingCompletionTask) !== "handwritten" ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-zinc-300">
                  This task is marked as AI-assisted, so after the TIL is saved we will prompt you to generate a comprehension check.
                </div>
              ) : null}

              {tilError ? <p className="text-sm text-red-300">{tilError}</p> : null}

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPendingCompletionTask(null)
                    setTilContent("")
                    setTilError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleCompleteTask()} disabled={isSavingTil}>
                  {isSavingTil ? "Saving..." : "Complete Task and Create TIL"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {pendingComprehensionTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Generate Comprehension Check</CardTitle>
              <CardDescription>
                <span className="text-zinc-100">{pendingComprehensionTask.title ?? "This task"}</span> used AI assistance. Generate a follow-up question so you can confirm the reasoning behind the work.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="comprehension-context">Optional diff or summary</Label>
                <Textarea
                  id="comprehension-context"
                  value={comprehensionContext}
                  onChange={(event) => setComprehensionContext(event.target.value)}
                  placeholder="Paste a diff summary or a short description if you want a more specific question."
                  className="min-h-[160px]"
                />
              </div>

              {generatedCheckId ? (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-zinc-300">
                  Comprehension check created. Open the debt queue to answer it.
                </div>
              ) : null}

              {comprehensionError ? <p className="text-sm text-red-300">{comprehensionError}</p> : null}

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPendingComprehensionTask(null)
                    setComprehensionContext("")
                    setGeneratedCheckId(null)
                    setComprehensionError(null)
                  }}
                >
                  Close
                </Button>
                {generatedCheckId ? (
                  <Button
                    type="button"
                    onClick={() => {
                      navigate("/comprehension-debt")
                    }}
                  >
                    Open Comprehension Debt
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void handleGenerateComprehensionCheck()} disabled={isGeneratingCheck}>
                    {isGeneratingCheck ? "Generating..." : "Generate Check"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
}
