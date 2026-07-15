import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { CheckCircle2, KeyRound, Mail, User } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { TurnstileChallenge } from "@/components/turnstile-challenge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import { getAuthConfig, type AuthConfig } from "@/lib/auth-client"
import { getSafeReturnTo } from "@/lib/auth-routing"
import { recordProductEvent } from "@/lib/api"

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = getSafeReturnTo(params.get("returnTo"))
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [challengeKey, setChallengeKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { void getAuthConfig().then(setConfig) }, [])
  const minimum = config?.passwordMinLength ?? 12

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signup(email.trim(), name.trim(), password, `${window.location.origin}${returnTo}`, captchaToken || undefined)
      setDone(true)
      setPassword("")
      if (!config?.emailVerificationRequired) {
        void recordProductEvent("signup_activated", { method: "email" }).catch(() => undefined)
        navigate(returnTo, { replace: true })
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to create your account.")
      setCaptchaToken("")
      setChallengeKey((current) => current + 1)
    } finally {
      setSubmitting(false)
    }
  }

  return <AuthShell
    eyebrow={done ? "Check your email" : "Create your workspace"}
    title={done ? "Verify your email to continue" : "Start learning with a clearer system"}
    description={done ? `We sent a verification link to ${email}. Open it to activate your workspace.` : "Create a standard account. Your notes, projects, practice, and AI settings stay isolated to your workspace."}
  >
    {done ? <div className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success/10"><CheckCircle2 className="h-6 w-6 text-success" /></span>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">The link is time-limited. You can close this page after opening the verification email.</p>
      <Button asChild variant="outline" className="mt-6 w-full"><Link to="/login">Return to sign in</Link></Button>
    </div> : <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="signup-name">Your name</Label><div className="relative"><User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="signup-name" className="pl-10" autoComplete="name" autoFocus value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} required /></div></div>
      <div className="space-y-2"><Label htmlFor="signup-email">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="signup-email" className="pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} required /></div></div>
      <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="signup-password">Create password</Label><span className="text-xs text-muted-foreground">{minimum}+ characters</span></div><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="signup-password" className="pl-10" type="password" minLength={minimum} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} required /></div></div>
      <TurnstileChallenge key={challengeKey} enabled={Boolean(config?.turnstileEnabled)} siteKey={config?.turnstileSiteKey} onToken={setCaptchaToken} />
      {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">{error}</p> : null}
      <Button className="w-full" disabled={submitting || !email.trim() || !name.trim() || password.length < minimum || Boolean(config?.turnstileEnabled && !captchaToken)}>{submitting ? "Creating workspace..." : "Create workspace"}</Button>
    </form>}
    <div className="mt-6 border-t border-border pt-5 text-center"><p className="text-xs leading-5 text-muted-foreground">Already have an account? <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="font-medium text-foreground underline underline-offset-4">Sign in</Link>.</p></div>
  </AuthShell>
}
