import assert from "node:assert/strict"
import test from "node:test"

import { assertSafeRootAdminBootstrap, isReservedRootAdminEmail } from "./security-policy.js"

test("the configured root email is reserved case-insensitively", () => {
  assert.equal(isReservedRootAdminEmail(" Root-Admin@Example.com ", "root-admin@example.com"), true)
  assert.equal(isReservedRootAdminEmail("person@example.com", "root-admin@example.com"), false)
  assert.equal(isReservedRootAdminEmail("root-admin@example.com", null), false)
})

test("bootstrap never promotes a preexisting public account", () => {
  assert.throws(
    () => assertSafeRootAdminBootstrap({ role: "user", emailVerified: false, hasCredential: true }, "root-admin@example.com"),
    /cannot be promoted/,
  )
})

test("bootstrap only resumes an already verified root row without credentials", () => {
  assert.doesNotThrow(() => assertSafeRootAdminBootstrap(null, "root-admin@example.com"))
  assert.doesNotThrow(() => assertSafeRootAdminBootstrap({ role: "root_admin", emailVerified: true, hasCredential: false }, "root-admin@example.com"))
  assert.throws(
    () => assertSafeRootAdminBootstrap({ role: "root_admin", emailVerified: false, hasCredential: false }, "root-admin@example.com"),
    /cannot be promoted/,
  )
  assert.throws(
    () => assertSafeRootAdminBootstrap({ role: "root_admin", emailVerified: true, hasCredential: true }, "root-admin@example.com"),
    /already bootstrapped/,
  )
})
