import { useEffect, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle2, KeyRound, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { acceptPasswordReset, getPasswordReset, resolvePasswordResetSource } from "@/lib/auth-client"

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  const source = resolvePasswordResetSource(params.get("source"))
  const callbackError = params.has("error")
  const [email, setEmail] = useState("")
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setEmail("")
    setReady(false)
    setError(null)
    if (callbackError) { setError("This reset link is invalid or expired."); return }
    if (!token) { setError("This reset link is missing its token."); return }
    if (!source) { setError("This reset link has an invalid source."); return }
    if (source === "self-service") { setReady(true); return }
    void getPasswordReset(token)
      .then((value) => { if (active) { setEmail(value.email); setReady(true) } })
      .catch((value) => { if (active) setError(value instanceof Error ? value.message : "Invalid reset link") })
    return () => { active = false }
  }, [callbackError, source, token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!source || !ready) return
    setSubmitting(true)
    setError(null)
    try { await acceptPasswordReset(token, password, source); setDone(true); setPassword("") }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to reset password") }
    finally { setSubmitting(false) }
  }

  return <AuthShell eyebrow={done ? "Password updated" : "Account recovery"} title={done ? "Your password is secure" : "Choose a new password"} description={done ? "All previous sessions were revoked. Sign in again with your new password." : email ? `Resetting the password for ${email}.` : ready ? "Enter a new password to finish account recovery." : "Checking your one-time reset link..."}>
    {done ? <div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success/10"><CheckCircle2 className="h-6 w-6 text-success" /></span><p className="mt-5 text-sm leading-6 text-muted-foreground">Your previous sessions have been signed out as a security precaution.</p><Button asChild className="mt-6 w-full"><Link to="/login">Sign in with new password</Link></Button></div> : <form className="space-y-5" onSubmit={submit}>
      {email ? <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3"><Mail className="h-4 w-4 text-primary" /><p className="truncate text-sm text-foreground">{email}</p></div> : null}
      <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="reset-password">New password</Label><span className="text-xs text-muted-foreground">At least 12 characters</span></div><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="reset-password" className="pl-10" type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting || !ready} required /></div></div>
      {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger" role="alert">{error}</p> : null}
      <Button className="w-full" disabled={submitting || !ready || password.length < 12}>{submitting ? "Updating password..." : "Reset password"}</Button>
      {error && !ready ? <Button asChild variant="outline" className="w-full"><Link to="/forgot-password">Request another link</Link></Button> : null}
    </form>}
  </AuthShell>
}
