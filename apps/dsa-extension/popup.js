const $ = (id) => document.getElementById(id)
const sections = ["pairing", "offsite", "logged-out", "problem", "importer"]
let activeTab = null
let page = null

function show(...ids) {
  sections.forEach((id) => $(id).classList.toggle("hidden", !ids.includes(id)))
}

function notice(message, success = false) {
  $("notice").textContent = message
  $("notice").className = message ? `notice${success ? " success" : ""}` : "notice hidden"
}

async function message(payload) {
  return chrome.runtime.sendMessage(payload)
}

function renderProgress(state = {}) {
  const total = state.total || 0
  const done = state.processed || 0
  $("progress").max = Math.max(total, 1)
  $("progress").value = done
  $("progress-label").textContent = total ? `${done} / ${total} · ${state.status || "idle"}` : state.status || ""
  $("pause").disabled = state.status !== "running"
  $("resume").disabled = state.status !== "paused"
  $("cancel").disabled = !["running", "paused"].includes(state.status)
}

async function refresh() {
  const state = await chrome.storage.local.get(["extensionToken", "apiOrigin", "importCheckpoint"])
  $("api-origin").value = state.apiOrigin || "http://localhost:8000"
  if (!state.extensionToken) return show("pairing")
  ;[activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!activeTab?.url?.startsWith("https://leetcode.com/")) return show("offsite")
  const result = await message({ type: "PAGE_STATE", tabId: activeTab.id, url: activeTab.url })
  if (!result?.ok) {
    notice(result?.error || "Unable to inspect this LeetCode tab.")
    return show("offsite")
  }
  page = result.data
  if (!page.loggedIn) return show("logged-out")
  renderProgress(state.importCheckpoint)
  if (page.problem) {
    $("title").textContent = page.problem.title
    $("difficulty").textContent = page.problem.difficulty || "unknown"
    $("tracker-status").textContent = page.problem.accepted ? "Solved" : "Not solved"
    show("problem", "importer")
  } else {
    show("importer")
  }
}

$("pair").addEventListener("click", async () => {
  notice("")
  const response = await message({ type: "PAIR", code: $("pair-code").value, apiOrigin: $("api-origin").value })
  if (!response?.ok) return notice(response?.error || "Pairing failed.")
  notice("Extension paired.", true)
  await refresh()
})
$("open-leetcode").addEventListener("click", () => chrome.tabs.create({ url: "https://leetcode.com/problemset/" }))
$("login").addEventListener("click", () => chrome.tabs.create({ url: "https://leetcode.com/accounts/login/" }))
$("capture").addEventListener("click", async () => {
  $("capture").disabled = true
  notice("Capturing accepted code and note…")
  const response = await message({
    type: "CAPTURE",
    tabId: activeTab.id,
    slug: page.problem.slug,
    trackerNotes: $("tracker-note").value,
    trackerTags: $("tracker-tags").value.split(",").map((item) => item.trim()).filter(Boolean),
  })
  $("capture").disabled = false
  notice(response?.ok ? "Problem saved to your tracker." : response?.error || "Capture failed.", Boolean(response?.ok))
})
$("import-all").addEventListener("click", async () => {
  notice("Historical import started. You can reopen this popup to check progress.")
  const response = await message({ type: "START_IMPORT", tabId: activeTab.id })
  if (!response?.ok) notice(response?.error || "Unable to start import.")
})
$("pause").addEventListener("click", () => message({ type: "PAUSE_IMPORT" }))
$("resume").addEventListener("click", () => message({ type: "RESUME_IMPORT", tabId: activeTab.id }))
$("cancel").addEventListener("click", () => message({ type: "CANCEL_IMPORT" }))
chrome.storage.onChanged.addListener((changes) => {
  if (changes.importCheckpoint) renderProgress(changes.importCheckpoint.newValue)
})
refresh().catch((error) => notice(error.message || "Extension failed to load."))
