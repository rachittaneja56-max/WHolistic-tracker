import { useEffect, useMemo, useState } from "react"
import { Link, useOutletContext, useSearchParams } from "react-router-dom"
import { Bookmark, BookmarkCheck, Search, SlidersHorizontal, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { usePreferences } from "@/features/preferences/preferences-context"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { entityTypeOptions, searchEntities, type EntitySearchQuery, type EntitySearchResult, type SearchSort } from "@/lib/api"

type Filters = {
  type: string; subject_id: string; term: string; tags: string; min_confidence: string; recall_state: string
  created_after: string; updated_after: string; sort: SearchSort
}

const initialFilters: Filters = { type: "", subject_id: "", term: "", tags: "", min_confidence: "", recall_state: "", created_after: "", updated_after: "", sort: "relevance" }
const templates = [
  ["lecture", "Lecture", "Key ideas, examples, questions, and follow-up."], ["lab", "Lab", "Setup, observations, results, and fixes."],
  ["reading", "Reading", "Argument, evidence, notes, and connections."], ["debugging", "Debugging", "Symptoms, hypothesis, investigation, and resolution."],
  ["project-decision", "Project decision", "Context, options, decision, and consequences."], ["exam-summary", "Exam summary", "Concept map, weak areas, and revision prompts."],
] as const

function highlight(text: string, ranges: Array<{ start: number; end: number }>) {
  const range = ranges[0]
  if (!range) return text
  return <>{text.slice(0, range.start)}<mark className="rounded bg-primary/20 px-0.5 text-inherit">{text.slice(range.start, range.end)}</mark>{text.slice(range.end)}</>
}

function toQuery(query: string, filters: Filters, cursor?: string): EntitySearchQuery {
  return {
    q: query, type: (filters.type || undefined) as EntitySearchQuery["type"], subject_id: filters.subject_id || undefined, term: filters.term || undefined,
    tags: filters.tags.split(",").map((tag) => tag.trim()).filter(Boolean), min_confidence: filters.min_confidence ? Number(filters.min_confidence) : undefined,
    recall_state: filters.recall_state as EntitySearchQuery["recall_state"], created_after: filters.created_after || undefined,
    updated_after: filters.updated_after || undefined, sort: filters.sort, cursor, limit: 30,
  }
}

export function AllEntitiesPage() {
  const { entities } = useOutletContext<EntitiesLayoutContext>()
  const { preferences, updatePreferences } = usePreferences()
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState(initialFilters)
  const [results, setResults] = useState<EntitySearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveName, setSaveName] = useState("")

  const subjects = useMemo(() => entities.filter((entity) => entity.type === "subject_topic" && !entity.parent_id), [entities])
  const activeLabels = useMemo(() => [query && `Search: ${query}`, filters.type && `Type: ${filters.type}`, filters.subject_id && "Subject", filters.term && `Term: ${filters.term}`, filters.tags && `Tags: ${filters.tags}`, filters.min_confidence && `Confidence ≥ ${filters.min_confidence}`, filters.recall_state && `Recall: ${filters.recall_state}`, filters.created_after && "Created since", filters.updated_after && "Updated since"].filter(Boolean), [filters, query])

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [input])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    void searchEntities(toQuery(query, filters)).then((response) => {
      if (cancelled) return
      setResults(response.results); setTotal(response.total); setCursor(response.next_cursor)
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Search could not be loaded.") }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, filters])

  const updateFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const pinned = new Set(preferences.library_pinned_entity_ids)
  const togglePin = async (id: string) => {
    const ids = pinned.has(id) ? preferences.library_pinned_entity_ids.filter((item) => item !== id) : [...preferences.library_pinned_entity_ids, id]
    await updatePreferences({ library_pinned_entity_ids: ids })
  }
  const saveView = async () => {
    const name = saveName.trim()
    if (!name) return
    const view = { id: crypto.randomUUID(), name, query: { q: query || null, type: filters.type || null, subject_id: filters.subject_id || null, term: filters.term || null, tags: filters.tags || null, min_confidence: filters.min_confidence || null, recall_state: filters.recall_state || null, sort: filters.sort } }
    await updatePreferences({ library_saved_views: [...preferences.library_saved_views, view] })
    setSaveName("")
  }
  const applyView = (view: typeof preferences.library_saved_views[number]) => {
    const value = view.query
    setInput(String(value.q ?? "")); setQuery(String(value.q ?? ""))
    setFilters({ ...initialFilters, type: String(value.type ?? ""), subject_id: String(value.subject_id ?? ""), term: String(value.term ?? ""), tags: String(value.tags ?? ""), min_confidence: String(value.min_confidence ?? ""), recall_state: String(value.recall_state ?? ""), sort: (value.sort as SearchSort) || "relevance" })
  }
  const loadMore = async () => {
    if (!cursor || loading) return
    setLoading(true)
    try { const response = await searchEntities(toQuery(query, filters, cursor)); setResults((current) => [...current, ...response.results]); setCursor(response.next_cursor) } catch (reason) { setError(reason instanceof Error ? reason.message : "More results could not be loaded.") } finally { setLoading(false) }
  }

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Knowledge library</p><h1 className="mt-2 text-3xl font-semibold text-foreground">Find what you learned</h1><p className="mt-1 text-sm text-secondary">Search notes, code, tags, rich content, and course context across your workspace.</p></div><Button asChild><Link to="/capture?type=note">New note</Link></Button></header>

    <Card><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search knowledge" value={input} onChange={(event) => setInput(event.target.value)} className="h-10 pl-9" placeholder="Search title, content, code, tags, or metadata…" /></div>
      <details className="group rounded-lg border border-border bg-background p-3" open><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground"><SlidersHorizontal className="h-4 w-4" />Filters and sorting</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select aria-label="Entity type" value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">All types</option>{entityTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select>
        <select aria-label="Subject" value={filters.subject_id} onChange={(event) => updateFilter("subject_id", event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">All subjects</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title ?? "Untitled subject"}</option>)}</select>
        <Input value={filters.term} onChange={(event) => updateFilter("term", event.target.value)} placeholder="Semester / term" aria-label="Semester or term" />
        <Input value={filters.tags} onChange={(event) => updateFilter("tags", event.target.value)} placeholder="Tags (comma-separated)" aria-label="Tags" />
        <select aria-label="Minimum confidence" value={filters.min_confidence} onChange={(event) => updateFilter("min_confidence", event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">Any confidence</option><option value="0.25">25% or higher</option><option value="0.5">50% or higher</option><option value="0.75">75% or higher</option></select>
        <select aria-label="Recall state" value={filters.recall_state} onChange={(event) => updateFilter("recall_state", event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">Any recall state</option><option value="enabled">Recall enabled</option><option value="due">Due for review</option><option value="revisited">Revisited</option><option value="not_revisited">Not revisited</option></select>
        <Input type="date" value={filters.created_after} onChange={(event) => updateFilter("created_after", event.target.value)} aria-label="Created after" />
        <Input type="date" value={filters.updated_after} onChange={(event) => updateFilter("updated_after", event.target.value)} aria-label="Updated after" />
        <select aria-label="Sort results" value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="relevance">Relevance</option><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="confidence">Confidence</option><option value="revisited">Last revisited</option></select>
      </div></details>
      {activeLabels.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Active:</span>{activeLabels.map((label) => <Badge key={label}>{label}</Badge>)}<Button size="sm" variant="ghost" onClick={() => { setInput(""); setQuery(""); setFilters(initialFilters) }}><X className="mr-1 h-3.5 w-3.5" />Clear</Button></div> : null}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3"><Input value={saveName} onChange={(event) => setSaveName(event.target.value)} className="h-9 max-w-52" placeholder="Save this view" /><Button size="sm" variant="outline" disabled={!saveName.trim()} onClick={() => void saveView()}>Save view</Button>{preferences.library_saved_views.map((view) => <Button key={view.id} size="sm" variant="ghost" onClick={() => applyView(view)}>{view.name}</Button>)}</div>
    </CardContent></Card>

    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Note templates">{templates.map(([id, name, description]) => <Link key={id} to={`/capture?type=note&template=${id}`} className="rounded-lg border border-border bg-surface p-3 transition hover:border-primary/40"><p className="text-sm font-medium text-foreground">{name}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></Link>)}</section>

    <section aria-live="polite"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium text-foreground">{loading && !results.length ? "Searching…" : `${total.toLocaleString()} result${total === 1 ? "" : "s"}`}</h2>{preferences.library_pinned_entity_ids.length ? <span className="text-xs text-muted-foreground">Pinned results carry a bookmark</span> : null}</div>
      {error ? <p className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</p> : null}
      {!error && !loading && !results.length ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No knowledge matches this search. Try removing a filter or searching for a related term.</CardContent></Card> : null}
      <div className="space-y-3">{results.map((result) => <article key={result.entity.id} className="rounded-xl border border-border bg-surface p-4"><div className="flex gap-3"><Link to={`/knowledge/entities/${result.entity.id}`} className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-foreground">{result.entity.title ?? "Untitled entity"}</h3><Badge>{result.entity.type ?? "unknown"}</Badge>{result.parent ? <span className="text-xs text-muted-foreground">in {result.parent.title ?? "Untitled"}{result.parent.term ? ` · ${result.parent.term}` : ""}</span> : null}</div><p className="mt-2 text-sm leading-6 text-secondary">{highlight(result.excerpt, result.highlights)}</p><div className="mt-2 flex flex-wrap gap-1.5">{result.entity.tags.slice(0, 5).map((tag) => <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>)}</div></Link><Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={pinned.has(result.entity.id) ? "Unpin note" : "Pin note"} onClick={() => void togglePin(result.entity.id)}>{pinned.has(result.entity.id) ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <Bookmark className="h-4 w-4" />}</Button></div></article>)}</div>
      {cursor ? <div className="mt-5 flex justify-center"><Button variant="outline" disabled={loading} onClick={() => void loadMore()}>{loading ? "Loading…" : "Load more"}</Button></div> : null}
    </section>
  </div>
}
