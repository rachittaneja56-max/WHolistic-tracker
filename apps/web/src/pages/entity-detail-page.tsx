import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EntityDetailCard } from "@/features/entities/components/entity-detail-card"
import { EntityDeleteControl } from "@/features/entities/components/entity-delete-control"
import { EntityEditor } from "@/features/entities/components/entity-editor"
import { EntityPropertiesEditor } from "@/features/entities/components/entity-properties-editor"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import {
  createLink,
  getEntity,
  getEntityConnections,
  getLinkCandidates,
  refreshEntityEmbedding,
  relationTypeOptions,
  updateEntity,
  type Entity,
  type EntityConnection,
  type LinkCandidate,
  type RelationType,
} from "@/lib/api"

function getLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load entity."
}

function formatScore(value: number) {
  return value.toFixed(4)
}

function formatConnectionDate(value: string | null) {
  if (!value) {
    return "No timestamp"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getEditorTitle(entity: Entity) {
  if (entity.content_type === "blocks") {
    return "BlockNote editor"
  }
  if (entity.content_type === "canvas_json") {
    return "Canvas editor"
  }
  if (entity.content_type === "code") {
    return "Code editor"
  }
  return "Markdown editor"
}

function getEditorDescription(entity: Entity) {
  if (entity.content_type === "blocks") {
    return "This note stays stored as serialized BlockNote JSON in the shared entities table."
  }
  if (entity.content_type === "canvas_json") {
    return "This canvas stays stored as serialized Excalidraw scene JSON in the shared entities table."
  }
  if (entity.content_type === "code") {
    return "Code content still lives in the same entity record and can be edited directly here."
  }
  return "Markdown content still lives in the same entity record and can be edited directly here."
}

function getDraftStorageKey(entityId: string) {
  return `personal-dev-kg:entity-draft:${entityId}`
}

export function EntityDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const entityId = params.entityId
  const { upsertEntityInList, refreshEntities } = useOutletContext<EntitiesLayoutContext>()
  const [entity, setEntity] = useState<Entity | null>(null)
  const [draftContent, setDraftContent] = useState("")
  const [linkCandidates, setLinkCandidates] = useState<LinkCandidate[]>([])
  const [connections, setConnections] = useState<EntityConnection[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<LinkCandidate | null>(null)
  const [relationType, setRelationType] = useState<RelationType | "">("")
  const [linkExplanation, setLinkExplanation] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isCandidatesLoading, setIsCandidatesLoading] = useState(false)
  const [isConnectionsLoading, setIsConnectionsLoading] = useState(false)
  const [isRefreshingEmbedding, setIsRefreshingEmbedding] = useState(false)
  const [isSavingContent, setIsSavingContent] = useState(false)
  const [isCreatingLink, setIsCreatingLink] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidateError, setCandidateError] = useState<string | null>(null)
  const [connectionsError, setConnectionsError] = useState<string | null>(null)
  const [embeddingActionError, setEmbeddingActionError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [linkActionError, setLinkActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) {
      setEntity(null)
      setError("No entity id provided.")
      setIsLoading(false)
      return
    }

    const currentEntityId = entityId
    let isMounted = true

    async function loadEntity() {
      setIsLoading(true)
      setError(null)
      setEntity(null)

      try {
        const result = await getEntity(currentEntityId)
        if (!isMounted) {
          return
        }
        const draftStorageKey = getDraftStorageKey(result.id)
        const persistedDraft = window.localStorage.getItem(draftStorageKey)
        setEntity(result)
        setDraftContent(persistedDraft ?? result.content ?? "")
        upsertEntityInList(result)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setError(getLoadErrorMessage(loadError))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadEntity()

    return () => {
      isMounted = false
    }
  }, [entityId, upsertEntityInList])

  useEffect(() => {
    if (!entity?.id) {
      return
    }

    const draftStorageKey = getDraftStorageKey(entity.id)
    if (draftContent === (entity.content ?? "")) {
      window.localStorage.removeItem(draftStorageKey)
      return
    }

    window.localStorage.setItem(draftStorageKey, draftContent)
  }, [draftContent, entity])

  useEffect(() => {
    if (!entity?.id) {
      setLinkCandidates([])
      setCandidateError(null)
      setIsCandidatesLoading(false)
      return
    }

    if (!entity.has_embedding) {
      setLinkCandidates([])
      setCandidateError("Embedding is missing. Refresh it to view link candidates.")
      setIsCandidatesLoading(false)
      return
    }

    const currentEntityId = entity.id
    let isMounted = true

    async function loadLinkCandidates() {
      setIsCandidatesLoading(true)
      setCandidateError(null)

      try {
        const results = await getLinkCandidates(currentEntityId)
        if (!isMounted) {
          return
        }
        setLinkCandidates(results)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setLinkCandidates([])
        setCandidateError(getLoadErrorMessage(loadError))
      } finally {
        if (isMounted) {
          setIsCandidatesLoading(false)
        }
      }
    }

    void loadLinkCandidates()

    return () => {
      isMounted = false
    }
  }, [entity])

  useEffect(() => {
    if (!entity?.id) {
      setConnections([])
      setConnectionsError(null)
      setIsConnectionsLoading(false)
      return
    }

    const currentEntityId = entity.id
    let isMounted = true

    async function loadConnections() {
      setIsConnectionsLoading(true)
      setConnectionsError(null)

      try {
        const results = await getEntityConnections(currentEntityId)
        if (!isMounted) {
          return
        }
        setConnections(results)
      } catch (loadError) {
        if (!isMounted) {
          return
        }
        setConnections([])
        setConnectionsError(getLoadErrorMessage(loadError))
      } finally {
        if (isMounted) {
          setIsConnectionsLoading(false)
        }
      }
    }

    void loadConnections()

    return () => {
      isMounted = false
    }
  }, [entity?.id])

  const hasUnsavedChanges = useMemo(() => {
    if (!entity) {
      return false
    }
    return draftContent !== (entity.content ?? "")
  }, [draftContent, entity])

  async function handleRefreshEmbedding() {
    if (!entityId) {
      return
    }

    setIsRefreshingEmbedding(true)
    setEmbeddingActionError(null)

    try {
      const refreshedEntity = await refreshEntityEmbedding(entityId)
      setEntity(refreshedEntity)
      upsertEntityInList(refreshedEntity)
    } catch (refreshError) {
      setEmbeddingActionError(getLoadErrorMessage(refreshError))
    } finally {
      setIsRefreshingEmbedding(false)
    }
  }

  async function handleSaveContent() {
    if (!entity) {
      return
    }

    setIsSavingContent(true)
    setSaveError(null)

    try {
      const updatedEntity = await updateEntity(entity.id, { content: draftContent })
      window.localStorage.removeItem(getDraftStorageKey(entity.id))
      setEntity(updatedEntity)
      setDraftContent(updatedEntity.content ?? "")
      upsertEntityInList(updatedEntity)
    } catch (saveContentError) {
      setSaveError(getLoadErrorMessage(saveContentError))
    } finally {
      setIsSavingContent(false)
    }
  }

  async function handleCreateLink() {
    if (!entity || !selectedCandidate) {
      return
    }

    if (!relationType) {
      setLinkActionError("Relation type is required.")
      return
    }
    if (!linkExplanation.trim()) {
      setLinkActionError("Explanation is required.")
      return
    }

    setIsCreatingLink(true)
    setLinkActionError(null)

    try {
      await createLink({
        from_id: entity.id,
        to_id: selectedCandidate.id,
        relation_type: relationType,
        explanation: linkExplanation.trim(),
        status: "confirmed",
      })

      const refreshedConnections = await getEntityConnections(entity.id)
      setConnections(refreshedConnections)
      setLinkCandidates((currentCandidates) => currentCandidates.filter((candidate) => candidate.id !== selectedCandidate.id))
      setSelectedCandidate(null)
      setRelationType("")
      setLinkExplanation("")
    } catch (createError) {
      setLinkActionError(getLoadErrorMessage(createError))
    } finally {
      setIsCreatingLink(false)
    }
  }

  function closeLinkModal() {
    setSelectedCandidate(null)
    setRelationType("")
    setLinkExplanation("")
    setLinkActionError(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-zinc-100">Loading entity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">Fetching the entity detail from the API...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-zinc-100">Unable to load entity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-300">{error}</p>
          <Button asChild variant="outline">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!entity) {
    return null
  }

  return (
    <>
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link to="/knowledge/entities">Back to entities</Link>
        </Button>

        <EntityDetailCard
          entity={entity}
          isRefreshingEmbedding={isRefreshingEmbedding}
          embeddingActionError={embeddingActionError}
          onRefreshEmbedding={() => void handleRefreshEmbedding()}
        />

        <EntityPropertiesEditor entity={entity} onSaved={(updatedEntity) => { setEntity(updatedEntity); upsertEntityInList(updatedEntity) }} />

        <EntityDeleteControl entity={entity} onDeleted={async () => { await refreshEntities(); navigate("/knowledge/entities") }} />

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-zinc-100">{getEditorTitle(entity)}</CardTitle>
                <CardDescription>{getEditorDescription(entity)}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {hasUnsavedChanges ? <Badge variant="warning">Unsaved changes</Badge> : <Badge>Saved</Badge>}
                <Button type="button" onClick={() => void handleSaveContent()} disabled={isSavingContent || !hasUnsavedChanges}>
                  {isSavingContent ? "Saving..." : "Save content"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <EntityEditor
              contentType={entity.content_type as Entity["content_type"]}
              value={draftContent}
              onChange={setDraftContent}
              resetKey={`${entity.id}:${entity.content ?? ""}`}
            />
            <p className="text-sm text-zinc-500">Unsaved drafts for this entity are kept locally until you save or discard them by matching the stored content again.</p>
            {saveError ? <p className="text-sm text-red-300">{saveError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-100">Suggested connections</CardTitle>
            <CardDescription>
              Similar entities. These are embedding-based candidates. You decide whether a real connection exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isCandidatesLoading ? <p className="text-sm text-zinc-500">Finding embedding-based candidates...</p> : null}
            {!isCandidatesLoading && candidateError ? <p className="text-sm text-zinc-500">{candidateError}</p> : null}
            {!isCandidatesLoading && !candidateError && linkCandidates.length === 0 ? (
              <p className="text-sm text-zinc-500">No suggested connections are available right now.</p>
            ) : null}

            {!isCandidatesLoading && !candidateError
              ? linkCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="blue">{candidate.type ?? "unknown"}</Badge>
                          {candidate.tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                        <p className="text-sm font-medium text-zinc-100">{candidate.title ?? "Untitled entity"}</p>
                        <p className="text-sm text-zinc-300">{candidate.preview}</p>
                      </div>

                      <div className="flex min-w-[220px] flex-col gap-3">
                        <div className="space-y-1 font-mono text-xs text-zinc-500 lg:text-right">
                          <p>similarity {formatScore(candidate.similarity)}</p>
                          <p>distance {formatScore(candidate.distance)}</p>
                        </div>
                        <div className="flex gap-2 lg:justify-end">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/entities/${candidate.id}`}>Open</Link>
                          </Button>
                          <Button size="sm" onClick={() => setSelectedCandidate(candidate)}>
                            Create link
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-100">Existing connections</CardTitle>
            <CardDescription>Confirmed links live in the shared links table, and the explanation is the most important part.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isConnectionsLoading ? <p className="text-sm text-zinc-500">Loading existing connections...</p> : null}
            {!isConnectionsLoading && connectionsError ? <p className="text-sm text-zinc-500">{connectionsError}</p> : null}
            {!isConnectionsLoading && !connectionsError && connections.length === 0 ? (
              <p className="text-sm text-zinc-500">No confirmed connections yet.</p>
            ) : null}

            {!isConnectionsLoading && !connectionsError
              ? connections.map((connection) => (
                  <div key={connection.link_id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                    <p className="text-sm leading-7 text-zinc-300">{connection.explanation ?? "No explanation provided."}</p>
                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <Link to={`/entities/${connection.entity_id}`} className="text-sm font-medium text-zinc-100 hover:text-blue-400">
                          {connection.entity_title ?? "Untitled entity"}
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="blue">{connection.entity_type ?? "unknown"}</Badge>
                          {connection.entity_tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                        <p className="text-sm text-zinc-500">{connection.entity_preview}</p>
                      </div>

                      <div className="space-y-1 font-mono text-xs text-zinc-500 lg:text-right">
                        <p>{connection.relation_type ?? "unknown_relation"}</p>
                        <p>{connection.direction}</p>
                        <p>{connection.status ?? "unknown_status"}</p>
                        <p>{formatConnectionDate(connection.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))
              : null}
          </CardContent>
        </Card>
      </div>

      {selectedCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Create confirmed link</CardTitle>
              <CardDescription>
                You are confirming a real relationship between <span className="text-zinc-100">{entity.title ?? "this entity"}</span> and{" "}
                <span className="text-zinc-100">{selectedCandidate.title ?? "this candidate"}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Relation type</Label>
                <Select value={relationType} onValueChange={(value) => setRelationType(value as RelationType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select relation type" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="link-explanation">Explanation</Label>
                <Textarea
                  id="link-explanation"
                  value={linkExplanation}
                  onChange={(event) => setLinkExplanation(event.target.value)}
                  placeholder="Explain why this connection exists."
                />
              </div>

              {linkActionError ? <p className="text-sm text-red-300">{linkActionError}</p> : null}

              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeLinkModal}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleCreateLink()} disabled={isCreatingLink}>
                  {isCreatingLink ? "Saving..." : "Save confirmed link"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
}
