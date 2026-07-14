import "dotenv/config"

import { betterAuth } from "better-auth"
import { admin, jwt } from "better-auth/plugins"
import { defaultAc, userAc } from "better-auth/plugins/admin/access"
import { Pool } from "pg"

const databaseUrl = process.env.AUTH_DATABASE_URL
if (!databaseUrl) throw new Error("AUTH_DATABASE_URL is required")

export const ROOT_ADMIN_EMAIL = "rachittaneja56@gmail.com"
export const authBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3001"
export const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"
export const pool = new Pool({ connectionString: databaseUrl })

const githubConfigured = Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET)
const operationalAdmin = defaultAc.newRole({
  user: ["list", "get"],
  session: ["list"],
})

export const auth = betterAuth({
  appName: "Personal Dev KG",
  baseURL: authBaseUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [frontendOrigin],
  database: pool,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    revokeSessionsOnPasswordReset: true,
  },
  socialProviders: githubConfigured
    ? {
        github: {
          clientId: process.env.GITHUB_OAUTH_CLIENT_ID!,
          clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
          disableSignUp: true,
        },
      }
    : {},
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      requireLocalEmailVerified: true,
      trustedProviders: ["github"],
      allowDifferentEmails: false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    disableCSRFCheck: false,
    disableOriginCheck: false,
    database: { generateId: "uuid" },
    cookiePrefix: "pdkg",
  },
  plugins: [
    admin({
      adminRoles: ["admin", "root_admin"],
      roles: { user: userAc, admin: operationalAdmin, root_admin: operationalAdmin },
    }),
    jwt({
      jwt: {
        issuer: authBaseUrl,
        audience: process.env.AUTH_JWT_AUDIENCE ?? "personal-dev-kg-api",
        expirationTime: "15m",
        definePayload: ({ user, session }) => ({
          userId: user.id,
          sessionId: session.id,
          email: user.email,
          role: (user as typeof user & { role?: string }).role ?? "user",
        }),
      },
      jwks: {
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 30,
      },
    }),
  ],
})

export const authConfig = { githubEnabled: githubConfigured }
