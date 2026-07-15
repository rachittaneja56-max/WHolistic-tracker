import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/features/auth/auth-context"
import {
  banAdminUser,
  createAdminInvitation,
  createAdminPasswordReset,
  deleteAdminUser,
  downloadAdminUsers,
  getAdminAudit,
  getAdminHealth,
  getAdminInvitations,
  getAdminOverview,
  getAdminUser,
  getAdminUsers,
  revokeAdminInvitation,
  revokeAdminUserSessions,
  unbanAdminUser,
  updateAdminUserQuota,
  updateAdminUserRole,
  type AdminAudit,
  type AdminInvitation,
  type AdminOverview,
  type AdminUser,
  type AdminUserDetail,
} from "@/lib/system-api"

export function AdminPage() {
  const { user: actor } = useAuth()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invitations, setInvitations] = useState<AdminInvitation[]>([])
  const [health, setHealth] = useState<Record<string, string>>({})
  const [audit, setAudit] = useState<AdminAudit[]>([])
  const [selected, setSelected] = useState<AdminUserDetail | null>(null)
  const [search, setSearch] = useState("")
  const [email, setEmail] = useState("")
  const [oneTimeUrl, setOneTimeUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function load(query = search) {
    try {
      const [nextOverview, nextUsers, nextInvitations, nextHealth, nextAudit] = await Promise.all([
        getAdminOverview(), getAdminUsers(query), getAdminInvitations(), getAdminHealth(), getAdminAudit(),
      ])
      setOverview(nextOverview); setUsers(nextUsers.items); setInvitations(nextInvitations); setHealth(nextHealth); setAudit(nextAudit); setError(null)
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to load administration") }
  }

  useEffect(() => { void load("") }, [])

  async function invite(event: FormEvent) {
    event.preventDefault()
    try { const result = await createAdminInvitation(email, "user"); setOneTimeUrl(result.invite_url); setEmail(""); await load() }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to invite user") }
  }

  async function inspect(id: string) {
    try { setSelected(await getAdminUser(id)) }
    catch (value) { setError(value instanceof Error ? value.message : "Unable to load user") }
  }

  async function changeQuota(target: AdminUser) {
    const raw = window.prompt("Daily AI request limit", "200")
    if (!raw) return
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 1) { setError("Quota must be a positive whole number"); return }
    await updateAdminUserQuota(target.id, { max_ai_requests_per_day: value }); await inspect(target.id)
  }

  async function removeUser(target: AdminUser) {
    const confirmation = window.prompt(`Type ${target.email} to permanently delete this account and its workspace`)
    if (confirmation !== target.email) return
    await deleteAdminUser(target.id, confirmation); setSelected(null); await load()
  }

  const metrics: [string, number][] = overview ? [
    ["Users", overview.total], ["Active 24h", overview.active_24h], ["Active 7d", overview.active_7d],
    ["Banned", overview.banned], ["Entities", overview.entities], ["AI requests", overview.ai_requests],
  ] : []

  return <div className="space-y-6 p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="font-mono text-xs uppercase tracking-widest text-primary">Operations only</p><h1 className="text-2xl font-semibold text-foreground">Administration</h1><p className="text-sm text-muted-foreground">Account health and aggregate usage. Private workspace content is never exposed here.</p></div>
      <Button variant="outline" onClick={() => void downloadAdminUsers().catch((value) => setError(value.message))}>Export safe CSV</Button>
    </div>
    {error ? <p className="rounded border border-danger bg-danger/30 p-3 text-sm text-danger">{error}</p> : null}
    {oneTimeUrl ? <div className="rounded border border-primary bg-primary/30 p-3"><p className="mb-1 text-xs text-primary">Copy this one-time link now</p><code className="break-all text-xs text-primary">{oneTimeUrl}</code></div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{metrics.map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl text-foreground">{value}</p></CardContent></Card>)}</div>

    <Card><CardHeader><CardTitle>System health</CardTitle></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">{Object.entries(health).map(([key, value]) => <div key={key} className="rounded border border-border p-2"><p className="text-[10px] uppercase text-muted-foreground">{key}</p><p className={value === "error" ? "text-danger" : "text-success"}>{value}</p></div>)}</div></CardContent></Card>

    <Card><CardHeader><CardTitle>Invite a user</CardTitle></CardHeader><CardContent>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={invite}><div className="flex-1 space-y-1"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><Button className="self-end" disabled={!email}>Create 72-hour invite</Button></form>
      <div className="mt-4 space-y-2">{invitations.filter((item) => !item.accepted_at && !item.revoked_at).map((item) => <div key={item.id} className="flex items-center justify-between rounded border border-border p-2 text-sm"><span>{item.email}</span><Button size="sm" variant="ghost" onClick={() => void revokeAdminInvitation(item.id).then(() => load())}>Revoke</Button></div>)}</div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Users</CardTitle></CardHeader><CardContent>
      <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(search) }}><Input placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /><Button variant="outline">Search</Button></form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Activity</th><th className="p-2">Usage</th><th className="p-2">Actions</th></tr></thead><tbody>{users.map((target) => <tr key={target.id} className="border-t border-border"><td className="p-2"><button className="text-left" onClick={() => void inspect(target.id)}><p className="text-foreground hover:text-primary">{target.name}</p><p className="text-xs text-muted-foreground">{target.email}</p></button></td><td className="p-2">{target.role}{target.banned ? <span className="ml-2 text-danger">banned</span> : null}</td><td className="p-2 text-xs text-muted-foreground">{target.last_active_at ? new Date(target.last_active_at).toLocaleString() : "Never"}<br />{target.session_count} sessions</td><td className="p-2 text-xs">{target.entity_count} entities<br />{target.ai_requests} AI</td><td className="p-2"><div className="flex flex-wrap gap-1">
        {target.role !== "root_admin" ? <Button size="sm" variant="outline" onClick={() => void (target.banned ? unbanAdminUser(target.id) : banAdminUser(target.id, "Administrative action")).then(() => load())}>{target.banned ? "Unban" : "Ban"}</Button> : null}
        {target.role !== "root_admin" || actor?.role === "root_admin" ? <><Button size="sm" variant="ghost" onClick={() => void createAdminPasswordReset(target.id).then((result) => setOneTimeUrl(result.reset_url))}>Reset link</Button><Button size="sm" variant="ghost" onClick={() => void revokeAdminUserSessions(target.id).then(() => load())}>Revoke sessions</Button></> : null}
        {actor?.role === "root_admin" && target.role !== "root_admin" ? <Button size="sm" variant="ghost" onClick={() => void updateAdminUserRole(target.id, target.role === "admin" ? "user" : "admin").then(() => load())}>{target.role === "admin" ? "Demote" : "Promote"}</Button> : null}
        {actor?.role === "root_admin" && target.role !== "root_admin" ? <Button size="sm" variant="ghost" onClick={() => void changeQuota(target)}>Quota</Button> : null}
        {actor?.role === "root_admin" && target.role !== "root_admin" ? <Button size="sm" variant="ghost" className="text-danger" onClick={() => void removeUser(target)}>Delete</Button> : null}
      </div></td></tr>)}</tbody></table></div>
    </CardContent></Card>

    {selected ? <Card><CardHeader><CardTitle>{selected.email}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div><p className="text-xs uppercase text-muted-foreground">Usage</p><p>{selected.usage.entities} entities</p><p>{selected.usage.assistant_messages} assistant messages</p><p>{selected.usage.ai_requests} AI requests</p></div><div><p className="text-xs uppercase text-muted-foreground">Quotas</p><p>{selected.quota.max_entities} entities</p><p>{selected.quota.max_assistant_messages} messages</p><p>{selected.quota.max_ai_requests_per_day} AI/day</p></div><div><p className="text-xs uppercase text-muted-foreground">Sessions/devices</p>{selected.sessions.length ? selected.sessions.map((session) => <p key={session.id} className="truncate text-xs text-secondary">{session.user_agent || "Unknown device"} · {new Date(session.updated_at).toLocaleString()}</p>) : <p className="text-muted-foreground">No active sessions</p>}</div></CardContent></Card> : null}

    <Card><CardHeader><CardTitle>Recent security events</CardTitle></CardHeader><CardContent><div className="space-y-2">{audit.slice(0, 20).map((event) => <div key={event.id} className="flex justify-between gap-3 border-b border-border pb-2 text-xs"><span><span className="text-foreground">{event.action}</span> by {event.actor_email}</span><time className="text-muted-foreground">{new Date(event.created_at).toLocaleString()}</time></div>)}</div></CardContent></Card>
  </div>
}
