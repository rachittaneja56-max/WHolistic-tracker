import "dotenv/config"

import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { randomUUID } from "node:crypto"
import { hashPassword } from "better-auth/crypto"

import { pool, ROOT_ADMIN_EMAIL } from "./auth.js"

const terminal = createInterface({ input, output })

try {
  const existing = await pool.query('select id, email, role from "user" where lower(email) = lower($1)', [ROOT_ADMIN_EMAIL])
  if (existing.rowCount && (await pool.query('select 1 from account where "userId" = $1 and "providerId" = $2', [existing.rows[0].id, "credential"])).rowCount) throw new Error(`${ROOT_ADMIN_EMAIL} is already bootstrapped`)
  const name = (await terminal.question("Root admin display name: ")).trim()
  const password = await terminal.question("Root admin password (8+ characters): ")
  const confirmation = await terminal.question("Confirm password: ")
  if (!name) throw new Error("A display name is required")
  if (password.length < 8) throw new Error("Password must contain at least 8 characters")
  if (password !== confirmation) throw new Error("Passwords do not match")

  const client = await pool.connect()
  try {
    await client.query("begin")
    const userId = existing.rows[0]?.id ?? randomUUID()
    const now = new Date()
    if (!existing.rowCount) {
      await client.query('insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, banned) values ($1, $2, $3, true, $4, $4, $5, false)', [userId, name, ROOT_ADMIN_EMAIL, now, "root_admin"])
    } else if (existing.rows[0].role !== "root_admin") {
      await client.query('update "user" set name = $1, role = $2, "updatedAt" = $3 where id = $4', [name, "root_admin", now, userId])
    } else if (existing.rows[0].role === "root_admin") {
      await client.query('update "user" set name = $1, "updatedAt" = $2 where id = $3', [name, now, userId])
    }
    const passwordHash = await hashPassword(password)
    await client.query('insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, $6, $6)', [randomUUID(), userId, "credential", userId, passwordHash, now])
    await client.query("insert into public.user_quotas (user_id) values ($1) on conflict (user_id) do nothing", [userId])
    await client.query("commit")
    console.log(`Created root admin ${ROOT_ADMIN_EMAIL} (${userId})`)
  } catch (error) { await client.query("rollback"); throw error }
  finally { client.release() }
} finally {
  terminal.close()
  await pool.end()
}
