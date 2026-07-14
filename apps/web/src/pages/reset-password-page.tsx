import { useEffect, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle2, KeyRound, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { acceptPasswordReset, getPasswordReset } from "@/lib/auth-client"

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setEmail("")
    setError(null)
    if (!token) {
      setError("This reset link is missing its token.")
      return
    }
    void getPasswordReset(token)
      .then((value) => setEmail(value.email))
      .catch((value) => setError(value instanceof Error ? value.message : "Invalid reset link"))
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await acceptPasswordReset(token, password)
      setDone(true)
      setPassword("")
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to reset password")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow={done ? "Password updated" : "Account recovery"}
      title={done ? "Your password is secure" : "Choose a new password"}
      description={done ? "All previous sessions were revoked. Sign in again with your new password." : email ? `Resetting the password for ${email}.` : "Checking your one-time reset link..."}
    >
      {done ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/5">
            <CheckCircle2 className="h-6 w-6 text-emerald-300" />
          </span>
          <p className="mt-5 text-sm leading-6 text-zinc-400">Your previous sessions have been signed out as a security precaution.</p>
          <Button asChild className="mt-6 w-full"><Link to="/login">Sign in with new password</Link></Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          {email ? (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3">
              <Mail className="h-4 w-4 text-blue-300" />
              <p className="truncate text-sm text-zinc-200">{email}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="reset-password">New password</Label><span className="text-[11px] text-zinc-600">At least 8 characters</span></div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input id="reset-password" className="pl-10" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting || !email} required />
            </div>
          </div>
          {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p> : null}
          <Button className="w-full" disabled={submitting || !email || password.length < 8}>{submitting ? "Updating password..." : "Reset password"}</Button>
        </form>
      )}
    </AuthShell>
  )
}
