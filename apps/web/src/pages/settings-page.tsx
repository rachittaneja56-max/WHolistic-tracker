import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react"
import { Bot, Check, CheckCircle2, Copy, Database, Download, Github, KeyRound, LogOut, Monitor, Moon, Palette, RefreshCw, Save, ShieldCheck, Sun, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import { learningFocusOptions } from "@/features/preferences/learning-focuses"
import { usePreferences } from "@/features/preferences/preferences-context"
import { confirmsAccountDeletion } from "@/features/settings/privacy"
import type { ThemePreference } from "@/features/theme/theme-provider"
import { decayConfidenceJob } from "@/lib/api"
import {
  deleteAiCredential, deleteGithubCredential, deleteOwnAccount, downloadAccountData, getSettingsStatus, invalidateSettingsStatus, saveAiCredential, saveGithubCredential,
  updateAiSetting, updateGithubSetting, type AiModelMode, type AiProviderName, type SettingsStatus,
} from "@/lib/system-api"

const providers: AiProviderName[] = ["openai", "gemini", "mistral"]
const providerLabel = { openai: "OpenAI", gemini: "Gemini", mistral: "Mistral" }
const modes: { value: AiModelMode; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "Uses Fast or Smart based on the task." },
  { value: "fast", label: "Fast", description: "Uses the Fast model for every request." },
  { value: "smart", label: "Smart", description: "Uses the Smart model for every request." },
]
const themeOptions: { value: ThemePreference; label: string; description: string; icon: typeof Monitor }[] = [
  { value: "system", label: "System", description: "Follow this device", icon: Monitor },
  { value: "light", label: "Light", description: "Always use light", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use dark", icon: Moon },
]
const dialogFocusable = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"

function StateBadge({ ready, children }: { ready: boolean; children: ReactNode }) {
  return <Badge variant={ready ? "blue" : "warning"}>{children}</Badge>
}

function Toggle({ checked, disabled, label, onClick }: { checked: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} role="switch" aria-checked={checked} disabled={disabled} onClick={onClick} className={`relative h-7 w-12 rounded-full border transition ${checked ? "border-primary bg-primary" : "border-border-strong bg-surface-subtle"} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button>
}

function AccountDeletionDialog({ open, email, busy, error, returnFocusRef, onCancel, onConfirm }: {
  open: boolean
  email: string
  busy: boolean
  error: string | null
  returnFocusRef: RefObject<HTMLButtonElement>
  onCancel: () => void
  onConfirm: (confirmation: string) => void
}) {
  const [confirmation, setConfirmation] = useState("")
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setConfirmation(""); return }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus()
    }
  }, [open, returnFocusRef])

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onCancel(); return }
    if (event.key !== "Tab") return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(dialogFocusable) ?? [])
    if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  if (!open) return null
  const confirmed = confirmsAccountDeletion(confirmation, email)
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" tabIndex={-1} onKeyDown={trapFocus} className="w-full max-w-lg rounded-2xl border border-danger/30 bg-surface p-6 shadow-2xl outline-none">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-danger/10 p-2.5 text-danger"><Trash2 className="h-5 w-5" /></div><div><h2 id="delete-account-title" className="text-lg font-semibold text-foreground">Permanently delete your account?</h2><p id="delete-account-description" className="mt-2 text-sm leading-6 text-secondary">This removes your workspace, knowledge graph, reviews, assistant history, integrations, and account. This cannot be undone. Export your data first if you need a copy.</p></div></div>
      <Label htmlFor="delete-account-email" className="mt-5 block">Type <span className="font-mono text-foreground">{email}</span> to confirm</Label>
      <Input ref={inputRef} id="delete-account-email" className="mt-2" type="email" autoComplete="off" spellCheck={false} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-describedby={error ? "delete-account-error" : undefined} />
      {error ? <p id="delete-account-error" role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button><Button variant="destructive" disabled={busy || !confirmed} onClick={() => onConfirm(confirmation)}>{busy ? "Deleting account..." : "Delete account permanently"}</Button></div>
    </div>
  </div>
}

export function SettingsPage() {
  const { logout, user } = useAuth()
  const { preferences, loading: preferencesLoading, updatePreferences } = usePreferences()
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [activeProvider, setActiveProvider] = useState<AiProviderName>("openai")
  const [models, setModels] = useState<Record<AiProviderName, { fast_model: string; smart_model: string }> | null>(null)
  const [aiKey, setAiKey] = useState("")
  const [githubToken, setGithubToken] = useState("")
  const [githubSecret, setGithubSecret] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)

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
    Object.keys(sessionStorage).filter((key) => key.startsWith("pdkg:capture-draft:v1:")).forEach((key) => sessionStorage.removeItem(key))
    setMessage("Browser drafts cleared.")
  }

  async function savePreference(patch: Parameters<typeof updatePreferences>[0], success: string) {
    setBusy("preferences"); setError(null); setMessage(null)
    try { await updatePreferences(patch); setMessage(success) }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to update preferences.") }
    finally { setBusy(null) }
  }

  function toggleLearningFocus(focus: string) {
    const selected = preferences.learning_focuses.includes(focus)
      ? preferences.learning_focuses.filter((item) => item !== focus)
      : [...preferences.learning_focuses, focus]
    void savePreference({ learning_focuses: selected }, "Learning focuses updated.")
  }

  async function exportAccount() {
    setBusy("account-export"); setError(null); setMessage(null)
    try { await downloadAccountData(); setMessage("Your account export was downloaded.") }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to export account data.") }
    finally { setBusy(null) }
  }

  async function removeAccount(confirmation: string) {
    setBusy("account-delete"); setDeleteError(null)
    try {
      await deleteOwnAccount(confirmation)
      invalidateSettingsStatus()
      Object.keys(localStorage).filter((key) => key.startsWith("personal-dev-kg:entity-draft:")).forEach((key) => localStorage.removeItem(key))
    Object.keys(sessionStorage).filter((key) => key.startsWith("pdkg:capture-draft:v1:")).forEach((key) => sessionStorage.removeItem(key))
      await logout().catch(() => undefined)
      window.location.assign("/")
    } catch (value) {
      setDeleteError(value instanceof Error ? value.message : "Unable to delete this account.")
      setBusy(null)
    }
  }

  const provider = status?.ai.providers[activeProvider]
  const modelDraft = models?.[activeProvider]
  const modelInUse = status?.ai.model_mode === "fast" ? provider?.fast_model : status?.ai.model_mode === "smart" ? provider?.smart_model : "Task selected"

  return <div className="pb-6">
    <PageHeader title="Settings" description="Configure AI, GitHub delivery, and local maintenance safely." actions={<Button variant="outline" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Log out</Button>} />
    {error ? <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p> : null}
    {message ? <p className="mb-5 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />{message}</p> : null}

    <div className="space-y-6">
      <Card>
        <CardHeader><div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="h-5 w-5" /></div><div><CardTitle>AI control center</CardTitle><CardDescription>Select a provider, decide how models are chosen, and keep keys protected on the server.</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium text-foreground">AI features</p><StateBadge ready={Boolean(status?.ai.provider_ready)}>{status?.ai.provider_ready ? "ready" : status?.ai.enabled ? "needs setup" : "off"}</StateBadge></div><p className="mt-1 text-sm text-muted-foreground">{status?.ai.disabled_reason ?? `Ready with ${providerLabel[status?.ai.provider ?? "openai"]}`}</p></div><Toggle label="Enable AI features" checked={Boolean(status?.ai.enabled)} disabled={!status || busy !== null} onClick={() => status && void act("ai-enabled", () => updateAiSetting({ enabled: !status.ai.enabled }))} /></div>
          <div><div className="mb-2 flex items-baseline justify-between"><Label>Model behavior</Label><span className="text-xs text-muted-foreground">Currently: {modelInUse}</span></div><div className="grid gap-2 sm:grid-cols-3">{modes.map((mode) => <button key={mode.value} type="button" disabled={!status || busy !== null} onClick={() => void act("model-mode", () => updateAiSetting({ model_mode: mode.value }), `AI mode set to ${mode.label}.`)} className={`rounded-xl border p-3 text-left transition disabled:opacity-50 ${status?.ai.model_mode === mode.value ? "border-primary bg-primary/10" : "border-border bg-background hover:border-border-strong"}`}><p className="font-medium text-foreground">{mode.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{mode.description}</p></button>)}</div></div>
          <div className="grid gap-3 md:grid-cols-3">{providers.map((name) => { const item = status?.ai.providers[name]; const selected = activeProvider === name; return <button key={name} type="button" disabled={!status || busy !== null} onClick={() => setActiveProvider(name)} className={`rounded-xl border p-4 text-left transition disabled:opacity-50 ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-border-strong"}`}><div className="flex items-center justify-between"><span className="font-semibold text-foreground">{providerLabel[name]}</span>{selected ? <Check className="h-4 w-4 text-primary" /> : null}</div><p className="mt-1 text-xs text-muted-foreground">{name === status?.ai.provider ? "Active provider" : "Available provider"}</p><div className="mt-3"><StateBadge ready={Boolean(item?.configured)}>{item?.configured ? "key ready" : "key missing"}</StateBadge></div></button>})}</div>
          <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5"><div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="text-lg font-semibold text-foreground">{providerLabel[activeProvider]} configuration</p><p className="text-sm text-muted-foreground">This provider becomes active when you select it below.</p></div><Button variant="outline" disabled={!status || status.ai.provider === activeProvider || busy !== null} onClick={() => void act("provider", () => updateAiSetting({ provider: activeProvider }), `${providerLabel[activeProvider]} selected as active provider.`)}>Use this provider</Button></div>
            <div className="grid gap-4 lg:grid-cols-2"><div><Label htmlFor="ai-key">API key</Label><div className="mt-1.5 flex gap-2"><Input id="ai-key" type="password" autoComplete="new-password" value={aiKey} placeholder={provider?.configured ? "Enter a replacement key" : "Enter API key"} onChange={(event) => setAiKey(event.target.value)} /><Button aria-label="Save API key" disabled={!aiKey.trim() || busy !== null} onClick={() => void act("save-ai-key", () => saveAiCredential(activeProvider, aiKey.trim()), `${providerLabel[activeProvider]} key saved.`).then(() => setAiKey(""))}><KeyRound className="h-4 w-4" /></Button></div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Saved keys are encrypted and never shown.</span><button type="button" className="text-secondary hover:text-foreground disabled:opacity-50" disabled={!provider?.configured || busy !== null} onClick={() => confirm(`Remove the saved ${providerLabel[activeProvider]} key?`) && void act("remove-ai-key", () => deleteAiCredential(activeProvider), "Saved AI key removed.")}>Remove saved key</button></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="fast-model">Fast model</Label><Input id="fast-model" className="mt-1.5 font-mono text-xs" value={modelDraft?.fast_model ?? ""} onChange={(event) => modelDraft && setModels({ ...models!, [activeProvider]: { ...modelDraft, fast_model: event.target.value } })} /></div><div><Label htmlFor="smart-model">Smart model</Label><Input id="smart-model" className="mt-1.5 font-mono text-xs" value={modelDraft?.smart_model ?? ""} onChange={(event) => modelDraft && setModels({ ...models!, [activeProvider]: { ...modelDraft, smart_model: event.target.value } })} /></div><div className="sm:col-span-2"><Button variant="outline" disabled={!modelDraft?.fast_model.trim() || !modelDraft?.smart_model.trim() || busy !== null} onClick={() => modelDraft && void act("save-models", () => updateAiSetting({ models: { [activeProvider]: modelDraft } }), "Model names saved.")}><Save className="mr-2 h-4 w-4" />Save model names</Button></div></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></div><div><CardTitle>AI data and review</CardTitle><CardDescription>See where task-specific information can go before you enable or use AI features.</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-background p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active provider</p><p className="mt-2 font-medium text-foreground">{status ? providerLabel[status.ai_egress.provider] : "Loading..."}</p></div><div className="rounded-xl border border-border bg-background p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">External destination</p><p className="mt-2 break-all font-mono text-sm text-foreground">{status?.ai_egress.destination ?? "Loading..."}</p></div></div>
          <div><h3 className="font-medium text-foreground">Data that a feature may send</h3><p className="mt-1 text-sm leading-6 text-secondary">Only task-specific fields selected for the feature are sent. The provider may process these categories when they are needed:</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{status?.ai_egress.data_categories.map((category) => <li key={category} className="flex gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-secondary"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /><span>{category}</span></li>) ?? <li className="text-sm text-muted-foreground">Loading disclosure...</li>}</ul></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border bg-surface-subtle p-4"><p className="font-medium text-foreground">Sensitive-item exclusion</p><p className="mt-1 text-sm leading-6 text-secondary">{status?.ai_egress.ai_exclude_supported ? "Items marked AI excluded are withheld from provider context." : "AI exclusion is not currently available."}</p></div><div className="rounded-xl border border-border bg-surface-subtle p-4"><p className="font-medium text-foreground">Review before write</p><p className="mt-1 text-sm leading-6 text-secondary">{status?.ai_egress.review_before_write ? "AI suggestions require your confirmation before they change durable learning state." : "Review-before-write is not currently enabled."}</p></div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Github className="h-5 w-5" /></div><div><CardTitle>GitHub integration</CardTitle><CardDescription>Receive repository activity and optionally enrich merged pull requests with a read-only token.</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-5"><div className="flex flex-col gap-3 rounded-xl border border-border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium text-foreground">Webhook delivery</p><StateBadge ready={Boolean(status?.github.ready)}>{status?.github.ready ? "ready" : status?.github.enabled ? "needs secret" : "off"}</StateBadge></div><p className="mt-1 text-sm text-muted-foreground">{status?.github.disabled_reason ?? "GitHub can deliver repository activity."}</p></div><Toggle label="Enable GitHub integration" checked={Boolean(status?.github.enabled)} disabled={!status || busy !== null} onClick={() => status && void act("github-enabled", () => updateGithubSetting(!status.github.enabled))} /></div>
          <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><div><Label htmlFor="github-token">Fine-grained personal access token <span className="text-muted-foreground">(optional)</span></Label><div className="mt-1.5 flex gap-2"><Input id="github-token" type="password" autoComplete="new-password" placeholder={status?.github.access_token_configured ? "Enter replacement token" : "For private PR diff enrichment"} value={githubToken} onChange={(event) => setGithubToken(event.target.value)} /><Button aria-label="Save GitHub access token" disabled={!githubToken.trim() || busy !== null} onClick={() => void act("github-token", () => saveGithubCredential("access_token", githubToken.trim()), "GitHub token saved.").then(() => setGithubToken(""))}><KeyRound className="h-4 w-4" /></Button></div><button type="button" className="mt-1 text-xs text-secondary hover:text-foreground disabled:opacity-50" disabled={!status?.github.access_token_configured || busy !== null} onClick={() => confirm("Remove the saved GitHub access token?") && void act("remove-github-token", () => deleteGithubCredential("access_token"), "Saved GitHub token removed.")}>Remove saved token</button></div>
            <div><Label htmlFor="github-secret">Webhook secret <span className="text-danger">*</span></Label><div className="mt-1.5 flex gap-2"><Input id="github-secret" type="password" autoComplete="new-password" placeholder={status?.github.webhook_secret_configured ? "Enter replacement secret" : "A long random shared secret"} value={githubSecret} onChange={(event) => setGithubSecret(event.target.value)} /><Button aria-label="Save GitHub webhook secret" disabled={!githubSecret.trim() || busy !== null} onClick={() => void act("github-secret", () => saveGithubCredential("webhook_secret", githubSecret.trim()), "Webhook secret saved.").then(() => setGithubSecret(""))}><ShieldCheck className="h-4 w-4" /></Button></div><button type="button" className="mt-1 text-xs text-secondary hover:text-foreground disabled:opacity-50" disabled={!status?.github.webhook_secret_configured || busy !== null} onClick={() => confirm("Remove the saved GitHub webhook secret?") && void act("remove-github-secret", () => deleteGithubCredential("webhook_secret"), "Saved webhook secret removed.")}>Remove saved secret</button></div></div>
            <div className="rounded-xl border border-border bg-background p-4"><p className="font-medium text-foreground">GitHub webhook setup</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-5 text-secondary"><li>Set <code className="text-foreground">API_PUBLIC_ORIGIN</code> to the public URL of this API—GitHub cannot reach localhost.</li><li>Create a GitHub fine-grained token with read-only repository metadata and contents access if you want private PR-diff enrichment.</li><li>In the repository’s Settings → Webhooks, add the URL below, choose <strong className="text-foreground">application/json</strong>, and use the saved webhook secret.</li><li>Subscribe to: {status?.github.webhook_events.join(", ") ?? "Pull requests, Pushes, Workflow runs, Check runs"}.</li></ol><div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface p-2"><code className="min-w-0 flex-1 truncate text-xs text-foreground">{status?.github.webhook_url ?? "Loading webhook URL…"}</code><Button variant="ghost" className="h-8 w-8 p-0" aria-label="Copy webhook URL" disabled={!status?.github.webhook_url} onClick={() => void copyWebhook()}><Copy className="h-4 w-4" /></Button></div></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Palette className="h-5 w-5" /></div><div><CardTitle>Workspace preferences</CardTitle><CardDescription>Personalize the workspace and keep your learning priorities visible.</CardDescription></div></div></CardHeader>
        <CardContent className="space-y-6">
          <fieldset disabled={preferencesLoading || busy !== null}><legend className="text-sm font-medium text-foreground">Theme</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{themeOptions.map((option) => { const Icon = option.icon; const selected = preferences.theme === option.value; return <label key={option.value} className={`cursor-pointer rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-primary ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-border-strong"}`}><input className="sr-only" type="radio" name="workspace-theme" value={option.value} checked={selected} onChange={() => void savePreference({ theme: option.value }, `${option.label} theme selected.`)} /><span className="flex items-center gap-2 font-medium text-foreground"><Icon className="h-4 w-4" />{option.label}</span><span className="mt-1 block text-xs text-muted-foreground">{option.description}</span></label> })}</div></fieldset>
          <fieldset disabled={preferencesLoading || busy !== null}><legend className="text-sm font-medium text-foreground">Learning focuses</legend><p className="mt-1 text-sm text-muted-foreground">Choose what should shape onboarding and recommended next actions.</p><div className="mt-3 flex flex-wrap gap-2">{learningFocusOptions.map((focus) => { const selected = preferences.learning_focuses.includes(focus); return <button key={focus} type="button" aria-pressed={selected} onClick={() => toggleLearningFocus(focus)} className={`rounded-full border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-secondary hover:border-border-strong hover:text-foreground"}`}>{selected ? <Check className="mr-1.5 inline h-3.5 w-3.5" /> : null}{focus}</button> })}</div></fieldset>
          <section className="rounded-xl border border-border bg-background p-4"><h3 className="font-medium text-foreground">Study rhythm</h3><p className="mt-1 text-sm text-muted-foreground">Limits guide deterministic planning and never schedule work automatically.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-muted-foreground">Typical minutes<Input className="mt-1" type="number" min="0" max="1440" defaultValue={preferences.typical_study_minutes} onBlur={(event) => void savePreference({ typical_study_minutes: Number(event.target.value) || 0 }, "Typical study time updated.")} /></label><label className="text-xs text-muted-foreground">Focus minutes<Input className="mt-1" type="number" min="5" max="240" defaultValue={preferences.preferred_focus_minutes} onBlur={(event) => void savePreference({ preferred_focus_minutes: Number(event.target.value) || 45 }, "Focus duration updated.")} /></label><label className="text-xs text-muted-foreground">Daily maximum<Input className="mt-1" type="number" min="0" max="1440" defaultValue={preferences.max_daily_workload_minutes} onBlur={(event) => void savePreference({ max_daily_workload_minutes: Number(event.target.value) || 0 }, "Daily workload maximum updated.")} /></label><label className="text-xs text-muted-foreground">Active semester<Input className="mt-1" defaultValue={preferences.active_semester ?? ""} onBlur={(event) => void savePreference({ active_semester: event.target.value || null }, "Active semester updated.")} /></label></div></section>
          <section className="rounded-xl border border-border bg-background p-4"><h3 className="font-medium text-foreground">Visible modules</h3><div className="mt-3 flex flex-wrap gap-2">{[["subjects", "Subjects"], ["dsa", "DSA"], ["projects", "Projects"], ["notes", "Notes"], ["recall", "Recall"], ["comprehension", "Comprehension"], ["insights", "Insights"]].map(([id, label]) => <Button key={id} type="button" size="sm" variant={preferences.hidden_modules.includes(id) ? "outline" : "default"} onClick={() => void savePreference({ hidden_modules: preferences.hidden_modules.includes(id) ? preferences.hidden_modules.filter((item) => item !== id) : [...preferences.hidden_modules, id] }, `${label} visibility updated.`)}>{preferences.hidden_modules.includes(id) ? `Show ${label}` : `Hide ${label}`}</Button>)}</div></section>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-foreground">Onboarding guide</p><p className="mt-1 text-sm text-muted-foreground">{preferences.onboarding_completed ? "You completed onboarding. Reset it to revisit the guide." : "The onboarding guide is available on Home."}</p></div>{preferences.onboarding_completed ? <Button variant="outline" disabled={busy !== null} onClick={() => void savePreference({ onboarding_completed: false }, "Onboarding guide reset.")}>Reset guide</Button> : null}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Data and account</CardTitle><CardDescription>Take a portable copy of your workspace or permanently remove your account.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-foreground">Export account data</p><p className="mt-1 max-w-2xl text-sm leading-6 text-secondary">Download a JSON copy of your profile, workspace settings, entities, links, learning history, assistant history, integrations, and usage records. Secret credentials are excluded.</p></div><Button variant="outline" disabled={busy !== null} onClick={() => void exportAccount()}><Download className="mr-2 h-4 w-4" />{busy === "account-export" ? "Preparing..." : "Download JSON"}</Button></div>
          <div className="flex flex-col gap-4 rounded-xl border border-danger/30 bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-foreground">Delete account</p><p className="mt-1 max-w-2xl text-sm leading-6 text-secondary">Permanently remove this account and its entire workspace. This action cannot be undone.</p>{user?.role === "root_admin" ? <p className="mt-2 text-sm text-warning">The root administrator account is protected and cannot be deleted here.</p> : null}</div><Button ref={deleteTriggerRef} variant="destructive" disabled={!user?.email || user.role === "root_admin" || busy !== null} onClick={() => { setDeleteError(null); setDeleteOpen(true) }}><Trash2 className="mr-2 h-4 w-4" />Delete account</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Other integrations</CardTitle><CardDescription>Safe configuration status without exposing credentials.</CardDescription></CardHeader><CardContent><div className="rounded-xl border border-border bg-background p-4"><div className="flex items-center justify-between"><span className="font-medium text-foreground">Web search</span><StateBadge ready={Boolean(status?.web_search.enabled && status?.web_search.api_key_configured)}>{status?.web_search.enabled ? "enabled" : "disabled"}</StateBadge></div><p className="mt-1 text-sm text-muted-foreground">{status?.web_search.provider ?? "No provider selected"}</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Maintenance</CardTitle><CardDescription>These actions apply to this browser and your knowledge graph.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={clearDrafts}><Database className="mr-2 h-4 w-4" />Clear browser drafts</Button><Button variant="outline" onClick={() => void decayConfidenceJob().then((result) => setMessage(`Updated ${result.updated_count} confidence scores.`)).catch((value) => setError(value instanceof Error ? value.message : "Job failed."))}><RefreshCw className="mr-2 h-4 w-4" />Run confidence decay</Button></CardContent></Card></div>
    </div>
    <AccountDeletionDialog open={deleteOpen} email={user?.email ?? ""} busy={busy === "account-delete"} error={deleteError} returnFocusRef={deleteTriggerRef} onCancel={() => { setDeleteOpen(false); setDeleteError(null) }} onConfirm={(confirmation) => void removeAccount(confirmation)} />
  </div>
}
