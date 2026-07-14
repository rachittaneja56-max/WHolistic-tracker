const PUBLIC_AUTH_PATHS = new Set(["/", "/login", "/signup", "/invite", "/reset-password"])
const LOCAL_ORIGIN = "http://personal-dev-kg.local"

export function buildLoginUrl(pathname: string, search = "", hash = "") {
  return `/login?returnTo=${encodeURIComponent(`${pathname}${search}${hash}`)}`
}

export function buildSignupUrl(pathname: string, search = "", hash = "") {
  return `/signup?returnTo=${encodeURIComponent(`${pathname}${search}${hash}`)}`
}

export function getSafeReturnTo(value: string | null | undefined, fallback = "/app") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback

  try {
    const target = new URL(value, LOCAL_ORIGIN)
    if (target.origin !== LOCAL_ORIGIN || PUBLIC_AUTH_PATHS.has(target.pathname)) return fallback

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}
