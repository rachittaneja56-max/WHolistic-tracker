import { useEffect, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle2, KeyRound, Mail, User } from "lucide-react"

import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { acceptInvitation, getInvitation } from "@/lib/auth-client"

type Invitation = { email: string; role: string }

export function InvitePage() {
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  const [invite, setInvite] = useState<Invitation | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setInvite(null)
    setError(null)
    if (!token) {
      setError("This invitation link is missing its token.")
      return
    }
    void getInvitation(token)
      .then(setInvite)
      .catch((value) => setError(value instanceof Error ? value.message : "Invalid invitation"))
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await acceptInvitation({ token, name: name.trim(), password })
      setDone(true)
      setPassword("")
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to accept invitation")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow={done ? "Invitation accepted" : "Private invitation"}
      title={done ? "Your account is ready" : "Create your workspace account"}
      description={done ? "Your private workspace has been created. Sign in to start connecting your work." : invite ? `You have been invited as ${invite.role} for ${invite.email}.` : "Checking your one-time invitation link..."}
    >
      {done ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/5">
            <CheckCircle2 className="h-6 w-6 text-emerald-300" />
          </span>
          <p className="mt-5 text-sm leading-6 text-zinc-400">Use the email address from your invitation and the password you just created.</p>
          <Button asChild className="mt-6 w-full"><Link to="/login">Continue to sign in</Link></Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit}>
          {invite ? (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3">
              <Mail className="h-4 w-4 text-blue-300" />
              <div className="min-w-0"><p className="truncate text-sm text-zinc-200">{invite.email}</p><p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{invite.role} account</p></div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input id="name" className="pl-10" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={submitting || !invite} required />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="invite-password">Create password</Label><span className="text-[11px] text-zinc-600">At least 8 characters</span></div>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input id="invite-password" className="pl-10" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting || !invite} required />
            </div>
          </div>
          {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p> : null}
          <Button className="w-full" disabled={!invite || submitting || !name.trim() || password.length < 8}>{submitting ? "Creating account..." : "Create account"}</Button>
        </form>
      )}
    </AuthShell>
  )
}
