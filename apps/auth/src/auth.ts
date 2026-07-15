import "dotenv/config"

import { betterAuth } from "better-auth"
import { admin, captcha, jwt } from "better-auth/plugins"
import { defaultAc, userAc } from "better-auth/plugins/admin/access"
import { Pool } from "pg"

import { isReservedRootAdminEmail, normalizeEmail } from "./security-policy.js"

const databaseUrl = process.env.AUTH_DATABASE_URL
if (!databaseUrl) throw new Error("AUTH_DATABASE_URL is required")

export const rootAdminEmail = process.env.ROOT_ADMIN_EMAIL ? normalizeEmail(process.env.ROOT_ADMIN_EMAIL) : null
export const authBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3001"
export const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"
export const pool = new Pool({ connectionString: databaseUrl })

const isProduction = process.env.NODE_ENV === "production"
const githubConfigured = Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET)
const requireEmailVerification = isProduction || process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true"
const verificationDeliveryUrl = process.env.AUTH_VERIFICATION_DELIVERY_URL?.trim()
const passwordResetDeliveryUrl =
  process.env.AUTH_PASSWORD_RESET_DELIVERY_URL?.trim() || verificationDeliveryUrl
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY?.trim()
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY?.trim()
const turnstileConfigured = Boolean(turnstileSecretKey && turnstileSiteKey)
if (isProduction && !turnstileConfigured) {
  throw new Error("TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required for public production auth")
}
const turnstileHostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
if (requireEmailVerification && !verificationDeliveryUrl) {
  throw new Error("AUTH_VERIFICATION_DELIVERY_URL is required when email verification is enabled")
}
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
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (isReservedRootAdminEmail(user.email, rootAdminEmail)) return false
        },
        after: async (user) => {
          await pool.query(
            "insert into public.user_quotas (user_id) values ($1) on conflict (user_id) do nothing",
            [user.id],
          )
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    minPasswordLength: 12,
    requireEmailVerification,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    ...(passwordResetDeliveryUrl
      ? {
          sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
            const response = await fetch(passwordResetDeliveryUrl, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(process.env.AUTH_VERIFICATION_DELIVERY_TOKEN
                  ? { authorization: `Bearer ${process.env.AUTH_VERIFICATION_DELIVERY_TOKEN}` }
                  : {}),
              },
              body: JSON.stringify({ template: "reset-password", to: user.email, name: user.name, action_url: url }),
            })
            if (!response.ok) throw new Error(`Password reset delivery failed with status ${response.status}`)
          },
        }
      : {}),
  },
  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendOnSignIn: requireEmailVerification,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
    ...(requireEmailVerification
      ? {
          sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
            const response = await fetch(verificationDeliveryUrl!, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(process.env.AUTH_VERIFICATION_DELIVERY_TOKEN
                  ? { authorization: `Bearer ${process.env.AUTH_VERIFICATION_DELIVERY_TOKEN}` }
                  : {}),
              },
              body: JSON.stringify({ template: "verify-email", to: user.email, name: user.name, action_url: url }),
            })
            if (!response.ok) throw new Error(`Verification delivery failed with status ${response.status}`)
          },
        }
      : {}),
  },
  socialProviders: githubConfigured
    ? {
        github: {
          clientId: process.env.GITHUB_OAUTH_CLIENT_ID!,
          clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
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
      "/sign-up/email": { window: 60 * 5, max: 3 },
      "/request-password-reset": { window: 60 * 5, max: 3 },
      "/reset-password": { window: 60 * 5, max: 5 },
      "/send-verification-email": { window: 60 * 5, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    database: { generateId: "uuid" },
    cookiePrefix: "pdkg",
  },
  plugins: [
    ...(turnstileConfigured
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: turnstileSecretKey!,
            endpoints: ["/sign-up/email", "/sign-in/email", "/request-password-reset"],
            ...(turnstileHostnames.length ? { allowedHostnames: turnstileHostnames } : {}),
          }),
        ]
      : []),
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

export const authConfig = {
  githubEnabled: githubConfigured,
  passwordMinLength: 12,
  emailVerificationRequired: requireEmailVerification,
  passwordResetEnabled: Boolean(passwordResetDeliveryUrl),
  turnstileEnabled: turnstileConfigured,
  turnstileSiteKey: turnstileConfigured ? turnstileSiteKey : undefined,
}
