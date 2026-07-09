import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getEntities, type Entity } from "@/lib/api"
import { compareUpcomingExamDates, formatExamDate, getEntityExamDate } from "@/features/entities/metadata"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load subject topics."
}

export function SubjectsPage() {
  const [subjects, setSubjects] = useState<Entity[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadSubjects() {
    setIsLoading(true)
    setError(null)

    try {
      const results = await getEntities({ type: "subject_topic", limit: 200 })
      const sorted = [...results].sort(compareUpcomingExamDates)
      setSubjects(sorted)
      setSelectedSubjectId((currentSelected) => currentSelected ?? sorted[0]?.id ?? null)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSubjects()
  }, [])

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? subjects[0] ?? null,
    [selectedSubjectId, subjects],
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Subject Tracker</CardTitle>
          <CardDescription>Subjects stay in the same entities table and use metadata.exam_date for scheduling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-zinc-500">Loading subjects...</p> : null}
          {!isLoading && error ? (
            <div className="space-y-3 rounded-lg border border-red-500/25 bg-red-500/5 px-4 py-4 text-sm text-red-300">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadSubjects()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!isLoading && !error && subjects.length === 0 ? <p className="text-sm text-zinc-500">No subject topics captured yet.</p> : null}
          {!isLoading && !error
            ? subjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => setSelectedSubjectId(subject.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    selectedSubject?.id === subject.id
                      ? "border-blue-500/50 bg-zinc-950"
                      : "border-zinc-800 bg-zinc-950 hover:border-blue-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{subject.title ?? "Untitled subject"}</p>
                    <Badge variant="warning">{formatExamDate(getEntityExamDate(subject))}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">{subject.content?.slice(0, 96) || "No notes captured yet."}</p>
                </button>
              ))
            : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedSubject?.title ?? "Select a subject"}</CardTitle>
          <CardDescription>
            {selectedSubject ? `Exam date ${formatExamDate(getEntityExamDate(selectedSubject))}` : "Choose a subject to inspect its notes and exam timing."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedSubject ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="warning">{formatExamDate(getEntityExamDate(selectedSubject))}</Badge>
                {selectedSubject.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                  {selectedSubject.content?.trim() || "No notes captured yet."}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to={`/entities/${selectedSubject.id}`}>Open Full Entity</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Select a subject topic from the list to review it.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
