import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { DsaSyncPanel } from "@/features/dsa/dsa-sync-panel"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatEntityDate, getEntityDifficulty, getEntitySolutionCode } from "@/features/entities/metadata"
import { getEntities, runDuplicateDetector, type DuplicateDetectorMatch, type Entity } from "@/lib/api"

function getDifficultyVariant(difficulty: string | null) {
  if (difficulty === "easy") {
    return "success"
  }
  if (difficulty === "medium") {
    return "warning"
  }
  if (difficulty === "hard") {
    return "danger"
  }
  return "default"
}

function getMatchVariant(matchType: string) {
  if (matchType === "duplicate") {
    return "danger"
  }
  if (matchType === "same_pattern") {
    return "blue"
  }
  if (matchType === "related_but_different") {
    return "warning"
  }
  return "default"
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load DSA entities."
}

function formatConfidence(value: number) {
  return value.toFixed(2)
}

export function DsaPage() {
  const [problems, setProblems] = useState<Entity[]>([])
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateDetectorMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  async function loadProblems() {
    setIsLoading(true)
    setError(null)

    try {
      const results = await getEntities({ type: "dsa_problem", limit: 200 })
      setProblems(results)
      setSelectedProblemId((currentSelected) => currentSelected ?? results[0]?.id ?? null)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadProblems()
  }, [])

  const selectedProblem = useMemo(
    () => problems.find((problem) => problem.id === selectedProblemId) ?? problems[0] ?? null,
    [problems, selectedProblemId],
  )

  const visibleMatches = useMemo(
    () => duplicateMatches.filter((match) => match.match_type !== "no_match"),
    [duplicateMatches],
  )

  useEffect(() => {
    setDuplicateMatches([])
    setDuplicateError(null)
  }, [selectedProblemId])

  async function handleCheckDuplicates() {
    if (!selectedProblem) {
      return
    }

    setIsCheckingDuplicates(true)
    setDuplicateError(null)

    try {
      const result = await runDuplicateDetector(selectedProblem.id)
      setDuplicateMatches(result.matches)
    } catch (checkError) {
      setDuplicateMatches([])
      setDuplicateError(getErrorMessage(checkError))
    } finally {
      setIsCheckingDuplicates(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <DsaSyncPanel onSynced={() => void loadProblems()} />
      <Card>
        <CardHeader>
          <CardTitle>DSA Tracker</CardTitle>
          <CardDescription>Problems are just `dsa_problem` entities with difficulty and solution details stored in metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-zinc-500">Loading problems...</p> : null}
          {!isLoading && error ? (
            <div className="space-y-3 rounded-lg border border-red-500/25 bg-red-500/5 px-4 py-4 text-sm text-red-300">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadProblems()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!isLoading && !error && problems.length === 0 ? <p className="text-sm text-zinc-500">No DSA problems captured yet.</p> : null}
          {!isLoading && !error
            ? problems.map((problem) => {
                const difficulty = getEntityDifficulty(problem)
                return (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => setSelectedProblemId(problem.id)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      selectedProblem?.id === problem.id
                        ? "border-blue-500/50 bg-zinc-950"
                        : "border-zinc-800 bg-zinc-950 hover:border-blue-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-100">{problem.title ?? "Untitled problem"}</p>
                      <Badge variant={getDifficultyVariant(difficulty)}>{difficulty ?? "unset"}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {problem.tags.map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  </button>
                )
              })
            : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{selectedProblem?.title ?? "Select a problem"}</CardTitle>
              <CardDescription>
                {selectedProblem ? `Captured ${formatEntityDate(selectedProblem.created_at)}` : "Choose a DSA problem to inspect its code and notes."}
              </CardDescription>
            </div>
            {selectedProblem ? (
              <Button type="button" onClick={() => void handleCheckDuplicates()} disabled={isCheckingDuplicates}>
                {isCheckingDuplicates ? "Checking..." : "Check for similar solved problems"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedProblem ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={getDifficultyVariant(getEntityDifficulty(selectedProblem))}>{getEntityDifficulty(selectedProblem) ?? "unset"}</Badge>
                {selectedProblem.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Content / Code Area</h2>
                <pre className="min-h-[220px] overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
                  {getEntitySolutionCode(selectedProblem) ?? "No solution code captured yet."}
                </pre>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Notes</h2>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                    {selectedProblem.content?.trim() || "No notes captured yet."}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Pattern detector</h2>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-sm text-zinc-500">These are suggestion-only results. Nothing is merged or changed automatically.</p>
                </div>
                {duplicateError ? <p className="text-sm text-amber-300">{duplicateError}</p> : null}
                {!duplicateError && duplicateMatches.length === 0 ? (
                  <p className="text-sm text-zinc-500">Run the detector to compare this problem against similar solved DSA problems.</p>
                ) : null}
                {!duplicateError && duplicateMatches.length > 0 && visibleMatches.length === 0 ? (
                  <p className="text-sm text-zinc-500">No strong duplicate or same-pattern suggestions were found.</p>
                ) : null}
                {visibleMatches.map((match) => (
                  <div key={match.entity_id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={getMatchVariant(match.match_type)}>{match.match_type}</Badge>
                          {match.tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                        <Link to={`/entities/${match.entity_id}`} className="text-sm font-medium text-zinc-100 hover:text-blue-400">
                          {match.title ?? "Untitled problem"}
                        </Link>
                        <p className="text-sm text-zinc-300">{match.explanation}</p>
                      </div>

                      <div className="space-y-1 font-mono text-xs text-zinc-500 lg:text-right">
                        <p>{match.type ?? "unknown"}</p>
                        <p>confidence {formatConfidence(match.confidence)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button asChild variant="outline">
                <Link to={`/entities/${selectedProblem.id}`}>Open Full Entity</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Select a DSA problem from the list to review it.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
