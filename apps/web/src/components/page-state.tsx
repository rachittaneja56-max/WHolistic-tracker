import type { ReactNode } from "react"
import { AlertTriangle, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-md border border-border bg-surface" />)}</div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface p-8 text-center"><Inbox className="mx-auto h-6 w-6 text-muted-foreground" /><h3 className="mt-3 font-medium text-foreground">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /><p className="text-sm">{message}</p></div>{onRetry ? <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Retry</Button> : null}</div>
}

export function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-border py-2"><span className="text-sm text-muted-foreground">{label}</span><span className="font-mono text-sm text-foreground">{value}</span></div>
}

export function PageState({ loading, error, empty, children }: { loading?: boolean; error?: string | null; empty?: { title: string; description: string }; children: ReactNode }) {
  if (loading) return <LoadingSkeleton />
  if (error) return <ErrorState message={error} />
  if (empty) return <EmptyState title={empty.title} description={empty.description} />
  return <>{children}</>
}
