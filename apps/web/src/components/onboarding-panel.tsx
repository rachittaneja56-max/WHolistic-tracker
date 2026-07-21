import { useState } from "react"
import { Link } from "react-router-dom"
import { Braces, Check, ChevronRight, NotebookPen, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { learningFocusOptions } from "@/features/preferences/learning-focuses"
import { usePreferences } from "@/features/preferences/preferences-context"
import { cn } from "@/lib/utils"

export function OnboardingPanel() {
  const { preferences, loading, updatePreferences } = usePreferences()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  if (loading || preferences.onboarding_completed || dismissed) return null

  function toggleFocus(focus: string) {
    const selected = (preferences.learning_focuses ?? []).includes(focus)
      ? preferences.learning_focuses.filter((item) => item !== focus)
      : [...(preferences.learning_focuses ?? []), focus]
    void updatePreferences({ learning_focuses: selected }).catch(() => undefined)
  }

  async function complete() {
    setBusy(true)
    try { await updatePreferences({ onboarding_completed: true }) }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="onboarding-title" className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
    <div className="flex items-start justify-between gap-4">
      <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Set up at your pace</p><h2 id="onboarding-title" className="mt-1 text-lg font-semibold text-foreground">Make the workspace useful in three small steps</h2></div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Hide onboarding for now"><X className="h-4 w-4" /></Button>
    </div>
    <ol className="mt-5 grid gap-4 lg:grid-cols-3">
      <li className="rounded-xl border border-border bg-surface p-4"><p className="font-medium text-foreground">1. Choose your focus</p><div className="mt-3 flex flex-wrap gap-2">{learningFocusOptions.map((focus) => <button key={focus} type="button" aria-pressed={(preferences.learning_focuses ?? []).includes(focus)} onClick={() => toggleFocus(focus)} className={cn("min-h-9 rounded-full border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", (preferences.learning_focuses ?? []).includes(focus) ? "border-primary bg-primary/10 text-primary" : "border-border text-secondary")}>{(preferences.learning_focuses ?? []).includes(focus) ? <Check className="mr-1 inline h-3 w-3" /> : null}{focus}</button>)}</div></li>
      <li className="rounded-xl border border-border bg-surface p-4"><p className="font-medium text-foreground">2. Create or import one item</p><div className="mt-3 grid gap-2"><Link to="/capture" className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-sm text-secondary hover:border-primary"><span className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-primary" />Capture an item</span><ChevronRight className="h-4 w-4" /></Link><Link to="/trackers/dsa" className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-sm text-secondary hover:border-primary"><span className="flex items-center gap-2"><Braces className="h-4 w-4 text-primary" />Connect LeetCode</span><ChevronRight className="h-4 w-4" /></Link></div></li>
      <li className="rounded-xl border border-border bg-surface p-4"><p className="font-medium text-foreground">3. Complete a first review</p><Link to="/knowledge/recall" className="mt-3 flex min-h-10 items-center justify-between rounded-lg border border-border px-3 text-sm text-secondary hover:border-primary"><span className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" />Open recall</span><ChevronRight className="h-4 w-4" /></Link><Button type="button" className="mt-3 w-full" size="sm" disabled={busy || (preferences.learning_focuses ?? []).length === 0} onClick={() => void complete()}>{busy ? "Saving..." : "Finish setup"}</Button></li>
    </ol>
    <button type="button" className="mt-4 text-xs text-muted-foreground underline underline-offset-4" onClick={() => setDismissed(true)}>Do this later</button>
  </section>
}
