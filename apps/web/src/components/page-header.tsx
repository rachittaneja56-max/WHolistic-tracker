import type { ReactNode } from "react"

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-2xl font-semibold text-zinc-100">{title}</h2>{description ? <p className="mt-1 max-w-3xl text-sm text-zinc-500">{description}</p> : null}</div>{actions}</div>
}
