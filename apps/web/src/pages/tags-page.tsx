import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

  const filteredTags = useMemo(() => taxonomy.filter((tag) => matchesCoverageFilters(tag, filters)), [filters, taxonomy])

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
            <Button type="button" variant="outline" onClick={() => setFilters(defaultFilters)}>
              Clear filters
            </Button>
          </div>

          {error ? <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">{error}</p> : null}
          {isLoading ? <p className="text-sm text-zinc-500">Loading tag taxonomy...</p> : null}

          {!isLoading && !error ? (
            filteredTags.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredTags.map((tag) => (
                  <button
                    key={tag.tag}
                    type="button"
                    onClick={() => selectTag(tag.tag)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 text-left transition-colors hover:border-blue-500/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-sm text-zinc-100">#{tag.tag}</span>
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
                        <p className="font-mono text-xs text-zinc-500">avg confidence</p>
                        <p className="mt-1 font-mono text-sm text-zinc-100">{tag.average_confidence_score.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-zinc-500">open tasks</p>
                        <p className="mt-1 font-mono text-sm text-zinc-100">{tag.open_task_count}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-zinc-500">review due</p>
                        <p className="mt-1 font-mono text-sm text-zinc-100">{tag.review_due_count}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs text-zinc-500">last activity</p>
                        <p className="mt-1 font-mono text-sm text-zinc-100">{formatEntityDate(tag.last_activity_at)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-6 text-sm text-zinc-500">No tags match the current filters yet.</div>
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
              <button key={tag.tag} type="button" onClick={() => selectTag(tag.tag)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-left">
                <p className="font-mono text-sm text-zinc-100">#{tag.tag}</p>
                <p className="mt-1 text-sm text-zinc-300">{tag.total_entity_count} entities, confidence {tag.average_confidence_score.toFixed(2)}</p>
              </button>
            )) : <p className="text-sm text-zinc-500">No large low-confidence gaps yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Tasks, No Notes</CardTitle>
            <CardDescription>Tags carrying task load without note coverage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coverageGaps.openTasksNoNotes.length > 0 ? coverageGaps.openTasksNoNotes.map((tag) => (
              <button key={tag.tag} type="button" onClick={() => selectTag(tag.tag)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-left">
                <p className="font-mono text-sm text-zinc-100">#{tag.tag}</p>
                <p className="mt-1 text-sm text-zinc-300">{tag.open_task_count} open tasks and no note entities.</p>
              </button>
            )) : <p className="text-sm text-zinc-500">No note-coverage gaps showed up here.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Tags Missing Concepts</CardTitle>
            <CardDescription>Tags present in projects without concepts or TIL support yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coverageGaps.projectsWithoutConceptsOrTils.length > 0 ? coverageGaps.projectsWithoutConceptsOrTils.map((tag) => (
              <button key={tag.tag} type="button" onClick={() => selectTag(tag.tag)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-left">
                <p className="font-mono text-sm text-zinc-100">#{tag.tag}</p>
                <p className="mt-1 text-sm text-zinc-300">Project work exists here, but concepts and TILs do not.</p>
              </button>
            )) : <p className="text-sm text-zinc-500">No concept coverage gaps showed up here.</p>}
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
              <Button type="button" variant="outline" onClick={clearSelectedTag}>
                Clear selected tag
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedTag ? <p className="text-sm text-zinc-500">Select any tag card above to open its entity list.</p> : null}
          {selectedTag && isEntitiesLoading ? <p className="text-sm text-zinc-500">Loading entities for #{selectedTag}...</p> : null}
          {selectedTag && entitiesError ? <p className="text-sm text-amber-300">{entitiesError}</p> : null}
          {selectedTag && !isEntitiesLoading && !entitiesError ? (
            tagEntities.length > 0 ? (
              <div className="space-y-3">
                {tagEntities.map((entity) => (
                  <Link key={entity.id} to={`/entities/${entity.id}`} className="block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 transition-colors hover:border-blue-500/40">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-zinc-100">{entity.title ?? "Untitled entity"}</p>
                      <div className="flex items-center gap-2">
                        {entity.type ? <Badge variant="blue">{entity.type}</Badge> : null}
                        <span className="font-mono text-xs text-zinc-500">{entity.confidence_score.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-zinc-300">{entity.content?.slice(0, 180) || "No content preview available."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entity.tags.map((tag) => (
                        <Badge key={`${entity.id}-${tag}`}>{tag}</Badge>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-6 text-sm text-zinc-500">No entities currently use this tag.</div>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

