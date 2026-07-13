import { useEffect, useState, type ReactNode } from "react"
import { Bot, Check, CheckCircle2, Copy, Database, Github, KeyRound, LogOut, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import { decayConfidenceJob } from "@/lib/api"
import {
  deleteAiCredential, deleteGithubCredential, getSettingsStatus, saveAiCredential, saveGithubCredential,
  updateAiSetting, updateGithubSetting, type AiModelMode, type AiProviderName, type SettingsStatus,
} from "@/lib/system-api"

const providers: AiProviderName[] = ["openai", "gemini", "mistral"]
const providerLabel = { openai: "OpenAI", gemini: "Gemini", mistral: "Mistral" }
const modes: { value: AiModelMode; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "Uses Fast or Smart based on the task." },
  { value: "fast", label: "Fast", description: "Uses the Fast model for every request." },
  { value: "smart", label: "Smart", description: "Uses the Smart model for every request." },
]

function StateBadge({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <Badge variant={ready ? "blue" : "warning"}>{children}</Badge>
}

function Toggle({ checked, disabled, label, onClick }: { checked: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} role="switch" aria-checked={checked} disabled={disabled} onClick={onClick} className={`relative h-7 w-12 rounded-full border transition ${checked ? "border-blue-500 bg-blue-500" : "border-zinc-700 bg-zinc-800"} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button>
}

export function SettingsPage() {
  const { logout } = useAuth()
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [activeProvider, setActiveProvider] = useState<AiProviderName>("openai")
  const [models, setModels] = useState<Record<AiProviderName, { fast_model: string; smart_model: string }> | null>(null)
  const [aiKey, setAiKey] = useState("")
  const [githubToken, setGithubToken] = useState("")
  const [githubSecret, setGithubSecret] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function applyStatus(next: SettingsStatus) {
    setStatus(next)
    setActiveProvider(next.ai.provider)
    setModels(Object.fromEntries(providers.map((provider) => [provider, { fast_model: next.ai.providers[provider].fast_model, smart_model: next.ai.providers[provider].smart_model }])) as Record<AiProviderName, { fast_model: string; smart_model: string }>)
  }

  async function load() {
    try { applyStatus(await getSettingsStatus()); setError(null) }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to load settings.") }
  }
  useEffect(() => { void load() }, [])

  async function act(name: string, operation: () => Promise<SettingsStatus>, success?: string) {
    setBusy(name); setError(null); setMessage(null)
    try { applyStatus(await operation()); if (success) setMessage(success) }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to update settings.") }
    finally { setBusy(null) }
  }

  async function copyWebhook() {
    if (!status?.github.webhook_url) return
    try { await navigator.clipboard.writeText(status.github.webhook_url); setMessage("Webhook URL copied.") }
    catch { setError("Unable to copy the webhook URL.") }
  }

  function clearDrafts() {
    Object.keys(localStorage).filter((key) => key.startsWith("personal-dev-kg:entity-draft:")).forEach((key) => localStorage.removeItem(key))
    setMessage("Browser drafts cleared.")
  }

  const provider = status?.ai.providers[activeProvider]
  const modelDraft = models?.[activeProvider]
  const modelInUse = status?.ai.model_mode === "fast" ? provider?.fast_model : status?.ai.model_mode === "smart" ? provider?.smart_model : "Task selected"

  return <div className="pb-6">
    <PageHeader title="Settings" description="Configure AI, GitHub delivery, and local maintenance safely." actions={<Button variant="outline" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Log out</Button>} />
    {error ? <p role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{error}</p> : null}
    {message ? <p className="mb-5 flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-blue-200"><CheckCircle2 className="h-4 w-4" />{message}</p> : null}

    <div className="space-y-6">
      <Card>
        <CardHeader><div className="flex gap-3"><div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300"><Bot className="h-5 w-5" /></div><div><CardTitle>AI control center</CardTitle><CardDescription>Select a provider, decide how models are chosen, and keep keys protected on the server.</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium text-zinc-100">AI features</p><StateBadge ready={Boolean(status?.ai.provider_ready)}>{status?.ai.provider_ready ? "ready" : status?.ai.enabled ? "needs setup" : "off"}</StateBadge></div><p className="mt-1 text-sm text-zinc-500">{status?.ai.disabled_reason ?? `Ready with ${providerLabel[status?.ai.provider ?? "openai"]}`}</p></div><Toggle label="Enable AI features" checked={Boolean(status?.ai.enabled)} disabled={!status || busy !== null} onClick={() => status && void act("ai-enabled", () => updateAiSetting({ enabled: !status.ai.enabled }))} /></div>
          <div><div className="mb-2 flex items-baseline justify-between"><Label>Model behavior</Label><span className="text-xs text-zinc-500">Currently: {modelInUse}</span></div><div className="grid gap-2 sm:grid-cols-3">{modes.map((mode) => <button key={mode.value} type="button" disabled={!status || busy !== null} onClick={() => void act("model-mode", () => updateAiSetting({ model_mode: mode.value }), `AI mode set to ${mode.label}.`)} className={`rounded-xl border p-3 text-left transition disabled:opacity-50 ${status?.ai.model_mode === mode.value ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}><p className="font-medium text-zinc-100">{mode.label}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{mode.description}</p></button>)}</div></div>
          <div className="grid gap-3 md:grid-cols-3">{providers.map((name) => { const item = status?.ai.providers[name]; const selected = activeProvider === name; return <button key={name} type="button" disabled={!status || busy !== null} onClick={() => setActiveProvider(name)} className={`rounded-xl border p-4 text-left transition disabled:opacity-50 ${selected ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}><div className="flex items-center justify-between"><span className="font-semibold text-zinc-100">{providerLabel[name]}</span>{selected ? <Check className="h-4 w-4 text-blue-300" /> : null}</div><p className="mt-1 text-xs text-zinc-500">{name === status?.ai.provider ? "Active provider" : "Available provider"}</p><div className="mt-3"><StateBadge ready={Boolean(item?.configured)}>{item?.configured ? "key ready" : "key missing"}</StateBadge></div></button>})}</div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5"><div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="text-lg font-semibold text-zinc-100">{providerLabel[activeProvider]} configuration</p><p className="text-sm text-zinc-500">This provider becomes active when you select it below.</p></div><Button variant="outline" disabled={!status || status.ai.provider === activeProvider || busy !== null} onClick={() => void act("provider", () => updateAiSetting({ provider: activeProvider }), `${providerLabel[activeProvider]} selected as active provider.`)}>Use this provider</Button></div>
            <div className="grid gap-4 lg:grid-cols-2"><div><Label htmlFor="ai-key">API key</Label><div className="mt-1.5 flex gap-2"><Input id="ai-key" type="password" autoComplete="new-password" value={aiKey} placeholder={provider?.configured ? "Enter a replacement key" : "Enter API key"} onChange={(event) => setAiKey(event.target.value)} /><Button aria-label="Save API key" disabled={!aiKey.trim() || busy !== null} onClick={() => void act("save-ai-key", () => saveAiCredential(activeProvider, aiKey.trim()), `${providerLabel[activeProvider]} key saved.`).then(() => setAiKey(""))}><KeyRound className="h-4 w-4" /></Button></div><div className="mt-2 flex justify-between text-xs text-zinc-500"><span>Saved keys are encrypted and never shown.</span><button type="button" className="text-zinc-300 hover:text-white disabled:opacity-50" disabled={!provider?.configured || busy !== null} onClick={() => confirm(`Remove the saved ${providerLabel[activeProvider]} key?`) && void act("remove-ai-key", () => deleteAiCredential(activeProvider), "Saved AI key removed.")}>Remove saved key</button></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="fast-model">Fast model</Label><Input id="fast-model" className="mt-1.5 font-mono text-xs" value={modelDraft?.fast_model ?? ""} onChange={(event) => modelDraft && setModels({ ...models!, [activeProvider]: { ...modelDraft, fast_model: event.target.value } })} /></div><div><Label htmlFor="smart-model">Smart model</Label><Input id="smart-model" className="mt-1.5 font-mono text-xs" value={modelDraft?.smart_model ?? ""} onChange={(event) => modelDraft && setModels({ ...models!, [activeProvider]: { ...modelDraft, smart_model: event.target.value } })} /></div><div className="sm:col-span-2"><Button variant="outline" disabled={!modelDraft?.fast_model.trim() || !modelDraft?.smart_model.trim() || busy !== null} onClick={() => modelDraft && void act("save-models", () => updateAiSetting({ models: { [activeProvider]: modelDraft } }), "Model names saved.")}><Save className="mr-2 h-4 w-4" />Save model names</Button></div></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex gap-3"><div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-300"><Github className="h-5 w-5" /></div><div><CardTitle>GitHub integration</CardTitle><CardDescription>Receive repository activity and optionally enrich merged pull requests with a read-only token.</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-5"><div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium text-zinc-100">Webhook delivery</p><StateBadge ready={Boolean(status?.github.ready)}>{status?.github.ready ? "ready" : status?.github.enabled ? "needs secret" : "off"}</StateBadge></div><p className="mt-1 text-sm text-zinc-500">{status?.github.disabled_reason ?? "GitHub can deliver repository activity."}</p></div><Toggle label="Enable GitHub integration" checked={Boolean(status?.github.enabled)} disabled={!status || busy !== null} onClick={() => status && void act("github-enabled", () => updateGithubSetting(!status.github.enabled))} /></div>
          <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><div><Label htmlFor="github-token">Fine-grained personal access token <span className="text-zinc-500">(optional)</span></Label><div className="mt-1.5 flex gap-2"><Input id="github-token" type="password" autoComplete="new-password" placeholder={status?.github.access_token_configured ? "Enter replacement token" : "For private PR diff enrichment"} value={githubToken} onChange={(event) => setGithubToken(event.target.value)} /><Button aria-label="Save GitHub access token" disabled={!githubToken.trim() || busy !== null} onClick={() => void act("github-token", () => saveGithubCredential("access_token", githubToken.trim()), "GitHub token saved.").then(() => setGithubToken(""))}><KeyRound className="h-4 w-4" /></Button></div><button type="button" className="mt-1 text-xs text-zinc-400 hover:text-white disabled:opacity-50" disabled={!status?.github.access_token_configured || busy !== null} onClick={() => confirm("Remove the saved GitHub access token?") && void act("remove-github-token", () => deleteGithubCredential("access_token"), "Saved GitHub token removed.")}>Remove saved token</button></div>
            <div><Label htmlFor="github-secret">Webhook secret <span className="text-red-300">*</span></Label><div className="mt-1.5 flex gap-2"><Input id="github-secret" type="password" autoComplete="new-password" placeholder={status?.github.webhook_secret_configured ? "Enter replacement secret" : "A long random shared secret"} value={githubSecret} onChange={(event) => setGithubSecret(event.target.value)} /><Button aria-label="Save GitHub webhook secret" disabled={!githubSecret.trim() || busy !== null} onClick={() => void act("github-secret", () => saveGithubCredential("webhook_secret", githubSecret.trim()), "Webhook secret saved.").then(() => setGithubSecret(""))}><ShieldCheck className="h-4 w-4" /></Button></div><button type="button" className="mt-1 text-xs text-zinc-400 hover:text-white disabled:opacity-50" disabled={!status?.github.webhook_secret_configured || busy !== null} onClick={() => confirm("Remove the saved GitHub webhook secret?") && void act("remove-github-secret", () => deleteGithubCredential("webhook_secret"), "Saved webhook secret removed.")}>Remove saved secret</button></div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="font-medium text-zinc-100">GitHub webhook setup</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-5 text-zinc-400"><li>Set <code className="text-zinc-200">API_PUBLIC_ORIGIN</code> to the public URL of this API—GitHub cannot reach localhost.</li><li>Create a GitHub fine-grained token with read-only repository metadata and contents access if you want private PR-diff enrichment.</li><li>In the repository’s Settings → Webhooks, add the URL below, choose <strong className="text-zinc-200">application/json</strong>, and use the saved webhook secret.</li><li>Subscribe to: {status?.github.webhook_events.join(", ") ?? "Pull requests, Pushes, Workflow runs, Check runs"}.</li></ol><div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2"><code className="min-w-0 flex-1 truncate text-xs text-zinc-200">{status?.github.webhook_url ?? "Loading webhook URL…"}</code><Button variant="ghost" className="h-8 w-8 p-0" aria-label="Copy webhook URL" disabled={!status?.github.webhook_url} onClick={() => void copyWebhook()}><Copy className="h-4 w-4" /></Button></div></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Other integrations</CardTitle><CardDescription>Safe configuration status without exposing credentials.</CardDescription></CardHeader><CardContent><div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between"><span className="font-medium text-zinc-100">Web search</span><StateBadge ready={Boolean(status?.web_search.enabled && status?.web_search.api_key_configured)}>{status?.web_search.enabled ? "enabled" : "disabled"}</StateBadge></div><p className="mt-1 text-sm text-zinc-500">{status?.web_search.provider ?? "No provider selected"}</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Maintenance</CardTitle><CardDescription>These actions apply to this browser and your knowledge graph.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={clearDrafts}><Database className="mr-2 h-4 w-4" />Clear browser drafts</Button><Button variant="outline" onClick={() => void decayConfidenceJob().then((result) => setMessage(`Updated ${result.updated_count} confidence scores.`)).catch((value) => setError(value instanceof Error ? value.message : "Job failed."))}><RefreshCw className="mr-2 h-4 w-4" />Run confidence decay</Button></CardContent></Card></div>
    </div>
  </div>
}
