import { useEffect, useState } from "react"
import { Check, Copy, Plug, RefreshCw, Unplug, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import {
  createDsaPairingCode,
  getDsaExtensionStatus,
  getDsaIntegrationStatus,
  revokeDsaExtension,
  saveDsaConnections,
  syncDsaIntegrations,
  type DsaConnection,
  type DsaExtensionStatus,
  type DsaIntegrationStatus,
  type DsaPairingCode,
} from "@/lib/api"

const platforms = ["leetcode", "codeforces", "codechef"] as const

export function DsaIntegrationDrawer({ open, onClose, onSynced }: { open: boolean; onClose: () => void; onSynced: () => void }) {
  const { show } = useToast()
  const [status, setStatus] = useState<DsaIntegrationStatus | null>(null)
  const [extension, setExtension] = useState<DsaExtensionStatus | null>(null)
  const [connections, setConnections] = useState<DsaConnection[]>([])
  const [pairing, setPairing] = useState<DsaPairingCode | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const [nextStatus, nextExtension] = await Promise.all([getDsaIntegrationStatus(), getDsaExtensionStatus()])
    setStatus(nextStatus)
    setExtension(nextExtension)
    setConnections(nextStatus.connections.map(({ platform, username, profile_url, enabled }) => ({ platform, username, profile_url, enabled })))
  }

  useEffect(() => {
    if (open) void load().catch(() => show({ message: "Unable to load DSA connections." }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function update(platform: DsaConnection["platform"], field: "username" | "profile_url", value: string) {
    setConnections((current) => {
      const existing = current.find((item) => item.platform === platform) ?? { platform, username: "", profile_url: "", enabled: true }
      return [...current.filter((item) => item.platform !== platform), { ...existing, [field]: value }]
    })
  }

  async function save() {
    setBusy("save")
    try {
      await saveDsaConnections({ connections: connections.filter((item) => item.username.trim()) })
      await load()
      show({ message: "Platform connections saved." })
    } catch {
      show({ message: "Unable to save platform connections." })
    } finally {
      setBusy(null)
    }
  }

  async function sync() {
    setBusy("sync")
    try {
      const result = await syncDsaIntegrations()
      show({ message: `Sync complete: ${result.total_imported} imported, ${result.total_updated} updated.` })
      onSynced()
      await load()
    } catch {
      show({ message: "Platform sync failed. Try again later." })
    } finally {
      setBusy(null)
    }
  }

  async function generateCode() {
    setBusy("pair")
    try {
      setPairing(await createDsaPairingCode())
    } catch {
      show({ message: "Unable to generate a pairing code." })
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy("disconnect")
    try {
      await revokeDsaExtension()
      setPairing(null)
      await load()
      show({ message: "Extension access revoked." })
    } finally {
      setBusy(null)
    }
  }

  return <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="ml-auto flex h-full w-full max-w-[560px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
      <header className="flex items-start justify-between border-b border-zinc-800 px-5 py-5">
        <div><h2 className="text-lg font-semibold text-zinc-100">DSA connections</h2><p className="mt-1 text-sm text-zinc-500">Public profiles power stats. The extension imports private code and notes.</p></div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close connections"><X className="h-4 w-4" /></Button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <section className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><Plug className="h-4 w-4 text-blue-400" /><h3 className="font-medium text-zinc-100">LeetCode extension</h3></div><p className="mt-2 text-xs leading-5 text-zinc-500">No cookies are copied. Authenticated requests stay inside your LeetCode tab.</p></div>
            <Badge variant={extension?.paired ? "success" : "default"}>{extension?.paired ? "paired" : "not paired"}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500"><span>{extension?.imported_problem_count ?? 0} imported</span><span>{extension?.last_used_at ? `Used ${new Date(extension.last_used_at).toLocaleDateString()}` : "Never used"}</span></div>
          {pairing ? <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Enter this one-time code in the extension before {new Date(pairing.expires_at).toLocaleTimeString()}.</p>
            <div className="mt-2 flex items-center justify-between"><code className="text-xl font-semibold tracking-[0.22em] text-zinc-100">{pairing.code}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(pairing.code)}><Copy className="mr-2 h-3.5 w-3.5" />Copy</Button></div>
          </div> : null}
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => void generateCode()} disabled={busy !== null}>{busy === "pair" ? "Generating…" : extension?.paired ? "Pair another browser" : "Generate pairing code"}</Button>
            {extension?.paired ? <Button size="sm" variant="outline" onClick={() => void disconnect()} disabled={busy !== null}><Unplug className="mr-2 h-3.5 w-3.5" />Disconnect</Button> : null}
          </div>
        </section>

        {platforms.map((platform) => {
          const item = connections.find((connection) => connection.platform === platform)
          const saved = status?.connections.find((connection) => connection.platform === platform)
          return <section key={platform} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between"><h3 className="font-medium capitalize text-zinc-100">{platform}</h3><Badge variant={saved ? "success" : "default"}>{saved ? "connected" : "not connected"}</Badge></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><Input aria-label={`${platform} username`} placeholder="Username" value={item?.username ?? ""} onChange={(event) => update(platform, "username", event.target.value)} /><Input aria-label={`${platform} profile URL`} placeholder="Profile URL (optional)" value={item?.profile_url ?? ""} onChange={(event) => update(platform, "profile_url", event.target.value)} /></div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500"><span>{saved?.last_synced_at ? `Last sync ${new Date(saved.last_synced_at).toLocaleString()}` : "Not synced yet"}</span>{saved?.last_error ? <span className="text-amber-400">Last sync failed</span> : <Check className="h-3.5 w-3.5 text-emerald-500" />}</div>
          </section>
        })}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-zinc-800 p-5"><Button variant="outline" onClick={() => void save()} disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save profiles"}</Button><Button onClick={() => void sync()} disabled={busy !== null || !connections.some((item) => item.username.trim())}><RefreshCw className="mr-2 h-4 w-4" />{busy === "sync" ? "Syncing…" : "Sync stats"}</Button></footer>
    </aside>
  </div>
}
