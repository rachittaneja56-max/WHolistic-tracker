import type { CaptureFlow } from "@/features/capture/capture-payload"

const storageKeyPrefix = "pdkg:capture-draft:v1:"

export type CaptureDraft = {
  flow: CaptureFlow
  title: string
  content: string
  tags: string
  parentId: string
  academicKind: string
  dueAt: string
  examDate: string
  difficulty: string
  status: string
  priority: string
  sourceUrl: string
  aiExclude: boolean
  savedAt: string
}

function storage() {
  try { return window.sessionStorage } catch { return null }
}

function storageKey(userId: string) {
  return `${storageKeyPrefix}${userId}`
}

export function readCaptureDraft(userId: string | null | undefined): CaptureDraft | null {
  if (!userId) return null
  try {
    const value = storage()?.getItem(storageKey(userId))
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<CaptureDraft>
    if (typeof parsed.title !== "string" || typeof parsed.content !== "string" || typeof parsed.flow !== "string") return null
    return {
      flow: parsed.flow as CaptureFlow, title: parsed.title, content: parsed.content, tags: typeof parsed.tags === "string" ? parsed.tags : "",
      parentId: typeof parsed.parentId === "string" ? parsed.parentId : "", academicKind: typeof parsed.academicKind === "string" ? parsed.academicKind : "assignment",
      dueAt: typeof parsed.dueAt === "string" ? parsed.dueAt : "", examDate: typeof parsed.examDate === "string" ? parsed.examDate : "",
      difficulty: typeof parsed.difficulty === "string" ? parsed.difficulty : "unset", status: typeof parsed.status === "string" ? parsed.status : "unsolved",
      priority: typeof parsed.priority === "string" ? parsed.priority : "medium", sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : "",
      aiExclude: Boolean(parsed.aiExclude), savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    }
  } catch { return null }
}

export function saveCaptureDraft(userId: string | null | undefined, draft: Omit<CaptureDraft, "savedAt">) {
  if (!userId) return
  try { storage()?.setItem(storageKey(userId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() })) } catch { /* Session storage may be unavailable or full. */ }
}

export function clearCaptureDraft(userId: string | null | undefined) {
  if (!userId) return
  try { storage()?.removeItem(storageKey(userId)) } catch { /* Session storage may be unavailable. */ }
}

export function hasCaptureDraftContent(draft: Pick<CaptureDraft, "title" | "content">) {
  return Boolean(draft.title.trim() || draft.content.trim())
}
