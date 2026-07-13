import { useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ExternalLink,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  cancelAssistantProposal,
  executeAssistantProposal,
  gradeAssistantRecall,
  updateAssistantProposal,
  type AssistantAction,
  type AssistantMessage,
  type AssistantProposalStatus,
  type AssistantRecallItem,
  type RecallGradeResult,
} from "@/lib/api"

type ResponseProps = {
  message: AssistantMessage
  onUseText: (text: string) => void
  onPersistedMessage: (message: AssistantMessage) => void
  onRetry?: () => void
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function createExecutionKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return "assistant-" + Date.now() + "-" + Math.random().toString(36).slice(2)
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textFromNode).join("")
  if (typeof node === "object" && node !== null && "props" in node) {
    return textFromNode((node as { props: { children?: ReactNode } }).props.children)
  }
  return ""
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label={label}>
    {copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}{copied ? "Copied" : label}
  </button>
}

function MarkdownResponse({ children }: { children: string }) {
  return <div className="min-w-0 break-words text-sm leading-6 text-zinc-300">
    <ReactMarkdown
      components={{
        h1: ({ children: value }) => <h2 className="mb-2 mt-4 text-lg font-semibold text-zinc-100 first:mt-0">{value}</h2>,
        h2: ({ children: value }) => <h3 className="mb-2 mt-4 text-base font-semibold text-zinc-100 first:mt-0">{value}</h3>,
        h3: ({ children: value }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-zinc-100">{value}</h4>,
        p: ({ children: value }) => <p className="my-2 first:mt-0 last:mb-0">{value}</p>,
        ul: ({ children: value }) => <ul className="my-2 list-disc space-y-1 pl-5">{value}</ul>,
        ol: ({ children: value }) => <ol className="my-2 list-decimal space-y-1 pl-5">{value}</ol>,
        a: ({ href, children: value }) => <a href={href} target="_blank" rel="noreferrer" className="break-all text-blue-300 underline decoration-blue-500/40 underline-offset-2 hover:text-blue-200">{value}</a>,
        blockquote: ({ children: value }) => <blockquote className="my-3 border-l-2 border-blue-500/50 pl-3 text-zinc-400">{value}</blockquote>,
        pre: ({ children: value }) => {
          const code = textFromNode(value).replace(/\n$/, "")
          return <div className="group relative my-3 min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><CopyButton value={code} label="Copy code" /></div>
            <pre className="max-w-full overflow-x-auto p-3 pr-20 font-mono text-xs leading-5 text-zinc-300">{value}</pre>
          </div>
        },
        code: ({ children: value, className }) => className
          ? <code className={className}>{value}</code>
          : <code className="break-all rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-blue-200">{value}</code>,
      }}
    >{children}</ReactMarkdown>
  </div>
}

function statusVariant(status: AssistantProposalStatus) {
  if (status === "executed") return "success" as const
  if (status === "failed" || status === "stale") return "danger" as const
  if (status === "expired") return "warning" as const
  return "default" as const
}

const actionLabels: Record<AssistantAction["action_type"], string> = {
  create_entity: "Create entity",
  update_entity: "Update entity",
  log_shipping: "Log shipped work",
}

function QuestionsCard({ questions, onUseText }: { questions: string[]; onUseText: (text: string) => void }) {
  if (!questions.length) return null
  const answerTemplate = questions.map((question, index) => `${index + 1}. ${question}\n   `).join("\n")
  return <section className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
    <div className="flex items-center gap-2"><Badge variant="blue">Clarification</Badge><span className="text-xs text-zinc-500">{questions.length} question{questions.length === 1 ? "" : "s"}</span></div>
    <ol className="mt-3 space-y-3">{questions.map((question, index) => <li key={`${index}-${question}`} className="flex gap-3 text-sm text-zinc-200"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 font-mono text-xs text-blue-300">{index + 1}</span><span className="pt-0.5 leading-5">{question}</span></li>)}</ol>
    <Button size="sm" variant="outline" className="mt-4" onClick={() => onUseText(answerTemplate)}>Answer these</Button>
  </section>
}

function ProposalCard({ message, onPersistedMessage }: Pick<ResponseProps, "message" | "onPersistedMessage">) {
  const payload = asRecord(message.payload)
  const proposalId = typeof payload.proposal_id === "string" ? payload.proposal_id : null
  const initialActions = Array.isArray(payload.actions) ? payload.actions as AssistantAction[] : []
  const initialStatus = typeof payload.proposal_status === "string" ? payload.proposal_status as AssistantProposalStatus : "pending"
  const [actions, setActions] = useState(initialActions)
  const [selected, setSelected] = useState(() => new Set(initialActions.map((item) => item.id)))
  const [status, setStatus] = useState<AssistantProposalStatus>(initialStatus)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(initialActions.length <= 3)
  const [results, setResults] = useState<Array<{ entity_id: string; title: string | null; status: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [actionsPrepared, setActionsPrepared] = useState(false)
  const [executionKey] = useState(createExecutionKey)
  const terminal = status === "executed" || status === "cancelled" || status === "expired" || status === "stale"
  const locked = terminal || busy
  if (!proposalId || !actions.length) return null
  const activeProposalId = proposalId

  function edit(id: string, field: "title" | "content", value: string) {
    setActions((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
    setActionsPrepared(false)
  }
  function chooseAll(nextSelected: boolean) {
    setSelected(new Set(nextSelected ? actions.map((item) => item.id) : []))
  }
  async function cancel() {
    if (!window.confirm("Cancel this proposal? It cannot be executed afterward.")) return
    setBusy(true); setError(null)
    try {
      await cancelAssistantProposal(activeProposalId)
      setStatus("cancelled")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to cancel the proposal.")
    } finally { setBusy(false) }
  }
  async function execute() {
    setBusy(true); setStatus("executing"); setError(null)
    try {
      if (!actionsPrepared) {
        await updateAssistantProposal(activeProposalId, actions)
        setActionsPrepared(true)
      }
      const result = await executeAssistantProposal(activeProposalId, { idempotency_key: executionKey, action_ids: [...selected] })
      setResults(result.results)
      setStatus("executed")
      if (result.message) onPersistedMessage(result.message)
    } catch (nextError) {
      setStatus("failed")
      setError(nextError instanceof Error ? nextError.message : "Unable to apply these changes.")
    } finally { setBusy(false) }
  }

  return <section className="mt-4 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/70">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
      <div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium text-zinc-100">Proposed changes</h3><Badge variant={statusVariant(status)}>{status}</Badge></div><p className="mt-1 text-xs text-zinc-500">Review every selected action before anything is written.</p></div>
      {!terminal ? <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={busy} onClick={() => chooseAll(true)}>Select all</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => chooseAll(false)}>None</Button></div> : null}
    </header>
    <div className="space-y-2 p-3">
      {(expanded ? actions : actions.slice(0, 2)).map((action) => <div key={action.id} className={`rounded-lg border p-3 ${selected.has(action.id) ? "border-blue-500/30 bg-blue-500/5" : "border-zinc-800 bg-zinc-950 opacity-60"}`}>
        <div className="flex items-start gap-3">
          <input aria-label={`Select ${actionLabels[action.action_type]}`} type="checkbox" className="mt-1 h-4 w-4 accent-blue-500" checked={selected.has(action.id)} disabled={locked} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(action.id) : next.delete(action.id); return next })} />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-zinc-100">{actionLabels[action.action_type]}</span>{action.entity_type ? <Badge>{action.entity_type.replace(/_/g, " ")}</Badge> : null}</div><p className="mt-1 text-xs leading-5 text-zinc-400">{action.summary}</p></div>
        </div>
        {action.title !== null ? <div className="mt-3"><Label htmlFor={`title-${action.id}`} className="text-xs text-zinc-500">Title</Label><Input id={`title-${action.id}`} className="mt-1 h-9 text-sm" value={action.title} disabled={locked} onChange={(event) => edit(action.id, "title", event.target.value)} /></div> : null}
        {action.content !== null ? <div className="mt-3"><Label htmlFor={`content-${action.id}`} className="text-xs text-zinc-500">Content</Label><Textarea id={`content-${action.id}`} className="mt-1 min-h-24 text-sm" value={action.content} disabled={locked} onChange={(event) => edit(action.id, "content", event.target.value)} /></div> : null}
      </div>)}
      {actions.length > 3 ? <Button size="sm" variant="ghost" className="w-full" onClick={() => setExpanded((current) => !current)}>{expanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}{expanded ? "Show less" : `Show all ${actions.length} actions`}</Button> : null}
      {results.length ? <div className="space-y-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">{results.map((result) => <Link key={result.entity_id} to={`/knowledge/entities/${result.entity_id}`} className="flex items-center justify-between gap-3 text-sm text-blue-200 hover:text-blue-100"><span className="truncate">{result.title || "Open entity"}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" /></Link>)}</div> : null}
      {error ? <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300"><p>{error}</p><p className="mt-1 text-red-200/70">Review the selected fields, then try applying the proposal again.</p></div> : null}
      {!terminal ? <div className="flex justify-end gap-2 pt-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel()}><X className="mr-2 h-3.5 w-3.5" />Cancel</Button><Button size="sm" disabled={busy || selected.size === 0} onClick={() => void execute()}>{busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : status === "failed" ? <RotateCcw className="mr-2 h-3.5 w-3.5" /> : <Check className="mr-2 h-3.5 w-3.5" />}{busy ? "Applying..." : status === "failed" ? `Retry ${selected.size} selected` : `Apply ${selected.size} selected`}</Button></div> : null}
    </div>
  </section>
}

function RecallCard({ message, onPersistedMessage }: Pick<ResponseProps, "message" | "onPersistedMessage">) {
  const payload = asRecord(message.payload)
  const items = Array.isArray(payload.items) ? payload.items as AssistantRecallItem[] : []
  const [selected, setSelected] = useState<AssistantRecallItem | null>(null)
  const [answer, setAnswer] = useState("")
  const [score, setScore] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RecallGradeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!items.length) return null

  async function submit() {
    if (!selected || !answer.trim()) return
    const parsedScore = score ? Number(score) : undefined
    if (parsedScore !== undefined && (!Number.isInteger(parsedScore) || parsedScore < 1 || parsedScore > 5)) {
      setError("Self-score must be a whole number from 1 to 5.")
      return
    }
    setBusy(true); setError(null)
    try {
      const response = await gradeAssistantRecall({
        entity_id: selected.entity.id,
        answer: answer.trim(),
        thread_id: message.thread_id,
        source_message_id: message.id,
        ...(parsedScore ? { self_score: parsedScore } : {}),
      })
      const grade = "grade" in response ? response.grade : response as unknown as RecallGradeResult
      setResult(grade)
      if ("message" in response && response.message) onPersistedMessage(response.message)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to grade recall.")
    } finally { setBusy(false) }
  }

  return <section className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
    <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-amber-300" /><h3 className="text-sm font-medium text-zinc-100">Recall session</h3><Badge variant="warning">{items.length} due</Badge></div>
    {!selected ? <div className="mt-3 grid gap-2">{items.map((item) => <button type="button" key={item.entity.id} onClick={() => { setSelected(item); setResult(null) }} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left hover:border-amber-500/30"><p className="text-sm font-medium text-zinc-100">{item.entity.title || "Untitled entity"}</p><p className="mt-1 text-xs text-zinc-500">{item.due_reasons.join(" / ")}</p></button>)}</div> : result ? <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-300" /><span className="font-mono text-sm text-blue-200">{result.recalled_score}/5</span></div>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{result.feedback}</p>
      {result.missed_points.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">{result.missed_points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setSelected(null); setAnswer(""); setScore(""); setResult(null) }}>Choose another</Button><Button asChild size="sm" variant="ghost"><Link to={`/knowledge/entities/${selected.entity.id}`}>Open note</Link></Button></div>
    </div> : <div className="mt-3 space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div><p className="text-sm font-medium text-zinc-100">Explain {selected.entity.title || "this note"} from memory</p><p className="mt-1 text-xs text-zinc-500">{selected.due_reasons.join(" / ")}</p></div>
      <div><Label htmlFor={`recall-answer-${message.id}`}>Your answer</Label><Textarea id={`recall-answer-${message.id}`} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write what you remember without opening the note..." className="mt-1 min-h-32" /></div>
      <div><Label htmlFor={`recall-score-${message.id}`}>Self-score (optional)</Label><Input id={`recall-score-${message.id}`} type="number" min="1" max="5" value={score} onChange={(event) => setScore(event.target.value)} placeholder="1 to 5" className="mt-1 max-w-40" /></div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setSelected(null)}>Back</Button><Button size="sm" disabled={busy || !answer.trim()} onClick={() => void submit()}>{busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}{busy ? "Grading..." : "Submit recall"}</Button></div>
    </div>}
  </section>
}

function ResultCard({ message }: { message: AssistantMessage }) {
  const payload = asRecord(message.payload)
  const kind = payload.kind
  if (kind !== "execution_result" && kind !== "recall_result") return null
  const results = Array.isArray(payload.results) ? payload.results.map(asRecord) : []
  const grade = asRecord(payload.grade)
  return <section className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-300" /><span className="text-sm font-medium text-zinc-100">{kind === "execution_result" ? "Changes applied" : "Recall complete"}</span></div>
    {results.length ? <div className="mt-3 space-y-2">{results.map((item, index) => typeof item.entity_id === "string" ? <Link key={String(item.action_id ?? index)} to={`/knowledge/entities/${item.entity_id}`} className="flex items-center justify-between text-sm text-blue-200 hover:text-blue-100"><span>{typeof item.title === "string" ? item.title : "Open entity"}</span><ExternalLink className="h-3.5 w-3.5" /></Link> : null)}</div> : null}
    {kind === "recall_result" && typeof grade.recalled_score === "number" ? <div className="mt-3"><p className="font-mono text-sm text-blue-200">{grade.recalled_score}/5</p>{typeof grade.feedback === "string" ? <p className="mt-1 text-sm leading-6 text-zinc-300">{grade.feedback}</p> : null}</div> : null}
  </section>
}

export function AssistantResponse({ message, onUseText, onPersistedMessage, onRetry }: ResponseProps) {
  const payload = asRecord(message.payload)
  const kind = typeof payload.kind === "string" ? payload.kind : "answer"
  const questions = Array.isArray(payload.questions) ? payload.questions.filter((item): item is string => typeof item === "string") : []
  const timestamp = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.created_at)), [message.created_at])
  if (message.role === "user") {
    return <article className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm leading-6 text-white"><p className="whitespace-pre-wrap break-words">{message.content}</p><p className="mt-1 text-right font-mono text-[10px] text-blue-100/70">{timestamp}</p></article>
  }
  return <article className={`group min-w-0 max-w-3xl rounded-2xl rounded-bl-md border p-4 ${kind === "system_error" ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900"}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">{kind === "system_error" ? <div className="mb-2 flex items-center gap-2 text-sm text-red-300"><AlertCircle className="h-4 w-4" />Assistant error</div> : null}<MarkdownResponse>{message.content}</MarkdownResponse></div>
      <CopyButton value={message.content} label="Copy response" />
    </div>
    {kind === "questions" ? <QuestionsCard questions={questions} onUseText={onUseText} /> : null}
    {kind === "proposal" ? <ProposalCard message={message} onPersistedMessage={onPersistedMessage} /> : null}
    {kind === "recall_due" ? <RecallCard message={message} onPersistedMessage={onPersistedMessage} /> : null}
    <ResultCard message={message} />
    {kind === "system_error" && onRetry ? <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}><RotateCcw className="mr-2 h-3.5 w-3.5" />Retry</Button> : null}
    <footer className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-600"><span>{timestamp}</span>{message.model_stage ? <><span aria-hidden="true">/</span><span>{message.model_stage}</span></> : null}</footer>
  </article>
}
