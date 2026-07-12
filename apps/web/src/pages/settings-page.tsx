import { useEffect, useState } from "react"
import { Database, LogOut, RefreshCw } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/features/auth/auth-context"
import { decayConfidenceJob } from "@/lib/api"
import { getSettingsStatus, updateAiSetting, type SettingsStatus } from "@/lib/system-api"

function StateBadge({ ready, children }: { ready: boolean; children: string }) {
  return <Badge variant={ready ? "blue" : "warning"}>{children}</Badge>
}

export function SettingsPage() {
  const { logout } = useAuth()
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [jobMessage, setJobMessage] = useState<string | null>(null)

  async function load() {
    try {
      const nextStatus = await getSettingsStatus()
      setStatus(nextStatus); setError(null)
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to load settings.") }
  }
  useEffect(() => { void load() }, [])

  async function toggleAi() {
    if (!status) return
    setSaving(true)
    try { setStatus(await updateAiSetting(!status.ai.enabled)) }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to update AI.") }
    finally { setSaving(false) }
  }

  function clearDrafts() {
    Object.keys(window.localStorage).filter((key) => key.startsWith("personal-dev-kg:entity-draft:")).forEach((key) => window.localStorage.removeItem(key))
    setJobMessage("Browser drafts cleared.")
  }

  return <div>
    <PageHeader title="Settings" description="Owner-only controls and safe configuration status. Secret values never leave the backend." actions={<Button variant="outline" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Log out</Button>} />
    {error ? <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{error}</p> : null}
    <div className="space-y-6">
      <Card><CardHeader><CardTitle>AI</CardTitle><CardDescription>Website availability is stored in app_settings. Provider credentials remain server-only.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 p-4"><div><p className="font-medium text-zinc-100">Enable AI</p><p className="text-sm text-zinc-500">{status?.ai.disabled_reason ?? "Provider calls are ready."}</p></div><button type="button" role="switch" aria-checked={Boolean(status?.ai.enabled)} disabled={!status || saving} onClick={() => void toggleAi()} className={`relative h-6 w-11 rounded-full border transition-colors ${status?.ai.enabled ? "border-blue-500 bg-blue-500" : "border-zinc-700 bg-zinc-800"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 transition-transform ${status?.ai.enabled ? "translate-x-5" : "translate-x-1"}`} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3"><p className="text-xs text-zinc-500">State</p><StateBadge ready={Boolean(status?.ai.provider_ready)}>{status?.ai.provider_ready ? "ready" : status?.ai.enabled ? "unavailable" : "disabled"}</StateBadge></div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3"><p className="text-xs text-zinc-500">OpenAI key</p><StateBadge ready={Boolean(status?.ai.openai_configured)}>{status?.ai.openai_configured ? "configured" : "missing"}</StateBadge></div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm"><p className="text-xs text-zinc-500">Provider</p>{status?.ai.provider ?? "openai"}</div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm"><p className="text-xs text-zinc-500">Fast model</p>{status?.ai.fast_model ?? "?"}</div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm"><p className="text-xs text-zinc-500">Smart model</p>{status?.ai.smart_model ?? "?"}</div>
          </div>
        </CardContent></Card>
      <Card><CardHeader><CardTitle>Integrations</CardTitle><CardDescription>Configuration status only; credentials are never displayed.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4"><p className="font-medium text-zinc-100">GitHub</p><div className="mt-3 flex gap-2"><StateBadge ready={Boolean(status?.github.enabled)}>{status?.github.enabled ? "enabled" : "disabled"}</StateBadge><StateBadge ready={Boolean(status?.github.webhook_secret_configured)}>{status?.github.webhook_secret_configured ? "webhook configured" : "webhook missing"}</StateBadge></div></div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4"><p className="font-medium text-zinc-100">Web search</p><div className="mt-3 flex gap-2"><StateBadge ready={Boolean(status?.web_search.enabled)}>{status?.web_search.enabled ? "enabled" : "disabled"}</StateBadge><StateBadge ready={Boolean(status?.web_search.api_key_configured)}>{status?.web_search.api_key_configured ? "configured" : "missing"}</StateBadge></div></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Data</CardTitle><CardDescription>Local drafts stay in this browser. Deleted entities are permanently removed.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={clearDrafts}><Database className="mr-2 h-4 w-4" />Clear browser drafts</Button><Button variant="outline" onClick={() => void decayConfidenceJob().then((result) => setJobMessage(`Updated ${result.updated_count} confidence scores.`)).catch((value) => setError(value instanceof Error ? value.message : "Job failed."))}><RefreshCw className="mr-2 h-4 w-4" />Run confidence decay</Button></div>
        {jobMessage ? <p className="text-sm text-blue-300">{jobMessage}</p> : null}
      </CardContent></Card>
    </div>
  </div>
}
