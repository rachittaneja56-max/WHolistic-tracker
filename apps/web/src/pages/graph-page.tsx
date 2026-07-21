import { useEffect, useMemo, useRef, useState } from "react"
import cytoscape from "cytoscape"
import type { ElementDefinition } from "cytoscape"
import { useOutletContext } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { useTheme } from "@/features/theme/theme-provider"
import {
  decayConfidenceJob,
  entityTypeOptions,
  getGraph,
  revisitEntity,
  type EntityType,
  type GraphPayload,
} from "@/lib/api"

const minConfidenceOptions = [
  { value: "0", label: "Any confidence" },
  { value: "0.25", label: "0.25+" },
  { value: "0.5", label: "0.50+" },
  { value: "0.75", label: "0.75+" },
] as const

const NODE_MIN_SIZE = 92
const NODE_MAX_SIZE = 140
const NODE_LABEL_MAX_LINE_LENGTH = 12
const NODE_LABEL_MAX_LINES = 4
const DESKTOP_GRAPH_BREAKPOINT = 768

type GraphFilters = {
  type: EntityType | "all"
  tag: string
  minConfidence: string
}

type GraphSelection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null

function isDesktopGraphViewport() {
  return typeof window === "undefined" || window.innerWidth >= DESKTOP_GRAPH_BREAKPOINT
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load graph data."
}

function formatDate(value: string | null) {
  if (!value) {
    return "No timestamp"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getNodeOpacity(confidenceScore: number) {
  return Math.max(0.28, Math.min(1, 0.2 + confidenceScore * 0.8))
}

function semanticColor(variable: string, fallback: string) {
  if (typeof document === "undefined") return fallback
  const channels = window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return channels ? `rgb(${channels.split(/\s+/).join(", ")})` : fallback
}

function getNodeColor(_type: string | null) {
  return semanticColor("--primary-strong", "rgb(67, 56, 202)")
}

function splitLongWord(word: string, maxLength: number) {
  const parts: string[] = []

  for (let start = 0; start < word.length; start += maxLength) {
    parts.push(word.slice(start, start + maxLength))
  }

  return parts
}

function wrapNodeTitle(title: string) {
  const sanitized = title.trim().replace(/\s+/g, " ")
  if (!sanitized) {
    return ["Untitled"]
  }

  const rawWords = sanitized.split(" ")
  const words = rawWords.flatMap((word) => (word.length > NODE_LABEL_MAX_LINE_LENGTH ? splitLongWord(word, NODE_LABEL_MAX_LINE_LENGTH) : [word]))
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= NODE_LABEL_MAX_LINE_LENGTH) {
      currentLine = candidate
      continue
    }

    if (currentLine) {
      lines.push(currentLine)
    }
    currentLine = word
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  const cappedLines = lines.slice(0, NODE_LABEL_MAX_LINES)
  if (lines.length > NODE_LABEL_MAX_LINES) {
    const lastLine = cappedLines[cappedLines.length - 1] ?? ""
    cappedLines[cappedLines.length - 1] = lastLine.length >= NODE_LABEL_MAX_LINE_LENGTH ? `${lastLine.slice(0, NODE_LABEL_MAX_LINE_LENGTH - 1)}…` : `${lastLine}…`
  }

  return cappedLines
}

function getNodePresentation(title: string | null) {
  const lines = wrapNodeTitle(title ?? "Untitled entity")
  const longestLineLength = lines.reduce((longest, line) => Math.max(longest, line.length), 0)
  const size = clamp(Math.max(NODE_MIN_SIZE, longestLineLength * 7.2 + 28, lines.length * 19 + 36), NODE_MIN_SIZE, NODE_MAX_SIZE)
  const fontSize = size >= 122 ? 11 : 10

  return {
    label: lines.join("\n"),
    size,
    fontSize,
    textWidth: size - 24,
  }
}

function buildElements(graph: GraphPayload): ElementDefinition[] {
  const nodeElements: ElementDefinition[] = graph.nodes.map((node) => {
    const presentation = getNodePresentation(node.title)

    return {
      data: {
        id: node.id,
        label: presentation.label,
        opacity: getNodeOpacity(node.confidence_score),
        color: getNodeColor(node.type),
        size: presentation.size,
        fontSize: presentation.fontSize,
        textWidth: presentation.textWidth,
      },
    }
  })

  const edgeElements: ElementDefinition[] = graph.edges
    .filter((edge) => edge.from_id && edge.to_id)
    .map((edge) => ({
      data: {
        id: edge.id,
        source: edge.from_id,
        target: edge.to_id,
        label: edge.relation_type ?? "confirmed",
      },
    }))

  return [...nodeElements, ...edgeElements]
}

export function GraphPage() {
  const { resolvedTheme } = useTheme()
  const { refreshEntities, upsertEntityInList } = useOutletContext<EntitiesLayoutContext>()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [], total_nodes: 0, truncated: false })
  const [filters, setFilters] = useState<GraphFilters>({ type: "all", tag: "", minConfidence: "0" })
  const [draftFilters, setDraftFilters] = useState<GraphFilters>({ type: "all", tag: "", minConfidence: "0" })
  const [selection, setSelection] = useState<GraphSelection>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRevisiting, setIsRevisiting] = useState(false)
  const [isDecayRunning, setIsDecayRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decayMessage, setDecayMessage] = useState<string | null>(null)
  const [isDesktopViewport, setIsDesktopViewport] = useState(isDesktopGraphViewport)
  const [isMobileGraphEnabled, setIsMobileGraphEnabled] = useState(false)
  const isInteractiveGraphVisible = isDesktopViewport || isMobileGraphEnabled

  const selectedNode = useMemo(() => {
    if (!selection || selection.kind !== "node") {
      return null
    }
    return graph.nodes.find((node) => node.id === selection.id) ?? null
  }, [graph.nodes, selection])

  const selectedEdge = useMemo(() => {
    if (!selection || selection.kind !== "edge") {
      return null
    }
    return graph.edges.find((edge) => edge.id === selection.id) ?? null
  }, [graph.edges, selection])

  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    graph.edges.forEach((edge) => {
      if (edge.from_id) counts.set(edge.from_id, (counts.get(edge.from_id) ?? 0) + 1)
      if (edge.to_id) counts.set(edge.to_id, (counts.get(edge.to_id) ?? 0) + 1)
    })
    return counts
  }, [graph.edges])

  const connectedLinks = useMemo(() => {
    if (!selectedNode) {
      return []
    }

    return graph.edges
      .filter((edge) => edge.from_id === selectedNode.id || edge.to_id === selectedNode.id)
      .map((edge) => {
        const counterpartId = edge.from_id === selectedNode.id ? edge.to_id : edge.from_id
        return {
          edge,
          counterpart: counterpartId ? nodeMap.get(counterpartId) ?? null : null,
        }
      })
  }, [graph.edges, nodeMap, selectedNode])

  async function loadGraph(nextFilters: GraphFilters) {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getGraph({
        type: nextFilters.type === "all" ? undefined : nextFilters.type,
        tag: nextFilters.tag.trim() || undefined,
        min_confidence: Number(nextFilters.minConfidence),
      })
      setGraph(result)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
      setGraph({ nodes: [], edges: [], total_nodes: 0, truncated: false })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadGraph(filters)
  }, [filters])

  useEffect(() => {
    const updateViewport = () => setIsDesktopViewport(isDesktopGraphViewport())
    updateViewport()
    window.addEventListener("resize", updateViewport)
    return () => window.removeEventListener("resize", updateViewport)
  }, [])

  useEffect(() => {
    if (!selection) {
      return
    }

    if (selection.kind === "node" && !graph.nodes.some((node) => node.id === selection.id)) {
      setSelection(null)
      return
    }

    if (selection.kind === "edge" && !graph.edges.some((edge) => edge.id === selection.id)) {
      setSelection(null)
    }
  }, [graph.edges, graph.nodes, selection])

  useEffect(() => {
    if (!isInteractiveGraphVisible || !containerRef.current) {
      return
    }

    const colors = {
      nodeText: semanticColor("--primary-foreground", "rgb(255, 255, 255)"),
      border: semanticColor("--border-strong", "rgb(100, 116, 139)"),
      primary: semanticColor("--primary", "rgb(79, 70, 229)"),
      muted: semanticColor("--text-muted", "rgb(100, 116, 139)"),
      canvas: semanticColor("--canvas", "rgb(248, 250, 252)"),
      selected: semanticColor("--text", "rgb(15, 23, 42)"),
    }
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(graph),
      layout: {
        name: "cose",
        animate: false,
        padding: 36,
        nodeRepulsion: 180000,
        idealEdgeLength: 140,
      },
      style: [
        {
          selector: "node",
          style: {
            shape: "ellipse",
            "background-color": "data(color)",
            label: "data(label)",
            color: colors.nodeText,
            opacity: "data(opacity)",
            width: "data(size)",
            height: "data(size)",
            "font-size": "data(fontSize)",
            "font-weight": 500,
            "text-wrap": "wrap",
            "text-max-width": "data(textWidth)",
            "text-valign": "center",
            "text-halign": "center",
            "text-justification": "center",
            "line-height": 1.1,
            "border-width": 1,
            "border-color": colors.border,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": colors.primary,
            "target-arrow-color": colors.primary,
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            color: colors.muted,
            "font-size": 9,
            "text-background-color": colors.canvas,
            "text-background-opacity": 1,
            "text-background-padding": 2,
          },
        },
        {
          selector: ":selected",
          style: {
            "border-color": colors.selected,
            "border-width": 2,
          },
        },
      ] as any,
    })

    cy.on("tap", "node", (event) => {
      setSelection({ kind: "node", id: event.target.id() })
    })

    cy.on("tap", "edge", (event) => {
      setSelection({ kind: "edge", id: event.target.id() })
    })

    cy.on("tap", (event) => {
      if (event.target === cy) {
        setSelection(null)
      }
    })

    return () => {
      cy.destroy()
    }
  }, [graph, isInteractiveGraphVisible, resolvedTheme])

  async function handleMarkRevisited() {
    if (!selectedNode) {
      return
    }

    setIsRevisiting(true)
    setError(null)

    try {
      const updatedEntity = await revisitEntity(selectedNode.id)
      upsertEntityInList(updatedEntity)
      await refreshEntities()
      await loadGraph(filters)
      setSelection({ kind: "node", id: updatedEntity.id })
    } catch (revisitError) {
      setError(getErrorMessage(revisitError))
    } finally {
      setIsRevisiting(false)
    }
  }

  async function handleDecayConfidence() {
    setIsDecayRunning(true)
    setDecayMessage(null)
    setError(null)

    try {
      const result = await decayConfidenceJob()
      setDecayMessage(`Processed ${result.processed_count} entities and updated ${result.updated_count}. Half-life: ${result.half_life_days} days.`)
      await refreshEntities()
      await loadGraph(filters)
    } catch (decayError) {
      setError(getErrorMessage(decayError))
    } finally {
      setIsDecayRunning(false)
    }
  }

  const edgeFromNode = selectedEdge?.from_id ? nodeMap.get(selectedEdge.from_id) ?? null : null
  const edgeToNode = selectedEdge?.to_id ? nodeMap.get(selectedEdge.to_id) ?? null : null
  const isEmpty = !isLoading && !error && graph.nodes.length === 0

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Graph</CardTitle>
            <CardDescription>Confirmed links only. Parent hierarchy is intentionally not rendered as graph edges here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid gap-4 lg:grid-cols-[220px_1fr_180px_auto_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                setFilters(draftFilters)
              }}
            >
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={draftFilters.type} onValueChange={(value) => setDraftFilters((current) => ({ ...current, type: value as EntityType | "all" }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {entityTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="graph-tag">Tag</Label>
                <Input
                  id="graph-tag"
                  value={draftFilters.tag}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, tag: event.target.value }))}
                  placeholder="Filter by one tag"
                />
              </div>

              <div className="space-y-2">
                <Label>Min confidence</Label>
                <Select value={draftFilters.minConfidence} onValueChange={(value) => setDraftFilters((current) => ({ ...current, minConfidence: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any confidence" />
                  </SelectTrigger>
                  <SelectContent>
                    {minConfidenceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button type="submit" variant="outline">
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const resetFilters: GraphFilters = { type: "all", tag: "", minConfidence: "0" }
                    setDraftFilters(resetFilters)
                    setFilters(resetFilters)
                  }}
                >
                  Reset
                </Button>
              </div>
            </form>

            {isLoading ? <p className="text-sm text-muted-foreground">Loading graph...</p> : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {graph.truncated ? <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground" role="status">Showing the first {graph.nodes.length.toLocaleString()} of {graph.total_nodes.toLocaleString()} matching entities. Refine the filters before opening a larger graph.</p> : null}

            {!isInteractiveGraphVisible ? (
              <section className="space-y-3 md:hidden" aria-labelledby="mobile-graph-list-title">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 id="mobile-graph-list-title" className="text-sm font-semibold text-foreground">Filtered entities</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Tap an entity to inspect its connections.</p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{graph.nodes.length}</span>
                </div>
                <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setIsMobileGraphEnabled(true)} disabled={isLoading || graph.nodes.length === 0}>
                  Open interactive graph
                </Button>
                {graph.nodes.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
                  {graph.nodes.map((node) => {
                    const connectionCount = connectionCounts.get(node.id) ?? 0
                    const isSelected = selection?.kind === "node" && selection.id === node.id
                    return <li key={node.id}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelection({ kind: "node", id: node.id })}
                        className={`min-h-11 w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${isSelected ? "bg-primary/10" : "hover:bg-surface"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-sm font-medium text-foreground">{node.title ?? "Untitled entity"}</span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{Math.round(node.confidence_score * 100)}%</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="blue" className="capitalize">{node.type ?? "unknown"}</Badge>
                          {node.tags.slice(0, 3).map((tag) => <Badge key={tag}>{tag}</Badge>)}
                          {node.tags.length > 3 ? <Badge>+{node.tags.length - 3}</Badge> : null}
                          <span className="ml-auto text-[11px] text-muted-foreground">{connectionCount} {connectionCount === 1 ? "connection" : "connections"}</span>
                        </div>
                      </button>
                    </li>
                  })}
                </ul> : null}
                {isEmpty ? <div className="rounded-xl border border-border bg-background px-5 py-6 text-center"><p className="text-sm font-medium text-foreground">No graph data yet</p><p className="mt-2 text-sm text-muted-foreground">Create an entity and confirm a link to populate this list.</p></div> : null}
              </section>
            ) : null}

            {isInteractiveGraphVisible ? <>
              <Button type="button" variant="outline" className="min-h-11 w-full md:hidden" onClick={() => {
                setIsMobileGraphEnabled(false)
                if (selection?.kind === "edge") setSelection(null)
              }}>
                Show entity list
              </Button>
              <div className="relative rounded-xl border border-border bg-background">
                <div ref={containerRef} className="h-[65dvh] min-h-[420px] w-full md:h-[70vh] md:min-h-[560px]" />
                {isEmpty ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
                    <div className="max-w-md space-y-2 rounded-lg border border-border bg-background/95 px-5 py-4">
                      <p className="text-sm font-medium text-foreground">No graph data yet</p>
                      <p className="text-sm text-muted-foreground">Create an entity and confirm a link to populate the graph. Hierarchy stays out of this view on purpose.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </> : null}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="font-mono">Nodes: {graph.nodes.length}{graph.truncated ? ` of ${graph.total_nodes}` : ""}</span>
              <span className="font-mono">Confirmed edges: {graph.edges.length}</span>
              <span>Low-confidence nodes fade using their current `confidence_score`.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit xl:sticky xl:top-6">
        <CardHeader>
          <CardTitle>Inspector</CardTitle>
          <CardDescription>Select an entity, node, or edge to inspect confidence, relation details, and connected links.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selection ? <p className="text-sm text-muted-foreground">Select an entity from the list or interactive graph to inspect it.</p> : null}

          {selectedNode ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="blue">{selectedNode.type ?? "unknown"}</Badge>
                  {selectedNode.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                <h2 className="text-xl font-semibold text-foreground">{selectedNode.title ?? "Untitled entity"}</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Confidence</p>
                  <p className="mt-2 font-mono text-sm text-foreground">{selectedNode.confidence_score.toFixed(3)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Last revisited</p>
                  <p className="mt-2 font-mono text-sm text-foreground">{formatDate(selectedNode.last_revisited_at)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4 font-mono text-xs text-muted-foreground">
                Created {formatDate(selectedNode.created_at)}
              </div>

              <Button type="button" onClick={() => void handleMarkRevisited()} disabled={isRevisiting}>
                {isRevisiting ? "Marking..." : "Mark revisited"}
              </Button>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Connected links</h3>
                {connectedLinks.length === 0 ? <p className="text-sm text-muted-foreground">No confirmed links touch this node yet.</p> : null}
                {connectedLinks.map(({ edge, counterpart }) => (
                  <div key={edge.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{counterpart?.title ?? "Unknown entity"}</p>
                      <p className="font-mono text-xs text-muted-foreground">{edge.relation_type ?? "confirmed"}</p>
                    </div>
                    <p className="mt-2 text-sm text-secondary">{edge.explanation ?? "No explanation provided."}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {selectedEdge ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{selectedEdge.relation_type ?? "confirmed"}</p>
                <h2 className="text-xl font-semibold text-foreground">Connection detail</h2>
                <p className="text-sm leading-7 text-secondary">{selectedEdge.explanation ?? "No explanation provided."}</p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">From</p>
                  <p className="mt-2 text-sm text-foreground">{edgeFromNode?.title ?? "Unknown entity"}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{edgeFromNode?.type ?? "unknown"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">To</p>
                  <p className="mt-2 text-sm text-foreground">{edgeToNode?.title ?? "Unknown entity"}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{edgeToNode?.type ?? "unknown"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4 font-mono text-xs text-muted-foreground">
                  Status {selectedEdge.status ?? "confirmed"}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
