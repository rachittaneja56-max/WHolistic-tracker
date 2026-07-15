import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Github, LockKeyhole, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { TurnstileChallenge } from "@/components/turnstile-challenge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import { getAuthConfig, type AuthConfig } from "@/lib/auth-client"
import { buildSignupUrl, getSafeReturnTo } from "@/lib/auth-routing"

export function LoginPage() {
  const { login, loginWithGithub } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = getSafeReturnTo(params.get("returnTo"))
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [challengeKey, setChallengeKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [socialSubmitting, setSocialSubmitting] = useState(false)

  useEffect(() => { void getAuthConfig().then(setConfig) }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password, captchaToken || undefined)
      setPassword("")
      navigate(returnTo, { replace: true })
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to sign in.")
      setCaptchaToken("")
      setChallengeKey((current) => current + 1)
    } finally {
      setSubmitting(false)
    }
  }

  async function githubLogin() {
    setSocialSubmitting(true)
    setError(null)
    try {
      await loginWithGithub(`${window.location.origin}${returnTo}`)
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to sign in with GitHub.")
      setSocialSubmitting(false)
    }
  }

  return <AuthShell eyebrow="Welcome back" title="Sign in to your workspace" description="Continue with your learning plan, current projects, and due reviews.">
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="email">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="email" className="pl-10" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting || socialSubmitting} required /></div></div>
      <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="password">Password</Label>{config?.passwordResetEnabled ? <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</Link> : null}</div><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="password" className="pl-10" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting || socialSubmitting} required /></div></div>
      <TurnstileChallenge key={challengeKey} enabled={Boolean(config?.turnstileEnabled)} siteKey={config?.turnstileSiteKey} onToken={setCaptchaToken} />
      {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">{error}</p> : null}
      <Button className="w-full" disabled={submitting || socialSubmitting || !email.trim() || !password || Boolean(config?.turnstileEnabled && !captchaToken)}>{submitting ? "Signing in..." : "Sign in"}</Button>
    </form>
    {config?.githubEnabled ? <><div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">or continue with</span><span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="w-full" disabled={submitting || socialSubmitting} onClick={() => void githubLogin()}><Github className="mr-2 h-4 w-4" />{socialSubmitting ? "Connecting..." : "GitHub"}</Button></> : null}
    <div className="mt-6 border-t border-border pt-5 text-center"><p className="text-xs leading-5 text-muted-foreground">Need an account? <Link to={buildSignupUrl(returnTo)} className="font-medium text-foreground underline underline-offset-4">Create a workspace</Link>.</p></div>
  </AuthShell>
}
