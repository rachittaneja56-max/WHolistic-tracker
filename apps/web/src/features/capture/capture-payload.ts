import { parseCaptureTags, type AcademicKind } from "@/features/capture/capture-prefill"
import type { CreateEntityPayload } from "@/lib/api"

export type CaptureFlow = "note" | "practice_problem" | "assignment" | "project" | "subject" | "idea"

type BuildCapturePayloadInput = {
  flow: CaptureFlow
  title: string
  content: string
  tags: string
  parentId: string
  academicKind: AcademicKind
  dueAt: string
  examDate: string
  difficulty: string
  problemStatus: string
  priority: string
  sourceUrl: string
  aiExclude: boolean
}

const entityTypeByFlow = {
  note: "note",
  practice_problem: "dsa_problem",
  assignment: "task",
  project: "project",
  subject: "subject_topic",
  idea: "idea",
} as const satisfies Record<CaptureFlow, CreateEntityPayload["type"]>

export function buildCapturePayload(input: BuildCapturePayloadInput): CreateEntityPayload {
  const metadata: Record<string, unknown> = { ai_exclude: input.aiExclude }

  if (input.flow === "practice_problem") {
    if (input.difficulty !== "unset") metadata.difficulty = input.difficulty
    metadata.status = input.problemStatus
    if (input.sourceUrl.trim()) metadata.source_url = input.sourceUrl.trim()
  }
  if (input.flow === "assignment") {
    metadata.academic_kind = input.academicKind
    metadata.status = "todo"
    metadata.priority = input.priority
    if (input.dueAt) metadata.due_at = input.dueAt
  }
  if (input.flow === "project") metadata.status = "planned"
  if (input.flow === "subject") {
    metadata.academic_kind = "subject"
    if (input.examDate) metadata.exam_date = input.examDate
  }

  const supportsParent = input.flow === "assignment" || input.flow === "subject"

  return {
    title: input.title.trim(),
    type: entityTypeByFlow[input.flow],
    parent_id: supportsParent && input.parentId ? input.parentId : null,
    content: input.content.trim(),
    content_type: "markdown",
    tags: parseCaptureTags(input.tags),
    metadata,
  }
}
