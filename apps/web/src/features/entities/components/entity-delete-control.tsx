import { useState } from "react"
import { MoreHorizontal, Trash2 } from "lucide-react"

import { useToast } from "@/components/toast-provider"
import { Button } from "@/components/ui/button"
import type { Entity } from "@/lib/api"
import { deleteEntity, getDeletionImpact, type DeletionImpact } from "@/lib/system-api"

export function EntityDeleteControl({ entity, onDeleted }: { entity: Entity; onDeleted: () => Promise<void> | void }) {
  const { show } = useToast()
  const [open, setOpen] = useState(false)
  const [impact, setImpact] = useState<DeletionImpact | null>(null)
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function prepare() {
    setOpen(true); setBusy(true); setError(null)
    try { setImpact(await getDeletionImpact(entity.id)) }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to inspect deletion impact.") }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true)
    try {
      await deleteEntity(entity.id, confirmation)
      show({ message: `Permanently deleted ${entity.title ?? "entity"}.` })
      setOpen(false)
      await onDeleted()
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to permanently delete entity.") }
    finally { setBusy(false) }
  }
  const requiresTitle = Boolean(impact && (impact.child_count || impact.link_count))
  const allowed = !requiresTitle || confirmation === (entity.title ?? "")

  return <div className="flex justify-end">
    <details className="relative"><summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 hover:bg-zinc-800"><MoreHorizontal className="mr-2 h-4 w-4" />Actions</summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-zinc-800 bg-zinc-900 p-1"><button type="button" onClick={() => void prepare()} className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"><Trash2 className="mr-2 h-4 w-4" />Delete entity...</button></div></details>
    {open ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <h2 id="delete-title" className="text-lg font-semibold text-zinc-100">Permanently delete ?{entity.title ?? "Untitled entity"}??</h2>
      <p className="mt-2 text-sm text-zinc-300">This permanently deletes this entity, its child entities, links, history, reviews, and comprehension checks. This cannot be undone.</p>
      {busy && !impact ? <p className="mt-4 font-mono text-xs text-zinc-500">Loading impact...</p> : null}
      {impact ? <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs text-zinc-500"><span>{impact.child_count} children</span><span>{impact.link_count} links</span><span>{impact.review_count} reviews</span><span>{impact.comprehension_check_count} checks</span></div> : null}
      {requiresTitle ? <label className="mt-4 block text-sm text-zinc-300">Type <span className="font-mono text-zinc-100">{entity.title}</span><input className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-zinc-100" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="bg-red-700 hover:bg-red-600" disabled={busy || !impact || !allowed} onClick={() => void remove()}>Permanently delete</Button></div>
    </div></div> : null}
  </div>
}
