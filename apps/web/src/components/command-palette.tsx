import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Command, FilePlus2, Home, Search, Sparkles, X } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Input } from "@/components/ui/input"
import { searchEntities, type EntitySearchResult } from "@/lib/api"

const focusableSelector = "button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex='-1'])"
const commands = [
  { label: "Go to Today", detail: "View your workload", to: "/app", icon: Home },
  { label: "Capture something", detail: "Create a note, task, subject, or project", to: "/capture", icon: FilePlus2 },
  { label: "Ask AI Coach", detail: "Plan, review, or get grounded guidance", to: "/agents/assistant", icon: Sparkles },
  { label: "Search knowledge", detail: "Search across semesters and your workspace", to: "/knowledge/entities", icon: Search },
]

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<EntitySearchResult[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const close = () => { setOpen(false); setQuery(""); setResults([]) }
  const go = (to: string) => { close(); navigate(to) }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true)
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault(); navigate("/capture")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate])

  useEffect(() => { if (open) window.requestAnimationFrame(() => inputRef.current?.focus()) }, [open])
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; triggerRef.current?.focus() } }, [open])
  useEffect(() => {
    if (!open || query.trim().length < 2) { setResults([]); return }
    let cancelled = false
    const timer = window.setTimeout(() => void searchEntities({ q: query.trim(), limit: 5 }).then((response) => { if (!cancelled) setResults(response.results) }).catch(() => { if (!cancelled) setResults([]) }), 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, query])

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return }
    if (event.key !== "Tab") return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    if (!focusable.length) return
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  if (!open) return null
  const matchingCommands = commands.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.detail.toLowerCase().includes(query.toLowerCase()))
  return <div className="fixed inset-0 z-[110] flex items-start justify-center bg-black/60 p-4 pt-[max(1rem,12vh)]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="command-palette-title" aria-describedby="command-palette-help" tabIndex={-1} onKeyDown={onDialogKeyDown} className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none">
      <div className="flex items-center gap-3 border-b border-border p-3"><Command className="h-5 w-5 text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p id="command-palette-title" className="sr-only">Command palette</p><Input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && query.trim()) go(`/knowledge/entities?q=${encodeURIComponent(query.trim())}`) }} placeholder="Search knowledge or run a command" aria-label="Search knowledge or run a command" /></div><button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={close} aria-label="Close command palette"><X className="h-4 w-4" /></button></div>
      <div className="max-h-[min(60vh,32rem)] overflow-y-auto p-2">
        {query.trim().length >= 2 && <><p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Knowledge</p>{results.length ? results.map((result) => <button key={result.entity.id} type="button" onClick={() => go(`/knowledge/entities/${result.entity.id}`)} className="block w-full rounded-lg px-3 py-3 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="block truncate text-sm font-medium text-foreground">{result.entity.title ?? "Untitled entity"}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{result.excerpt || result.entity.type}</span></button>) : <p className="px-3 py-3 text-sm text-muted-foreground">No matching knowledge yet. Press Enter to search the full library.</p>}</>}
        <p className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">Commands</p>{matchingCommands.map((item) => { const Icon = item.icon; return <button key={item.label} type="button" onClick={() => go(item.to)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Icon className="h-4 w-4 text-primary" aria-hidden="true" /><span><span className="block text-sm font-medium text-foreground">{item.label}</span><span className="block text-xs text-muted-foreground">{item.detail}</span></span></button> })}</div>
      <p id="command-palette-help" className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Ctrl/Cmd K opens search - Ctrl/Cmd Shift C opens capture - Esc closes</p>
    </div>
  </div>
}
