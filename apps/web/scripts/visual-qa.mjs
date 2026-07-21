import { spawn } from "node:child_process"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const output = path.resolve(webRoot, "..", "..", "artifacts", "visual-qa")
const authenticatedVisual = process.env.VISUAL_QA_AUTHENTICATED === "1"
const baseUrl = process.env.VISUAL_QA_URL || "http://127.0.0.1:5173/"
const pages = authenticatedVisual
  ? [
      { path: "/app", name: "authenticated-today", heading: "Your complete workload", checkCaptureTransition: true },
      { path: "/capture", name: "authenticated-capture", heading: "What are you working on?" },
      { path: "/knowledge/entities", name: "authenticated-search", heading: "Find what you learned" },
      { path: "/knowledge/graph", name: "authenticated-graph", heading: "Knowledge graph" },
    ].map((page) => ({ ...page, url: new URL(page.path, baseUrl).toString() }))
  : [{ name: "landing", heading: "Learn deeply", url: baseUrl }]
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean)

let chromePath = null
for (const candidate of candidates) {
  try {
    await access(candidate)
    chromePath = candidate
    break
  } catch {
    // Try the next known Chrome location.
  }
}
if (!chromePath) throw new Error("Chrome was not found. Set CHROME_PATH to run visual QA.")

const port = 9300 + Math.floor(Math.random() * 500)
const profile = await mkdtemp(path.join(os.tmpdir(), "pdkg-visual-qa-"))
await mkdir(output, { recursive: true })

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" })

async function waitForChrome() {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Chrome DevTools did not become ready.")
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.events = []
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true })
      this.ws.addEventListener("error", reject, { once: true })
    })
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) { this.events.push(message); return }
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.ws.close()
  }
}

async function waitForPage(cdp, currentPage) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `({ ready: document.readyState, hero: document.querySelector("h1")?.textContent || "", body: document.body.innerText || "" })`,
      returnByValue: true,
    })
    if (result.result.value?.ready === "complete" && (result.result.value?.hero.includes(currentPage.heading) || result.result.value?.body.includes(currentPage.heading))) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const snapshot = await cdp.send("Runtime.evaluate", { expression: '({ href: location.href, heading: document.querySelector("h1")?.textContent || "", body: document.body.innerText.slice(0, 1200) })', returnByValue: true })
  throw new Error(`${currentPage.name} page did not finish rendering: ${JSON.stringify({ snapshot: snapshot.result.value, events: cdp.events.filter((event) => event.method === "Runtime.exceptionThrown" || event.method === "Runtime.consoleAPICalled").slice(-8) })}`)
}

async function waitForText(cdp, text) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true })
    if (String(result.result.value || "").includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Route did not render ${text}.`)
}

const failures = []
try {
  await waitForChrome()
  for (const currentPage of pages) {
    for (const width of [375, 768, 1440]) {
    for (const theme of ["light", "dark"]) {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
      if (!response.ok) throw new Error("Unable to create a Chrome target.")
      const target = await response.json()
      const cdp = new Cdp(target.webSocketDebuggerUrl)
      await cdp.open()
      await cdp.send("Page.enable")
      await cdp.send("Runtime.enable")
      await cdp.send("Accessibility.enable")
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: width < 768,
      })
      await cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [
          { name: "prefers-color-scheme", value: theme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      })
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `try { localStorage.setItem("pdkg:theme", "${theme}") } catch {}`,
      })
      if (authenticatedVisual) {
        await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const agenda = { start_date: "2026-07-20", end_date: "2026-07-20", generated_at: "2026-07-20T00:00:00Z", recommended: null, overdue: { total: 0, items: [] }, today: { total: 0, items: [] }, upcoming: { total: 0, items: [] }, unscheduled: { total: 0, items: [] }, recall: { total: 0, items: [] }, comprehension: { total: 0, items: [] }, totals: { total_items: 0, overdue_items: 0, planned_minutes: 0 }, capacity: { available_minutes: 120, scheduled_minutes: 0, remaining_minutes: 120, is_over_capacity: false }, balance: { coursework_items: 0, project_items: 0, dsa_items: 0, weekly_target_minutes: {} }, suggested_focus_minutes: 25 }; const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }); const originalFetch = window.fetch.bind(window); window.fetch = async (input, init) => { const url = input instanceof Request ? input.url : String(input); if (url.includes(":3001/api/auth/get-session")) return json({ user: { id: "visual-user", name: "Visual student", email: "visual@example.test", role: "user" }, session: { id: "visual-session" } }); if (url.includes(":3001/api/auth/token")) return json({ token: "visual.token.signature" }); if (url.includes(":8000/settings/preferences")) return json({ theme: "system", onboarding_completed: true, learning_focuses: [], hidden_modules: [], typical_study_minutes: 90, preferred_focus_minutes: 45, max_daily_workload_minutes: 240, active_semester: null, library_saved_views: [], library_pinned_entity_ids: [] }); if (url.includes(":8000/settings/status")) return json({ ai: { enabled: false, provider: "openai", model_mode: "auto", openai_configured: false, providers: {}, provider_ready: false, fast_model: "", smart_model: "", disabled_reason: null }, github: { enabled: false, webhook_secret_configured: false, access_token_configured: false, ready: false, disabled_reason: null, webhook_url: "", webhook_events: [] }, web_search: { enabled: false, provider: null, api_key_configured: false }, ai_egress: { provider: "openai", destination: "", data_categories: [], ai_exclude_supported: true, review_before_write: true } }); if (url.includes(":8000/entities/search")) return json({ results: [], total: 0, next_cursor: null }); if (url.includes(":8000/graph")) return json({ nodes: [], edges: [], total_nodes: 0, truncated: false }); if (url.includes(":8000/entities")) return json([]); if (url.includes(":8000/dashboard/agenda")) return json(agenda); if (url.includes(":8000/")) return json({}); return originalFetch(input, init); }; })()` })
      }
      const initialStart = performance.now()
      await cdp.send("Page.navigate", { url: currentPage.url })
      await waitForPage(cdp, currentPage)
      const initialRenderMs = performance.now() - initialStart
      await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true })
      await new Promise((resolve) => setTimeout(resolve, 300))

      const audit = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const rootStyle = getComputedStyle(document.documentElement)
          const rgb = (token) => rootStyle.getPropertyValue(token).trim().split(/\s+/).map(Number)
          const luminance = ([red, green, blue]) => [red, green, blue]
            .map((channel) => channel / 255)
            .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
          const contrast = (foreground, background) => {
            const [light, dark] = [luminance(foreground), luminance(background)].sort((first, second) => second - first)
            return (light + 0.05) / (dark + 0.05)
          }
          const contrastPairs = [
            ["--text", "--canvas", "primary text"],
            ["--text-secondary", "--canvas", "secondary text"],
            ["--text-muted", "--canvas", "muted text"],
            ["--primary-foreground", "--primary", "primary button text"],
            ["--success-foreground", "--canvas", "success text"],
            ["--warning-foreground", "--canvas", "warning text"],
            ["--danger-foreground", "--canvas", "danger text"],
          ].map(([foreground, background, label]) => ({ label, ratio: contrast(rgb(foreground), rgb(background)) }))
          return {
            innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            theme: document.documentElement.dataset.theme,
            h1Count: document.querySelectorAll("h1").length,
            hasMain: Boolean(document.querySelector("main")),
            hasSkipLink: Boolean(document.querySelector('a[href="#main-content"]')),
            contrastFailures: contrastPairs.filter((pair) => pair.ratio < 4.5),
          }
        })()`,
        returnByValue: true,
      })
      const value = audit.result.value
      if (value.scrollWidth > value.innerWidth + 1) failures.push(`${width}/${theme}: horizontal overflow ${value.scrollWidth}px > ${value.innerWidth}px`)
      if (value.theme !== theme) failures.push(`${width}/${theme}: resolved theme was ${value.theme}`)
      if (value.h1Count !== 1 || !value.hasMain || !value.hasSkipLink) failures.push(`${width}/${theme}: landmark or heading contract failed`)
      if (value.contrastFailures.length) failures.push(`${width}/${theme}: insufficient text contrast (${value.contrastFailures.map((pair) => `${pair.label} ${pair.ratio.toFixed(2)}:1`).join(", ")})`)

      const tree = await cdp.send("Accessibility.getFullAXTree")
      const unnamed = tree.nodes.filter((node) => !node.ignored && ["button", "link"].includes(node.role?.value) && !String(node.name?.value || "").trim())
      if (unnamed.length) failures.push(`${width}/${theme}: ${unnamed.length} unnamed button/link accessibility nodes`)

      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })
      let captureTransitionMs = null
      if (currentPage.checkCaptureTransition) {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "k", code: "KeyK", modifiers: 2 })
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "k", code: "KeyK", modifiers: 2 })
        await waitForText(cdp, "Command palette")
        const palette = await cdp.send("Runtime.evaluate", { expression: '(() => { const dialog = document.querySelector("[role=dialog]"); return { open: Boolean(dialog), inputFocused: Boolean(dialog?.querySelector("input") === document.activeElement) } })()', returnByValue: true })
        if (!palette.result.value?.open || !palette.result.value?.inputFocused) failures.push(`${currentPage.name} ${width}/${theme}: command palette keyboard focus check failed`)
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" })
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" })
        await new Promise((resolve) => setTimeout(resolve, 30))
        const paletteClosed = await cdp.send("Runtime.evaluate", { expression: 'Boolean(document.querySelector("[role=dialog]"))', returnByValue: true })
        if (paletteClosed.result.value) failures.push(`${currentPage.name} ${width}/${theme}: command palette did not close with Escape`)
        const transitionStart = performance.now()
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "C", code: "KeyC", modifiers: 10 })
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "C", code: "KeyC", modifiers: 10 })
        await waitForText(cdp, "What are you working on?")
        captureTransitionMs = performance.now() - transitionStart
      }
      await writeFile(path.join(output, `${currentPage.name}-${width}-${theme}.png`), Buffer.from(screenshot.data, "base64"))
      cdp.close()
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`, { method: "PUT" }).catch(() => undefined)
      process.stdout.write(`checked ${currentPage.name} ${width}px ${theme} - initial ${initialRenderMs.toFixed(0)}ms${captureTransitionMs === null ? "" : `, capture transition ${captureTransitionMs.toFixed(0)}ms`}\n`)
    }
  }
  }
} finally {
  chrome.kill()
  await rm(profile, { recursive: true, force: true }).catch(() => undefined)
}

if (failures.length) {
  throw new Error(`Visual QA failed:\n- ${failures.join("\n- ")}`)
}
process.stdout.write(`Visual QA passed; screenshots are in ${output}\n`)
