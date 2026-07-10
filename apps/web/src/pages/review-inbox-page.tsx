import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { confirmLink, getReviewInbox, rejectLink, runDeepConnections, type ReviewInboxLink } from "@/lib/api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load review inbox."
}

function formatConfidence(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2)
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

export function ReviewInboxPage() {
  const [items, setItems] = useState<ReviewInboxLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunningAgent, setIsRunningAgent] = useState(false)
  const [actionLinkId, setActionLinkId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [runMessage, setRunMessage] = useState<string | null>(null)

  async function loadInbox() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getReviewInbox()
      setItems(result)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadInbox()
  }, [])

  async function handleRunAgent() {
    setIsRunningAgent(true)
    setActionError(null)
    setRunMessage(null)

    try {
      const result = await runDeepConnections()
      setRunMessage(`Checked ${result.candidate_pairs_considered} candidate pairs and created ${result.suggestions_created} review items.`)
      await loadInbox()
    } catch (runError) {
      setActionError(getErrorMessage(runError))
    } finally {
      setIsRunningAgent(false)
    }
  }

  async function handleConfirm(linkId: string) {
    setActionLinkId(linkId)
    setActionError(null)

    try {
      await confirmLink(linkId)
      setItems((currentItems) => currentItems.filter((item) => item.id !== linkId))
    } catch (confirmError) {
      setActionError(getErrorMessage(confirmError))
    } finally {
      setActionLinkId(null)
    }
  }

  async function handleReject(linkId: string) {
    setActionLinkId(linkId)
    setActionError(null)

    try {
      await rejectLink(linkId)
      setItems((currentItems) => currentItems.filter((item) => item.id !== linkId))
    } catch (rejectError) {
      setActionError(getErrorMessage(rejectError))
    } finally {
      setActionLinkId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Review Inbox</CardTitle>
            <CardDescription>Agent-suggested links wait here until you confirm or reject them. Nothing is auto-confirmed.</CardDescription>
          </div>
          <Button type="button" onClick={() => void handleRunAgent()} disabled={isRunningAgent}>
            {isRunningAgent ? "Running..." : "Run deep connection agent once"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-zinc-500">Loading suggested links...</p> : null}
        {!isLoading && error ? <p className="text-sm text-amber-300">{error}</p> : null}
        {actionError ? <p className="text-sm text-amber-300">{actionError}</p> : null}
        {runMessage ? <p className="text-sm text-zinc-500">{runMessage}</p> : null}
        {!isLoading && !error && items.length === 0 ? <p className="text-sm text-zinc-500">No agent-suggested links are waiting for review.</p> : null}

        {!isLoading && !error
          ? items.map((item) => (
              <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="blue">{item.relation_type ?? "unknown_relation"}</Badge>
                      <Badge>{item.from_type ?? "unknown"}</Badge>
                      <Badge>{item.to_type ?? "unknown"}</Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-zinc-500">From</p>
                      <Link to={`/entities/${item.from_id}`} className="text-sm font-medium text-zinc-100 hover:text-blue-400">
                        {item.from_title ?? "Untitled entity"}
                      </Link>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-zinc-500">To</p>
                      <Link to={`/entities/${item.to_id}`} className="text-sm font-medium text-zinc-100 hover:text-blue-400">
                        {item.to_title ?? "Untitled entity"}
                      </Link>
                    </div>
                    <p className="text-sm leading-7 text-zinc-300">{item.explanation ?? "No explanation provided."}</p>
                  </div>

                  <div className="flex min-w-[240px] flex-col gap-3">
                    <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-500">
                      <p>confidence {formatConfidence(item.confidence)}</p>
                      <p>{item.status ?? "unknown_status"}</p>
                      <p>{formatDate(item.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/entities/${item.from_id}`}>Open source</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/entities/${item.to_id}`}>Open target</Link>
                      </Button>
                      <Button size="sm" onClick={() => void handleReject(item.id)} disabled={actionLinkId === item.id} variant="outline">
                        {actionLinkId === item.id ? "Working..." : "Reject"}
                      </Button>
                      <Button size="sm" onClick={() => void handleConfirm(item.id)} disabled={actionLinkId === item.id}>
                        {actionLinkId === item.id ? "Working..." : "Confirm"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          : null}
      </CardContent>
    </Card>
  )
}
