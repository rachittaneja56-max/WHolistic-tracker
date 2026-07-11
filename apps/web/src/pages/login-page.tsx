import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"

export function LoginPage() {
  const { session, login } = useAuth()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try { await login(password); setPassword("") }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to sign in.") }
    finally { setSubmitting(false) }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-300">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-300">Personal Dev KG</p>
          <CardTitle className="text-2xl">Owner sign in</CardTitle>
          <CardDescription>Use the single-owner password configured on the backend. It is never stored in the browser.</CardDescription>
        </CardHeader>
        <CardContent>
          {session && !session.configured ? <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300">Authentication is not configured. Set APP_ADMIN_PASSWORD_HASH and APP_SESSION_SECRET on the API.</p> : null}
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2"><Label htmlFor="owner-password">Password</Label><Input id="owner-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <Button className="w-full" disabled={submitting || !password}>{submitting ? "Signing in..." : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
