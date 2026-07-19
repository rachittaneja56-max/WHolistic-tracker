import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EntityDetailCard } from "@/features/entities/components/entity-detail-card"
import { EntityDeleteControl } from "@/features/entities/components/entity-delete-control"
import { EntityEditor } from "@/features/entities/components/entity-editor"
import { EntityPropertiesEditor } from "@/features/entities/components/entity-properties-editor"
import type { EntitiesLayoutContext } from "@/features/entities/layout-context"
import { useModalFocus } from "@/hooks/use-modal-focus"
import {
  createLink,
  deleteLink,
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

const relationLabels: Record<RelationType, string> = {
  structural_analogy: "is structurally analogous to",
  prerequisite: "is a prerequisite for",
  used_in: "is used in",
  reminds_me_of: "reminds me of",
  depends_on: "depends on",
  blocks: "blocks",
  implements: "implements",
  evidence_for: "is evidence for",
}

function entityToLinkTarget(entity: Entity): LinkCandidate {
  const content = (entity.content ?? "").trim().split(/\s+/).join(" ")
  return {
    id: entity.id,
    title: entity.title,
    type: entity.type,
    tags: entity.tags,
    preview: content ? content.slice(0, 180) : "No content preview.",
    distance: 1,
    similarity: 0,
  }
}

function connectionStatement(currentTitle: string | null, connection: EntityConnection) {
  const current = currentTitle ?? "This entity"
  const counterpart = connection.entity_title ?? "Untitled entity"
  const relation = connection.relation_type ? relationLabels[connection.relation_type] : "is connected to"
  return connection.direction === "outgoing"
    ? `${current} ${relation} ${counterpart}`
    : `${counterpart} ${relation} ${current}`
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
  const { entities, isEntitiesLoading, upsertEntityInList, refreshEntities } = useOutletContext<EntitiesLayoutContext>()
  const [entity, setEntity] = useState<Entity | null>(null)
  const [draftContent, setDraftContent] = useState("")
  const [linkCandidates, setLinkCandidates] = useState<LinkCandidate[]>([])
  const [connections, setConnections] = useState<EntityConnection[]>([])
  const [selectedTarget, setSelectedTarget] = useState<LinkCandidate | null>(null)
  const [relationType, setRelationType] = useState<RelationType | "">("")
  const [linkExplanation, setLinkExplanation] = useState("")
  const [targetQuery, setTargetQuery] = useState("")
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null)
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
  const { dialogRef, onDialogKeyDown } = useModalFocus(Boolean(selectedTarget), closeLinkModal)

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

  const manualTargets = useMemo(() => {
    const query = targetQuery.trim().toLowerCase()
    if (!entity || !query) {
      return []
    }

    const connectedIds = new Set(connections.map((connection) => connection.entity_id))
    return entities
      .filter((candidate) => candidate.id !== entity.id && !connectedIds.has(candidate.id))
      .filter((candidate) => {
        const searchable = [candidate.title, candidate.type, ...(candidate.tags ?? [])].filter(Boolean).join(" ").toLowerCase()
        return searchable.includes(query)
      })
      .slice(0, 8)
  }, [connections, entities, entity, targetQuery])

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
    if (!entity || !selectedTarget) {
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
        to_id: selectedTarget.id,
        relation_type: relationType,
        explanation: linkExplanation.trim(),
        status: "confirmed",
      })

      const refreshedConnections = await getEntityConnections(entity.id)
      setConnections(refreshedConnections)
      setLinkCandidates((currentCandidates) => currentCandidates.filter((candidate) => candidate.id !== selectedTarget.id))
      setSelectedTarget(null)
      setRelationType("")
      setLinkExplanation("")
      setTargetQuery("")
    } catch (createError) {
      setLinkActionError(getLoadErrorMessage(createError))
    } finally {
      setIsCreatingLink(false)
    }
  }

  async function handleDeleteLink(connection: EntityConnection) {
    const counterpart = connection.entity_title ?? "this entity"
    if (!window.confirm(`Remove the connection to "${counterpart}"? This cannot be undone.`)) {
      return
    }

    setDeletingLinkId(connection.link_id)
    setConnectionsError(null)
    try {
      await deleteLink(connection.link_id)
      setConnections((current) => current.filter((item) => item.link_id !== connection.link_id))
      if (entity?.has_embedding) {
        setLinkCandidates(await getLinkCandidates(entity.id))
      }
    } catch (deleteError) {
      setConnectionsError(getLoadErrorMessage(deleteError))
    } finally {
      setDeletingLinkId(null)
    }
  }

  function closeLinkModal() {
    setSelectedTarget(null)
    setRelationType("")
    setLinkExplanation("")
    setLinkActionError(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Loading entity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Fetching the entity detail from the API...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Unable to load entity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-danger">{error}</p>
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

        <Button asChild variant="outline">
          <Link to={`/agents/assistant?from=/knowledge/entities/${entity.id}&prompt=${encodeURIComponent("Quiz me on this topic")}`}>Quiz with coach</Link>
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
                <CardTitle className="text-foreground">{getEditorTitle(entity)}</CardTitle>
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
            <p className="text-sm text-muted-foreground">Unsaved drafts for this entity are kept locally until you save or discard them by matching the stored content again.</p>
            {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Create a connection</CardTitle>
            <CardDescription>Search all saved entities by title, type, or tag. Semantic suggestions remain available below when embeddings exist.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="connection-target">Connect this entity to</Label>
            <Input
              id="connection-target"
              value={targetQuery}
              onChange={(event) => setTargetQuery(event.target.value)}
              placeholder="Search entities, types, or tags"
            />
            {isEntitiesLoading ? <p className="text-sm text-muted-foreground">Loading entities...</p> : null}
            {!isEntitiesLoading && targetQuery.trim() && manualTargets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unconnected entities match this search.</p>
            ) : null}
            {!targetQuery.trim() ? <p className="text-sm text-muted-foreground">Start typing to choose any entity; an embedding is not required.</p> : null}
            {manualTargets.map((target) => (
              <div key={target.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{target.title ?? "Untitled entity"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{target.type ?? "unknown"}{target.tags.length ? ` · ${target.tags.join(", ")}` : ""}</p>
                </div>
                <Button type="button" size="sm" onClick={() => setSelectedTarget(entityToLinkTarget(target))}>
                  Connect
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Suggested connections</CardTitle>
            <CardDescription>
              Similar entities. These are embedding-based candidates. You decide whether a real connection exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isCandidatesLoading ? <p className="text-sm text-muted-foreground">Finding embedding-based candidates...</p> : null}
            {!isCandidatesLoading && candidateError ? <p className="text-sm text-muted-foreground">{candidateError}</p> : null}
            {!isCandidatesLoading && !candidateError && linkCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggested connections are available right now.</p>
            ) : null}

            {!isCandidatesLoading && !candidateError
              ? linkCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border border-border bg-surface px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="blue">{candidate.type ?? "unknown"}</Badge>
                          {candidate.tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                        <p className="text-sm font-medium text-foreground">{candidate.title ?? "Untitled entity"}</p>
                        <p className="text-sm text-secondary">{candidate.preview}</p>
                      </div>

                      <div className="flex min-w-[220px] flex-col gap-3">
                        <div className="space-y-1 font-mono text-xs text-muted-foreground lg:text-right">
                          <p>similarity {formatScore(candidate.similarity)}</p>
                          <p>distance {formatScore(candidate.distance)}</p>
                        </div>
                        <div className="flex gap-2 lg:justify-end">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/knowledge/entities/${candidate.id}`}>Open</Link>
                          </Button>
                          <Button size="sm" onClick={() => setSelectedTarget(candidate)}>
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
            <CardTitle className="text-foreground">Existing connections</CardTitle>
            <CardDescription>Confirmed links live in the shared links table, and the explanation is the most important part.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isConnectionsLoading ? <p className="text-sm text-muted-foreground">Loading existing connections...</p> : null}
            {!isConnectionsLoading && connectionsError ? <p className="text-sm text-muted-foreground">{connectionsError}</p> : null}
            {!isConnectionsLoading && !connectionsError && connections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed connections yet.</p>
            ) : null}

            {!isConnectionsLoading && !connectionsError
              ? connections.map((connection) => (
                  <div key={connection.link_id} className="rounded-lg border border-border bg-surface px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-sm font-medium text-foreground">{connectionStatement(entity.title, connection)}</p>
                      <Button type="button" size="sm" variant="destructive" onClick={() => void handleDeleteLink(connection)} disabled={deletingLinkId === connection.link_id}>
                        {deletingLinkId === connection.link_id ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-secondary">{connection.explanation ?? "No explanation provided."}</p>
                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <Link to={`/knowledge/entities/${connection.entity_id}`} className="text-sm font-medium text-foreground hover:text-primary">
                          {connection.entity_title ?? "Untitled entity"}
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="blue">{connection.entity_type ?? "unknown"}</Badge>
                          {connection.entity_tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground">{connection.entity_preview}</p>
                      </div>

                      <div className="space-y-1 font-mono text-xs text-muted-foreground lg:text-right">
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

      {selectedTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isCreatingLink) closeLinkModal() }}>
          <Card ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-link-title" tabIndex={-1} onKeyDown={onDialogKeyDown} className="w-full max-w-2xl outline-none">
            <CardHeader>
              <CardTitle id="create-link-title">Create confirmed link</CardTitle>
              <CardDescription>
                You are confirming a real relationship between <span className="text-foreground">{entity.title ?? "this entity"}</span> and{" "}
                <span className="text-foreground">{selectedTarget.title ?? "this candidate"}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link-relation-type">Relation type</Label>
                <Select value={relationType} onValueChange={(value) => setRelationType(value as RelationType)}>
                  <SelectTrigger id="link-relation-type">
                    <SelectValue placeholder="Select relation type" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationTypeOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {relationLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {relationType ? (
                  <p className="text-sm text-secondary">
                    {entity.title ?? "This entity"} {relationLabels[relationType]} {selectedTarget.title ?? "the selected entity"}.
                  </p>
                ) : null}
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

              {linkActionError ? <p className="text-sm text-danger">{linkActionError}</p> : null}

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
