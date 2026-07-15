export type RootAdminBootstrapCandidate = {
  role: unknown
  emailVerified: unknown
  hasCredential: boolean
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isReservedRootAdminEmail(email: unknown, rootAdminEmail: string | null): boolean {
  return typeof email === "string" && Boolean(rootAdminEmail) && normalizeEmail(email) === rootAdminEmail
}

export function assertSafeRootAdminBootstrap(
  candidate: RootAdminBootstrapCandidate | null,
  rootAdminEmail: string,
): void {
  if (!candidate) return
  if (candidate.role !== "root_admin" || candidate.emailVerified !== true) {
    throw new Error(`${rootAdminEmail} is already registered and cannot be promoted by bootstrap`)
  }
  if (candidate.hasCredential) throw new Error(`${rootAdminEmail} is already bootstrapped`)
}
