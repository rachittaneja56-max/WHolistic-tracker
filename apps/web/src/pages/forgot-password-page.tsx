import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { TurnstileChallenge } from "@/components/turnstile-challenge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAuthConfig, getSelfServicePasswordResetRedirect, requestPasswordReset, type AuthConfig } from "@/lib/auth-client"

export function ForgotPasswordPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void getAuthConfig().then(setConfig) }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await requestPasswordReset(email.trim(), getSelfServicePasswordResetRedirect(window.location.origin), captchaToken || undefined)
      setDone(true)
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to request a reset link.")
    } finally {
      setSubmitting(false)
    }
  }

  return <AuthShell eyebrow="Account recovery" title={done ? "Check your inbox" : "Reset your password"} description={done ? "If that account exists, a time-limited reset link has been sent." : "Request a one-time link. For privacy, the result does not reveal whether an address is registered."}>
    {done ? <div className="text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-success" /><Button asChild variant="outline" className="mt-6 w-full"><Link to="/login">Back to sign in</Link></Button></div> : <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="recovery-email">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="recovery-email" className="pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></div>
      <TurnstileChallenge enabled={Boolean(config?.turnstileEnabled)} siteKey={config?.turnstileSiteKey} onToken={setCaptchaToken} />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button className="w-full" disabled={submitting || !email.trim() || Boolean(config?.turnstileEnabled && !captchaToken)}>{submitting ? "Sending..." : "Send reset link"}</Button>
    </form>}
  </AuthShell>
}
