import "dotenv/config"

import { createHash, randomUUID } from "node:crypto"
import cors from "cors"
import express from "express"
import { toNodeHandler } from "better-auth/node"
import { hashPassword } from "better-auth/crypto"

import { auth, authConfig, frontendOrigin, pool } from "./auth.js"

const app = express()
const port = Number(process.env.AUTH_PORT ?? 3001)

app.use(cors({ origin: frontendOrigin, credentials: true, exposedHeaders: ["set-auth-jwt"] }))
app.get("/health", async (_request, response) => {
  await pool.query("select 1")
  response.json({ status: "ok", database: "ok" })
})
app.get("/api/auth/config", (_request, response) => response.json(authConfig))
app.get("/api/invitations/:token", async (request, response) => {
  const tokenHash = createHash("sha256").update(request.params.token).digest("hex")
  const result = await pool.query(
    "select email, role, expires_at from public.invitations where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now()",
    [tokenHash],
  )
  if (!result.rowCount) return response.status(404).json({ detail: "Invitation is invalid or expired" })
  return response.json(result.rows[0])
})
app.post("/api/invitations/accept", express.json(), async (request, response) => {
  const { token, name, password } = request.body as { token?: string; name?: string; password?: string }
  if (!token || !name?.trim() || !password || password.length < 8) {
    return response.status(400).json({ detail: "Token, name, and an 8-character password are required" })
  }
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const client = await pool.connect()
  try {
    await client.query("begin")
    const invitation = await client.query(
      "select id, email, role from public.invitations where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now() for update",
      [tokenHash],
    )
    if (!invitation.rowCount) {
      await client.query("rollback")
      return response.status(404).json({ detail: "Invitation is invalid or expired" })
    }
    const row = invitation.rows[0] as { id: string; email: string; role: "user" | "admin" }
    const userId = randomUUID()
    const now = new Date()
    const passwordHash = await hashPassword(password)
    await client.query('insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned) values ($1, $2, $3, true, $4, $4, $5, false)', [userId, name.trim(), row.email, now, row.role])
    await client.query('insert into auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, $6)', [randomUUID(), userId, "credential", userId, passwordHash, now])
    await client.query("insert into public.user_quotas (user_id) values ($1) on conflict (user_id) do nothing", [userId])
    await client.query("update public.invitations set accepted_at = now() where id = $1", [row.id])
    await client.query("commit")
    return response.status(201).json({ email: row.email, created: true })
  } catch (error) {
    await client.query("rollback")
    console.error(error)
    return response.status(409).json({ detail: "Unable to accept invitation" })
  } finally {
    client.release()
  }
})
app.get("/api/password-resets/:token", async (request, response) => {
  const tokenHash = createHash("sha256").update(request.params.token).digest("hex")
  const result = await pool.query('select r.expires_at, u.email from public.password_reset_tokens r join auth."user" u on u.id = r.user_id where r.token_hash = $1 and r.used_at is null and r.expires_at > now()', [tokenHash])
  if (!result.rowCount) return response.status(404).json({ detail: "Password reset link is invalid or expired" })
  const email = String(result.rows[0].email)
  return response.json({ email: email.replace(/(^.).*(@.*$)/, "$1***$2"), expires_at: result.rows[0].expires_at })
})
app.post("/api/password-resets/accept", express.json(), async (request, response) => {
  const { token, password } = request.body as { token?: string; password?: string }
  if (!token || !password || password.length < 8) return response.status(400).json({ detail: "Token and an 8-character password are required" })
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const client = await pool.connect()
  try {
    await client.query("begin")
    const reset = await client.query("select id, user_id from public.password_reset_tokens where token_hash = $1 and used_at is null and expires_at > now() for update", [tokenHash])
    if (!reset.rowCount) { await client.query("rollback"); return response.status(404).json({ detail: "Password reset link is invalid or expired" }) }
    const passwordHash = await hashPassword(password)
    await client.query('update auth.account set password = $1, "updatedAt" = now() where "userId" = $2 and "providerId" = $3', [passwordHash, reset.rows[0].user_id, "credential"])
    await client.query("update public.password_reset_tokens set used_at = now() where id = $1", [reset.rows[0].id])
    await client.query('delete from auth."session" where "userId" = $1', [reset.rows[0].user_id])
    await client.query("commit")
    return response.json({ reset: true })
  } catch (error) { await client.query("rollback"); console.error(error); return response.status(409).json({ detail: "Unable to reset password" }) }
  finally { client.release() }
})
app.all("/api/auth/{*any}", toNodeHandler(auth))

app.listen(port, () => {
  console.log(`Personal Dev KG auth service listening on ${port}`)
})
