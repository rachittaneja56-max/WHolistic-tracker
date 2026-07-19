import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import {
  Archive,
  Bot,
  Clock3,
  History,
  Inbox,
  ListTodo,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react"

import { AssistantResponse } from "@/features/assistant/assistant-response"
import { useAssistantSettings } from "@/features/assistant/assistant-settings-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  archiveAssistantThread,
  createAssistantThread,
  getAssistantThread,
  getAssistantThreads,
  getEntity,
  sendAssistantTurn,
  type AssistantMessage,
  type AssistantPageContext,
  type AssistantThread,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type WorkspaceTab = "history" | "conversation" | "activity"

const starters = [
  "Capture what I worked on",
  "Let's do recall",
  "What should I focus on?",
  "Log something I shipped",
]

function safeOrigin(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("/agents/assistant")) return null
  return value
}

function routeLabel(path: string) {
  if (path.startsWith("/trackers/projects")) return "Projects"
  if (path.startsWith("/trackers/subjects")) return "Subjects"
  if (path.startsWith("/trackers/dsa")) return "DSA tracker"
  if (path.startsWith("/knowledge/entities")) return "Entity"
  if (path.startsWith("/knowledge/graph")) return "Knowledge graph"
  if (path.startsWith("/knowledge/recall")) return "Recall"
  if (path === "/") return "Today"
  return "Workspace"
}

function messageKind(message: AssistantMessage) {
  const payload = message.payload as Record<string, unknown>
  return typeof payload.kind === "string" ? payload.kind : null
}

function kindLabel(kind: string) {
  if (kind === "proposal") return "Proposal"
  if (kind === "recall_due") return "Recall due"
  if (kind === "execution_result") return "Changes applied"
  if (kind === "recall_result") return "Recall result"
  if (kind === "system_error") return "Needs attention"
  return kind.replace(/_/g, " ")
}

function threadDate(value: string) {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
}

export function AssistantWorkspace({ sectionControl }: { sectionControl?: ReactNode }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const settings = useAssistantSettings()
  const originRoute = safeOrigin(searchParams.get("from"))
  const [pageContext, setPageContext] = useState<AssistantPageContext>(() => ({ route: originRoute ?? "/" }))
  const [tab, setTab] = useState<WorkspaceTab>("conversation")
  const [threads, setThreads] = useState<AssistantThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(() => window.localStorage.getItem("pdkg:assistant-thread"))
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [draft, setDraft] = useState("")
  const [historyLoading, setHistoryLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const activeThreadRef = useRef(threadId)
  const threadRequestRef = useRef(0)
  const sendRequestRef = useRef(0)

  const aiLoading = settings === undefined
  const ready = settings?.ai.provider_ready === true
  const currentThread = threads.find((thread) => thread.id === threadId) ?? null
  const contextualStarters = useMemo(() => {
    const route = pageContext.route
    if (route.startsWith("/trackers/projects")) return ["Identify the next project unblock", "Break this assignment into sessions"]
    if (route.startsWith("/trackers/subjects")) return ["Plan revision for this exam", "Quiz me on this topic", "Break this assignment into sessions"]
    if (route.startsWith("/trackers/dsa")) return ["Compare this DSA problem with previous mistakes"]
    if (pageContext.entity_type === "dsa_problem") return ["Compare this DSA problem with previous mistakes"]
    if (route.startsWith("/knowledge/entities")) return ["Quiz me on this topic"]
    if (route.startsWith("/app")) return ["Replan today around available time"]
    return []
  }, [pageContext.route])
  const activity = useMemo(() => messages.filter((message) => {
    const kind = messageKind(message)
    return kind === "proposal" || kind === "recall_due" || kind === "execution_result" || kind === "recall_result" || kind === "system_error"
  }).slice().reverse(), [messages])

  useEffect(() => { activeThreadRef.current = threadId }, [threadId])
  useEffect(() => { const prompt = searchParams.get("prompt")?.trim(); if (prompt) setDraft(prompt) }, [searchParams])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }) }, [messages, sending])

  useEffect(() => {
    const route = originRoute ?? "/"
    const entityMatch = route.match(/^\/(?:knowledge\/entities|trackers\/subjects|trackers\/projects)\/([^/?#]+)/)
    if (!entityMatch) {
      setPageContext({ route })
      return
    }
    let live = true
    const entityId = entityMatch[1]
    setPageContext({ route, entity_id: entityId })
    void getEntity(entityId).then((entity) => {
      if (!live) return
      setPageContext({
        route,
        entity_id: entity.id,
        ...(entity.type ? { entity_type: entity.type } : {}),
        ...(entity.title ? { entity_title: entity.title } : {}),
        ...(route.startsWith("/trackers/projects") ? { project_id: entity.id } : {}),
        ...(route.startsWith("/trackers/subjects") ? { subject_id: entity.id } : {}),
        ...(entity.type === "dsa_problem" ? { dsa_problem_id: entity.id } : {}),
      })
    }).catch(() => undefined)
    return () => { live = false }
  }, [originRoute, searchParams])

  const loadThread = useCallback(async (nextId: string) => {
    const requestId = ++threadRequestRef.current
    setThreadId(nextId)
    activeThreadRef.current = nextId
    window.localStorage.setItem("pdkg:assistant-thread", nextId)
    setThreadLoading(true)
    setHistoryError(null)
    try {
      const detail = await getAssistantThread(nextId)
      if (requestId !== threadRequestRef.current || activeThreadRef.current !== nextId) return
      setMessages(detail.messages)
      setThreads((current) => current.map((item) => item.id === detail.thread.id ? detail.thread : item))
      setTab("conversation")
      window.setTimeout(() => composerRef.current?.focus(), 0)
    } catch (nextError) {
      if (requestId === threadRequestRef.current) setHistoryError(nextError instanceof Error ? nextError.message : "Unable to load this conversation.")
    } finally {
      if (requestId === threadRequestRef.current) setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    let live = true
    setHistoryLoading(true)
    void getAssistantThreads().then((items) => {
      if (!live) return
      setThreads(items)
      const saved = activeThreadRef.current
      const candidate = saved && items.some((item) => item.id === saved) ? saved : items[0]?.id ?? null
      if (candidate) return loadThread(candidate)
      setThreadId(null)
      setMessages([])
    }).catch((nextError) => {
      if (live) setHistoryError(nextError instanceof Error ? nextError.message : "Unable to load assistant history.")
    }).finally(() => {
      if (live) setHistoryLoading(false)
    })
    return () => { live = false; threadRequestRef.current += 1 }
  }, [loadThread])

  async function newChat() {
    setHistoryError(null)
    try {
      const thread = await createAssistantThread()
      setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)])
      setThreadId(thread.id)
      activeThreadRef.current = thread.id
      window.localStorage.setItem("pdkg:assistant-thread", thread.id)
      threadRequestRef.current += 1
      setMessages([])
      setTab("conversation")
      window.setTimeout(() => composerRef.current?.focus(), 0)
    } catch (nextError) {
      setHistoryError(nextError instanceof Error ? nextError.message : "Unable to start a conversation.")
    }
  }

  async function archiveThread(thread: AssistantThread) {
    if (!window.confirm(`Archive "${thread.title}"? You can no longer open it from this history list.`)) return
    setArchivingId(thread.id)
    try {
      await archiveAssistantThread(thread.id)
      const remaining = threads.filter((item) => item.id !== thread.id)
      setThreads(remaining)
      if (threadId === thread.id) {
        if (remaining[0]) await loadThread(remaining[0].id)
        else {
          setThreadId(null)
          activeThreadRef.current = null
          window.localStorage.removeItem("pdkg:assistant-thread")
          setMessages([])
          setTab("conversation")
          window.setTimeout(() => composerRef.current?.focus(), 0)
        }
      }
    } catch (nextError) {
      setHistoryError(nextError instanceof Error ? nextError.message : "Unable to archive this conversation.")
    } finally { setArchivingId(null) }
  }

  function appendPersistedMessage(message: AssistantMessage) {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
  }

  async function send(text = draft) {
    const content = text.trim()
    if (!content || sending || !ready) return
    const requestId = ++sendRequestRef.current
    const targetThreadId = activeThreadRef.current
    const optimisticId = `pending-${crypto.randomUUID()}`
    const optimistic: AssistantMessage = {
      id: optimisticId,
      thread_id: targetThreadId ?? "pending",
      role: "user",
      content,
      model_stage: null,
      payload: {},
      created_at: new Date().toISOString(),
    }
    setDraft("")
    setSending(true)
    setMessages((current) => [...current, optimistic])
    try {
      const result = await sendAssistantTurn({
        thread_id: targetThreadId,
        message: content,
        current_path: pageContext.route,
        page_context: pageContext,
      })
      const responsePayload = result.assistant_message.payload as Record<string, unknown>
      const responseMessage: AssistantMessage = result.proposal_id && typeof responsePayload.proposal_id !== "string"
        ? {
            ...result.assistant_message,
            payload: { ...responsePayload, proposal_id: result.proposal_id, proposal_status: "pending" } as AssistantMessage["payload"],
          }
        : result.assistant_message
      setThreads((current) => [result.thread, ...current.filter((item) => item.id !== result.thread.id)])
      const stillOnTarget = targetThreadId === null
        ? activeThreadRef.current === null || activeThreadRef.current === result.thread.id
        : activeThreadRef.current === targetThreadId
      if (requestId === sendRequestRef.current && stillOnTarget) {
        setThreadId(result.thread.id)
        activeThreadRef.current = result.thread.id
        window.localStorage.setItem("pdkg:assistant-thread", result.thread.id)
        setMessages((current) => [...current.filter((item) => item.id !== optimisticId), result.user_message, responseMessage])
      }
    } catch (nextError) {
      if (requestId === sendRequestRef.current && activeThreadRef.current === targetThreadId) {
        const errorMessage: AssistantMessage = {
          id: `error-${crypto.randomUUID()}`,
          thread_id: targetThreadId ?? "pending",
          role: "assistant",
          content: nextError instanceof Error ? nextError.message : "The assistant is unavailable. Your draft was preserved.",
          model_stage: null,
          payload: { kind: "system_error", retryable: true, source_text: content },
          created_at: new Date().toISOString(),
        }
        setMessages((current) => [...current.filter((item) => item.id !== optimisticId), optimistic, errorMessage])
        setDraft(content)
      }
    } finally {
      if (requestId === sendRequestRef.current) setSending(false)
    }
  }

  function retryMessage(message: AssistantMessage) {
    const source = (message.payload as Record<string, unknown>).source_text
    if (typeof source === "string") void send(source)
  }

  const mobileTabs: Array<{ id: WorkspaceTab; label: string; icon: typeof History; count?: number }> = [
    { id: "history", label: "History", icon: History, count: threads.length },
    { id: "conversation", label: "Conversation", icon: MessagesSquare },
    { id: "activity", label: "Activity", icon: ListTodo, count: activity.length },
  ]

  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-1 xl:hidden" role="tablist" aria-label="Assistant workspace panels">
      {mobileTabs.map((item) => {
        const Icon = item.icon
        return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 text-xs", tab === item.id ? "bg-surface-subtle text-foreground" : "text-muted-foreground hover:text-secondary")}><Icon className="h-3.5 w-3.5" /><span className="truncate">{item.label}</span>{item.count ? <span className="font-mono text-[10px]">{item.count}</span> : null}</button>
      })}
    </div>

    <div className="grid min-h-[calc(100dvh-9.5rem)] overflow-hidden rounded-xl border border-border bg-background xl:h-[calc(100dvh-7.5rem)] xl:min-h-[640px] xl:grid-cols-[250px_minmax(0,1fr)_300px]">
      <aside className={cn("min-h-0 flex-col border-border bg-surface/60 xl:flex xl:border-r", tab === "history" ? "flex" : "hidden")}>
        <header className="flex items-center justify-between border-b border-border p-3"><div><h2 className="text-sm font-medium text-foreground">Conversations</h2><p className="mt-0.5 text-xs text-muted-foreground">Your assistant history</p></div><Button size="sm" variant="ghost" onClick={() => void newChat()} aria-label="New conversation"><Plus className="h-4 w-4" /></Button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {historyLoading ? <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading history...</div> : null}
          {!historyLoading && !threads.length ? <div className="p-4 text-center"><Inbox className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">No conversations yet.</p></div> : null}
          <div className="space-y-1">{threads.map((thread) => <div key={thread.id} className={cn("group flex items-center rounded-lg border", thread.id === threadId ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-border hover:bg-surface")}>
            <button type="button" onClick={() => void loadThread(thread.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left"><p className={cn("truncate text-sm", thread.id === threadId ? "text-primary-foreground" : "text-secondary")}>{thread.title}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{threadDate(thread.updated_at)}</p></button>
            <button type="button" onClick={() => void archiveThread(thread)} disabled={archivingId === thread.id} className="mr-1 rounded p-2 text-muted-foreground opacity-0 hover:bg-surface-subtle hover:text-secondary focus:opacity-100 group-hover:opacity-100" aria-label={`Archive ${thread.title}`}>{archivingId === thread.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}</button>
          </div>)}</div>
          {historyError ? <p className="m-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs text-danger">{historyError}</p> : null}
        </div>
      </aside>

      <section className={cn("min-h-0 min-w-0 flex-col bg-background xl:flex", tab === "conversation" ? "flex" : "hidden")}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
          <div className="min-w-0"><div className="flex items-center gap-2"><Bot className="h-4 w-4 shrink-0 text-primary" /><h2 className="truncate text-sm font-medium text-foreground">{currentThread?.title || "AI Workspace"}</h2></div><p className="mt-1 text-xs text-muted-foreground">{ready ? "Context-aware planning with confirmation before writes" : aiLoading ? "Checking AI availability..." : "AI is unavailable - configure it in Settings"}</p></div>
          <div className="flex flex-wrap items-center justify-end gap-2">{originRoute ? <Badge variant="blue">Context: {pageContext.entity_title || routeLabel(originRoute)}</Badge> : null}{sectionControl}<Button size="sm" variant="outline" onClick={() => void newChat()}><Plus className="mr-2 h-3.5 w-3.5" />New</Button></div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 md:px-6">
          {threadLoading ? <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading conversation...</div> : null}
          {!threadLoading && !messages.length ? <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center py-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10"><Sparkles className="h-5 w-5 text-primary" /></div>
            <h2 className="mt-4 text-center text-lg font-semibold text-foreground">How can I help?</h2>
            <p className="mx-auto mt-2 max-w-md text-center text-sm leading-6 text-muted-foreground">Capture work, plan changes, explore your knowledge, or run a recall session. You approve every write.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">{[...contextualStarters, ...starters].map((starter) => <button key={starter} type="button" onClick={() => void send(starter)} disabled={!ready || sending} className="rounded-lg border border-border bg-surface px-3 py-3 text-left text-sm text-secondary hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50">{starter}</button>)}</div>
          </div> : null}
          {!threadLoading && messages.length ? <div className="mx-auto space-y-4">{messages.map((message) => <div id={`assistant-message-${message.id}`} key={message.id}><AssistantResponse message={message} onUseText={(text) => { setDraft(text); window.setTimeout(() => composerRef.current?.focus(), 0) }} onPersistedMessage={appendPersistedMessage} onRetry={messageKind(message) === "system_error" ? () => retryMessage(message) : undefined} /></div>)}
            {sending ? <div className="flex max-w-sm items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm text-secondary"><Loader2 className="h-4 w-4 animate-spin text-primary" />Assistant is responding...</div> : null}
          </div> : null}
          <div ref={bottomRef} />
        </div>

        <footer className="border-t border-border bg-surface/50 p-3 md:p-4">
          <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-xl border border-border-strong bg-background p-2 focus-within:border-primary/50">
            <Textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={ready ? "Ask, capture, plan, or start recall..." : aiLoading ? "Checking AI availability..." : "Enable and configure AI in Settings"} disabled={!ready || sending} className="max-h-40 min-h-11 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0" />
            <Button className="h-10 w-10 shrink-0 p-0" onClick={() => void send()} disabled={!ready || sending || !draft.trim()} aria-label="Send message">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </div>
          <div className="mx-auto mt-2 flex max-w-4xl items-center justify-between gap-3 px-1 font-mono text-[10px] text-muted-foreground"><span>Enter to send / Shift+Enter for a new line</span><button type="button" onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })} className="hover:text-secondary">Jump to latest</button></div>
        </footer>
      </section>

      <aside className={cn("min-h-0 flex-col border-border bg-surface/40 xl:flex xl:border-l", tab === "activity" ? "flex" : "hidden")}>
        <header className="border-b border-border p-4"><div className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-primary" /><h2 className="text-sm font-medium text-foreground">Activity</h2></div><p className="mt-1 text-xs text-muted-foreground">Tasks and results in this conversation</p></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!activity.length ? <div className="py-12 text-center"><Clock3 className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Proposals, recall, and results will appear here.</p></div> : <div className="space-y-2">{activity.map((message) => {
            const kind = messageKind(message) || "activity"
            return <button key={message.id} type="button" onClick={() => { setTab("conversation"); window.setTimeout(() => document.getElementById(`assistant-message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0) }} className="w-full rounded-lg border border-border bg-background p-3 text-left hover:border-primary/30">
              <div className="flex items-center justify-between gap-2"><Badge variant={kind === "system_error" ? "danger" : kind.includes("result") ? "success" : "blue"}>{kindLabel(kind)}</Badge><span className="font-mono text-[10px] text-muted-foreground">{threadDate(message.created_at)}</span></div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-secondary">{message.content}</p>
            </button>
          })}</div>}
        </div>
      </aside>
    </div>
  </div>
}
