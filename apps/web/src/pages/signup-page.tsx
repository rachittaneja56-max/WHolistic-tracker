import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { CheckCircle2, KeyRound, Mail, User } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import { getSafeReturnTo } from "@/lib/auth-routing"

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = getSafeReturnTo(params.get("returnTo"))
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signup(email.trim(), name.trim(), password, `${window.location.origin}${returnTo}`)
      setDone(true)
      setPassword("")
      navigate(returnTo, { replace: true })
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to create your account.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow={done ? "Account created" : "Create your account"}
      title={done ? "Welcome in" : "Join your workspace"}
      description={done ? "Your account is ready. You are being sent to your workspace now." : "Anyone can create a standard account, and the root administrator stays reserved for rachittaneja56@gmail.com."}
    >
      {done ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/5">
            <CheckCircle2 className="h-6 w-6 text-emerald-300" />
          </span>
          <p className="mt-5 text-sm leading-6 text-zinc-400">If redirecting does not happen automatically, continue into the app.</p>
          <Button asChild className="mt-6 w-full"><Link to={returnTo}>Continue</Link></Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="signup-name">Your name</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input id="signup-name" className="pl-10" autoComplete="name" autoFocus value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Email address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input id="signup-email" className="pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} required />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="signup-password">Create password</Label><span className="text-[11px] text-zinc-600">8+ characters</span></div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input id="signup-password" className="pl-10" type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} required />
            </div>
          </div>
          {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p> : null}
          <Button className="w-full" disabled={submitting || !email.trim() || !name.trim() || password.length < 8}>{submitting ? "Creating account..." : "Create account"}</Button>
        </form>
      )}
      <div className="mt-6 border-t border-zinc-800 pt-5 text-center">
        <p className="text-xs leading-5 text-zinc-500">Already have an account? <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-zinc-200 underline decoration-zinc-600 underline-offset-4 transition hover:text-white">Sign in</Link>.</p>
      </div>
    </AuthShell>
  )
}
