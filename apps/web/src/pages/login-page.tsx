import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Github, LockKeyhole, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import { getAuthConfig } from "@/lib/auth-client"
import { buildSignupUrl, getSafeReturnTo } from "@/lib/auth-routing"

export function LoginPage() {
  const { login, loginWithGithub } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = getSafeReturnTo(params.get("returnTo"))
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [githubEnabled, setGithubEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [socialSubmitting, setSocialSubmitting] = useState(false)

  useEffect(() => {
    void getAuthConfig().then((value) => setGithubEnabled(value.githubEnabled))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
      setPassword("")
      navigate(returnTo, { replace: true })
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to sign in.")
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

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      description="Continue where you left off. New accounts can be created from the public sign-up page."
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
            <Input
              id="email"
              className="pl-10"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting || socialSubmitting}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <span className="text-[11px] text-zinc-600">8+ characters</span>
          </div>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
            <Input
              id="password"
              className="pl-10"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting || socialSubmitting}
              required
            />
          </div>
        </div>
        {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p> : null}
        <Button className="w-full" disabled={submitting || socialSubmitting || !email.trim() || !password}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      {githubEnabled ? (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-zinc-800" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">or continue with</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
          <Button variant="outline" className="w-full" disabled={submitting || socialSubmitting} onClick={() => void githubLogin()}>
            <Github className="mr-2 h-4 w-4" /> {socialSubmitting ? "Connecting..." : "GitHub"}
          </Button>
        </>
      ) : null}

      <div className="mt-6 border-t border-zinc-800 pt-5 text-center">
        <p className="text-xs leading-5 text-zinc-500">
          Need an account? <Link to={buildSignupUrl(returnTo)} className="text-zinc-200 underline decoration-zinc-600 underline-offset-4 transition hover:text-white">Create one here</Link>. Password reset links still come from your workspace administrator.
        </p>
      </div>
    </AuthShell>
  )
}
