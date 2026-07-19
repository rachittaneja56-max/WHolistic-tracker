import { spawn } from "node:child_process"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const output = path.resolve(webRoot, "..", "..", "artifacts", "visual-qa")
const targetUrl = process.env.VISUAL_QA_URL || "http://127.0.0.1:5173/"
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
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true })
      this.ws.addEventListener("error", reject, { once: true })
    })
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) return
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

async function waitForPage(cdp) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `({ ready: document.readyState, hero: document.querySelector("h1")?.textContent || "" })`,
      returnByValue: true,
    })
    if (result.result.value?.ready === "complete" && result.result.value?.hero.includes("Learn deeply")) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Landing page did not finish rendering.")
}

const failures = []
try {
  await waitForChrome()
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
      await cdp.send("Page.navigate", { url: targetUrl })
      await waitForPage(cdp)
      await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true })
      await new Promise((resolve) => setTimeout(resolve, 300))

      const audit = await cdp.send("Runtime.evaluate", {
        expression: `(() => ({
          innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          theme: document.documentElement.dataset.theme,
          h1Count: document.querySelectorAll("h1").length,
          hasMain: Boolean(document.querySelector("main")),
          hasSkipLink: Boolean(document.querySelector('a[href="#main-content"]')),
        }))()`,
        returnByValue: true,
      })
      const value = audit.result.value
      if (value.scrollWidth > value.innerWidth + 1) failures.push(`${width}/${theme}: horizontal overflow ${value.scrollWidth}px > ${value.innerWidth}px`)
      if (value.theme !== theme) failures.push(`${width}/${theme}: resolved theme was ${value.theme}`)
      if (value.h1Count !== 1 || !value.hasMain || !value.hasSkipLink) failures.push(`${width}/${theme}: landmark or heading contract failed`)

      const tree = await cdp.send("Accessibility.getFullAXTree")
      const unnamed = tree.nodes.filter((node) => !node.ignored && ["button", "link"].includes(node.role?.value) && !String(node.name?.value || "").trim())
      if (unnamed.length) failures.push(`${width}/${theme}: ${unnamed.length} unnamed button/link accessibility nodes`)

      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true })
      await writeFile(path.join(output, `landing-${width}-${theme}.png`), Buffer.from(screenshot.data, "base64"))
      cdp.close()
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`, { method: "PUT" }).catch(() => undefined)
      process.stdout.write(`checked landing ${width}px ${theme}\n`)
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
