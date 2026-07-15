import { useEffect, useId, useRef } from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pdkg-turnstile="true"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Unable to load the security challenge")), { once: true })
      return
    }
    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.defer = true
    script.dataset.pdkgTurnstile = "true"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Unable to load the security challenge"))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function TurnstileChallenge({ enabled, siteKey, onToken }: { enabled: boolean; siteKey?: string; onToken: (token: string) => void }) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled || !siteKey || !container.current) {
      onToken("")
      return
    }
    let disposed = false
    let widgetId: string | null = null
    void loadTurnstile().then(() => {
      if (disposed || !container.current || !window.turnstile) return
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      })
    }).catch(() => onToken(""))
    return () => {
      disposed = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [enabled, onToken, siteKey])

  if (!enabled) return null
  return <div className="min-h-[65px]" aria-label="Security challenge"><div id={id} ref={container} /></div>
}
