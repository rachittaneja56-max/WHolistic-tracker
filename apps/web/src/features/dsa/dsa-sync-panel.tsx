import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getDsaIntegrationStatus, saveDsaConnections, syncDsaIntegrations, type DsaConnection, type DsaIntegrationStatus, type DsaSyncResponse } from "@/lib/api"

const platforms = ["codeforces", "codechef"] as const

export function DsaSyncPanel({ onSynced }: { onSynced: () => void }) {
  const [connections, setConnections] = useState<DsaConnection[]>([])
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<DsaSyncResponse | null>(null)

  useEffect(() => {
    void getDsaIntegrationStatus().then((status: DsaIntegrationStatus) => setConnections(status.connections.map(({ platform, username, profile_url, enabled }) => ({ platform, username, profile_url, enabled })))).catch(() => undefined)
  }, [])

  function update(platform: DsaConnection["platform"], field: "username" | "profile_url", value: string) {
    setConnections((current) => {
      const existing = current.find((item) => item.platform === platform) ?? { platform, username: "", profile_url: "", enabled: true }
      const next = { ...existing, [field]: value }
      return [...current.filter((item) => item.platform !== platform), next]
    })
  }

  async function save() {
    setSaving(true); setMessage(null)
    try { await saveDsaConnections({ connections: connections.filter((item) => item.username.trim()) }); setMessage("Platform connections saved.") } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save connections.") } finally { setSaving(false) }
  }

  async function sync() {
    setSyncing(true); setMessage(null)
    try { const result = await syncDsaIntegrations(); setSyncResult(result); onSynced() } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sync platforms.") } finally { setSyncing(false) }
  }

  return <Card className="xl:col-span-2">
    <CardHeader><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><CardTitle>Platform sync</CardTitle><CardDescription>Import solved activity into your editable DSA entities. Source code is best-effort and provider-dependent.</CardDescription></div><Button type="button" onClick={() => void sync()} disabled={syncing || !connections.some((item) => item.username.trim())}>{syncing ? "Syncing..." : "Sync platforms"}</Button></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">{platforms.map((platform) => { const item = connections.find((connection) => connection.platform === platform); return <div key={platform} className="space-y-2 rounded-lg border border-border bg-background p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium capitalize text-foreground">{platform}</p><Badge>{item?.username ? "connected" : "not set"}</Badge></div><Input aria-label={`${platform} username`} placeholder="Username" value={item?.username ?? ""} onChange={(event) => update(platform, "username", event.target.value)} /><Input aria-label={`${platform} profile URL`} placeholder="Profile URL (optional)" value={item?.profile_url ?? ""} onChange={(event) => update(platform, "profile_url", event.target.value)} /></div> })}</div>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save connections"}</Button>{message ? <p className="text-sm text-warning">{message}</p> : null}</div>
      {syncResult ? <div className="grid gap-2 md:grid-cols-3">{syncResult.results.map((result) => <div key={result.platform} className="rounded-lg border border-border bg-background p-3 text-sm"><div className="flex justify-between"><span className="capitalize text-foreground">{result.platform}</span><Badge variant={result.status === "failed" ? "danger" : result.status === "synced" ? "success" : "default"}>{result.status === "failed" ? "Something went wrong" : result.status}</Badge></div><p className="mt-2 text-muted-foreground">{result.imported_count} imported · {result.updated_count} updated</p>{result.status === "failed" ? <p className="mt-1 text-warning">Please try again later.</p> : result.message ? <p className="mt-1 text-warning">{result.message}</p> : null}</div>)}</div> : null}
    </CardContent>
  </Card>
}
