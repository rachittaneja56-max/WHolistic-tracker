import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatEntityDate } from "@/features/entities/metadata"
import { getTagEntities, getTagTaxonomy, type Entity, type TagTaxonomyItem } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load tags."
}

function matchesCoverageFilters(tag: TagTaxonomyItem, filters: Filters) {
  if (filters.lowConfidenceOnly && tag.average_confidence_score >= 0.7) {
    return false
  }
  if (filters.openTasksOnly && tag.open_task_count === 0) {
    return false
  }
  if (filters.manyEntitiesOnly && tag.total_entity_count < 3) {
    return false
  }
  if (filters.noRecentReviewOnly && tag.review_due_count === 0) {
    return false
  }
  return true
}

type TagSort = "coverage" | "name" | "weakest" | "due"

type Filters = {
  lowConfidenceOnly: boolean
  openTasksOnly: boolean
  manyEntitiesOnly: boolean
  noRecentReviewOnly: boolean
}

const defaultFilters: Filters = {
  lowConfidenceOnly: false,
  openTasksOnly: false,
  manyEntitiesOnly: false,
  noRecentReviewOnly: false,
}

export function TagsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTag = searchParams.get("tag") ?? ""
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState<TagSort>("coverage")
  const [taxonomy, setTaxonomy] = useState<TagTaxonomyItem[]>([])
  const [tagEntities, setTagEntities] = useState<Entity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEntitiesLoading, setIsEntitiesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entitiesError, setEntitiesError] = useState<string | null>(null)

  async function loadTaxonomy() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getTagTaxonomy()
      setTaxonomy(result.tags)
    } catch (loadError) {
      setTaxonomy([])
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTaxonomy()
  }, [])

  useEffect(() => {
    if (!selectedTag) {
      setTagEntities([])
      setEntitiesError(null)
      setIsEntitiesLoading(false)
      return
    }

    let isMounted = true

    async function loadTagEntities() {
      setIsEntitiesLoading(true)
      setEntitiesError(null)

      try {
        const result = await getTagEntities(selectedTag)
        if (!isMounted) {
          return
        }
        setTagEntities(result)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setTagEntities([])
        setEntitiesError(getErrorMessage(loadError))
      } finally {
        if (isMounted) {
          setIsEntitiesLoading(false)
        }
      }
    }

    void loadTagEntities()

    return () => {
      isMounted = false
    }
  }, [selectedTag])

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const matches = taxonomy.filter((tag) => {
      return matchesCoverageFilters(tag, filters) && (!normalizedQuery || tag.tag.toLowerCase().includes(normalizedQuery))
    })

    return [...matches].sort((left, right) => {
      if (sortBy === "name") {
        return left.tag.localeCompare(right.tag)
      }
      if (sortBy === "weakest") {
        return left.average_confidence_score - right.average_confidence_score || right.total_entity_count - left.total_entity_count
      }
      if (sortBy === "due") {
        return right.review_due_count - left.review_due_count || right.total_entity_count - left.total_entity_count
      }
      return right.total_entity_count - left.total_entity_count || left.tag.localeCompare(right.tag)
    })
  }, [filters, query, sortBy, taxonomy])

  const taxonomySummary = useMemo(() => ({
    tagCount: taxonomy.length,
    taggedReferences: taxonomy.reduce((total, tag) => total + tag.total_entity_count, 0),
    weakTags: taxonomy.filter((tag) => tag.average_confidence_score < 0.7).length,
    dueTags: taxonomy.filter((tag) => tag.review_due_count > 0).length,
  }), [taxonomy])

  const selectedTaxonomyItem = useMemo(
    () => taxonomy.find((tag) => tag.tag === selectedTag) ?? null,
    [selectedTag, taxonomy],
  )

  const coverageGaps = useMemo(() => {
    return {
      manyLowConfidence: taxonomy
        .filter((tag) => tag.total_entity_count >= 3 && tag.average_confidence_score < 0.7)
        .sort((left, right) => left.average_confidence_score - right.average_confidence_score)
        .slice(0, 6),
      openTasksNoNotes: taxonomy
        .filter((tag) => tag.open_task_count > 0 && (tag.entity_counts_by_type.note ?? 0) === 0)
        .sort((left, right) => right.open_task_count - left.open_task_count)
        .slice(0, 6),
      projectsWithoutConceptsOrTils: taxonomy
        .filter((tag) => {
          const projectFootprint = (tag.entity_counts_by_type.project ?? 0) + (tag.entity_counts_by_type.milestone ?? 0) + (tag.entity_counts_by_type.task ?? 0)
          const conceptCoverage = (tag.entity_counts_by_type.concept ?? 0) + (tag.entity_counts_by_type.til ?? 0)
          return projectFootprint > 0 && conceptCoverage === 0
        })
        .sort((left, right) => right.total_entity_count - left.total_entity_count)
        .slice(0, 6),
    }
  }, [taxonomy])

  function selectTag(tag: string) {
    const next = new URLSearchParams(searchParams)
    next.set("tag", tag)
    setSearchParams(next)
  }

  function clearSelectedTag() {
    const next = new URLSearchParams(searchParams)
    next.delete("tag")
    setSearchParams(next)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tag Taxonomy</CardTitle>
          <CardDescription>Tags are still derived directly from `entities.tags`. No tags table is introduced here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Tags", taxonomySummary.tagCount],
              ["Tagged references", taxonomySummary.taggedReferences],
              ["Weak tags", taxonomySummary.weakTags],
              ["Tags with reviews due", taxonomySummary.dueTags],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                <p className="mt-2 font-mono text-lg text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label htmlFor="tag-search" className="sr-only">Search tags</label>
              <Input id="tag-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tags..." />
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as TagSort)}>
              <SelectTrigger aria-label="Sort tags">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="coverage">Most used</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="weakest">Lowest confidence</SelectItem>
                <SelectItem value="due">Most reviews due</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={filters.lowConfidenceOnly ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, lowConfidenceOnly: !current.lowConfidenceOnly }))}>
              Low confidence tags
            </Button>
            <Button type="button" variant={filters.openTasksOnly ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, openTasksOnly: !current.openTasksOnly }))}>
              Open tasks
            </Button>
            <Button type="button" variant={filters.manyEntitiesOnly ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, manyEntitiesOnly: !current.manyEntitiesOnly }))}>
              Many entities
            </Button>
            <Button type="button" variant={filters.noRecentReviewOnly ? "default" : "outline"} onClick={() => setFilters((current) => ({ ...current, noRecentReviewOnly: !current.noRecentReviewOnly }))}>
              No recent review
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilters(defaultFilters)
                setQuery("")
              }}
            >
              Clear filters
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filteredTags.length} of {taxonomy.length} tags.
          </p>

          {error ? <p className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning">{error}</p> : null}
          {isLoading ? <p className="text-sm text-muted-foreground">Loading tag taxonomy...</p> : null}

          {!isLoading && !error ? (
            filteredTags.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredTags.map((tag) => (
                  <button
                    key={tag.tag}
                    type="button"
                    onClick={() => selectTag(tag.tag)}
                    className={`rounded-lg border bg-surface px-4 py-4 text-left transition-colors hover:border-primary/40 ${selectedTag === tag.tag ? "border-primary/70 ring-1 ring-primary/30" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm text-foreground">#{tag.tag}</span>
                      <Badge variant="blue">{tag.total_entity_count}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(tag.entity_counts_by_type)
                        .slice(0, 4)
                        .map(([type, count]) => (
                          <Badge key={type}>{type}:{count}</Badge>
                        ))}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">avg confidence</p>
                        <p className="mt-1 font-mono text-sm text-foreground">{tag.average_confidence_score.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">open tasks</p>
                        <p className="mt-1 font-mono text-sm text-foreground">{tag.open_task_count}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">review due</p>
                        <p className="mt-1 font-mono text-sm text-foreground">{tag.review_due_count}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">last activity</p>
                        <p className="mt-1 font-mono text-sm text-foreground">{formatEntityDate(tag.last_activity_at)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">No tags match the current filters yet.</div>
            )
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Coverage Gaps</CardTitle>
            <CardDescription>Tags with many references but fading confidence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coverageGaps.manyLowConfidence.length > 0 ? coverageGaps.manyLowConfidence.map((tag) => (
              <button key={tag.tag} type="button" onClick={() => selectTag(tag.tag)} className="w-full rounded-lg border border-border bg-background px-4 py-3 text-left">
                <p className="font-mono text-sm text-foreground">#{tag.tag}</p>
                <p className="mt-1 text-sm text-secondary">{tag.total_entity_count} entities, confidence {tag.average_confidence_score.toFixed(2)}</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No large low-confidence gaps yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Tasks, No Notes</CardTitle>
            <CardDescription>Tags carrying task load without note coverage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coverageGaps.openTasksNoNotes.length > 0 ? coverageGaps.openTasksNoNotes.map((tag) => (
              <button key={tag.tag} type="button" onClick={() => selectTag(tag.tag)} className="w-full rounded-lg border border-border bg-background px-4 py-3 text-left">
                <p className="font-mono text-sm text-foreground">#{tag.tag}</p>
                <p className="mt-1 text-sm text-secondary">{tag.open_task_count} open tasks and no note entities.</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No note-coverage gaps showed up here.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Tags Missing Concepts</CardTitle>
            <CardDescription>Tags present in projects without concepts or TIL support yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coverageGaps.projectsWithoutConceptsOrTils.length > 0 ? coverageGaps.projectsWithoutConceptsOrTils.map((tag) => (
              <button key={tag.tag} type="button" onClick={() => selectTag(tag.tag)} className="w-full rounded-lg border border-border bg-background px-4 py-3 text-left">
                <p className="font-mono text-sm text-foreground">#{tag.tag}</p>
                <p className="mt-1 text-sm text-secondary">Project work exists here, but concepts and TILs do not.</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No concept coverage gaps showed up here.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Tagged Entities</CardTitle>
              <CardDescription>{selectedTag ? `Entities carrying #${selectedTag}.` : "Choose a tag to inspect the entities behind it."}</CardDescription>
            </div>
            {selectedTag ? (
              <div className="flex flex-wrap gap-2">
                {selectedTaxonomyItem && selectedTaxonomyItem.review_due_count > 0 ? (
                  <Button asChild>
                    <Link to={`/knowledge/recall?tag=${encodeURIComponent(selectedTag)}`}>
                      Review {selectedTaxonomyItem.review_due_count} due
                    </Link>
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={clearSelectedTag}>
                  Clear selected tag
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedTag ? <p className="text-sm text-muted-foreground">Select any tag card above to open its entity list.</p> : null}
          {selectedTag && isEntitiesLoading ? <p className="text-sm text-muted-foreground">Loading entities for #{selectedTag}...</p> : null}
          {selectedTag && entitiesError ? <p className="text-sm text-warning">{entitiesError}</p> : null}
          {selectedTag && !isEntitiesLoading && !entitiesError ? (
            tagEntities.length > 0 ? (
              <div className="space-y-3">
                {tagEntities.map((entity) => (
                  <Link key={entity.id} to={`/knowledge/entities/${entity.id}`} className="block rounded-lg border border-border bg-surface px-4 py-4 transition-colors hover:border-primary/40">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-foreground">{entity.title ?? "Untitled entity"}</p>
                      <div className="flex items-center gap-2">
                        {entity.type ? <Badge variant="blue">{entity.type}</Badge> : null}
                        <span className="font-mono text-xs text-muted-foreground">{entity.confidence_score.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-secondary">{entity.content?.slice(0, 180) || "No content preview available."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entity.tags.map((tag) => (
                        <Badge key={`${entity.id}-${tag}`}>{tag}</Badge>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">No entities currently use this tag.</div>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

