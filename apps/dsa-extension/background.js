const USER_QUERY = `query globalData { userStatus { isSignedIn } }`
const QUESTION_QUERY = `query question($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId questionFrontendId title titleSlug difficulty status
    topicTags { name }
  }
}`
const LIST_QUERY = `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total: totalNum
    questions: data { questionFrontendId title titleSlug difficulty status topicTags { name } }
  }
}`
const SUBMISSIONS_QUERY = `query submissions($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
  submissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
    submissions { id statusDisplay lang timestamp }
  }
}`
const SUBMISSION_QUERY = `query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) { code lang timestamp }
}`
const NOTE_QUERY = `query questionNote($titleSlug: String!) { questionNote(titleSlug: $titleSlug) { note } }`

let importJob = null
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function storage() {
  return chrome.storage.local.get(["extensionToken", "apiOrigin", "importCheckpoint", "importControl"])
}

async function api(path, options = {}, retry = 0) {
  const state = await storage()
  const response = await fetch(`${(state.apiOrigin || "http://localhost:8000").replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.extensionToken ? { Authorization: `Bearer ${state.extensionToken}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (response.status === 429 && retry < 5) {
    await delay(Math.min(30000, 750 * 2 ** retry) + Math.random() * 500)
    return api(path, options, retry + 1)
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : "Personal Dev KG rejected the request.")
  return payload
}

async function graphql(tabId, query, variables = {}, retry = 0) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (queryText, queryVariables) => {
      const response = await fetch("/graphql/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, variables: queryVariables }),
      })
      const payload = await response.json().catch(() => ({}))
      return { status: response.status, data: payload.data || null, error: payload.errors?.[0]?.message || null }
    },
    args: [query, variables],
  })
  if (result?.status === 429 && retry < 5) {
    await delay(Math.min(30000, 800 * 2 ** retry) + Math.random() * 700)
    return graphql(tabId, query, variables, retry + 1)
  }
  if (!result || result.status >= 400 || result.error) throw new Error(result?.error || "LeetCode request failed.")
  return result.data || {}
}

function isoTimestamp(value) {
  if (!value) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? new Date(numeric * 1000).toISOString() : new Date(value).toISOString()
}

async function pageState(tabId, url) {
  const user = await graphql(tabId, USER_QUERY)
  const loggedIn = Boolean(user.userStatus?.isSignedIn)
  const slug = new URL(url).pathname.match(/^\/problems\/([^/]+)/)?.[1] || null
  if (!slug) return { loggedIn, problem: null }
  const question = (await graphql(tabId, QUESTION_QUERY, { titleSlug: slug })).question
  return {
    loggedIn,
    problem: question ? {
      slug,
      title: question.title,
      difficulty: question.difficulty?.toLowerCase() || null,
      accepted: question.status === "ac",
    } : null,
  }
}

async function normalizedProblem(tabId, slug) {
  const question = (await graphql(tabId, QUESTION_QUERY, { titleSlug: slug })).question
  if (!question) throw new Error("LeetCode problem was not found.")
  let latest = null
  let solutionCode = null
  let language = null
  let sourceNotes = null
  try {
    const submissions = (await graphql(tabId, SUBMISSIONS_QUERY, { offset: 0, limit: 20, lastKey: null, questionSlug: slug })).submissionList?.submissions || []
    latest = submissions.find((item) => item.statusDisplay === "Accepted") || null
    if (latest?.id) {
      const details = (await graphql(tabId, SUBMISSION_QUERY, { submissionId: Number(latest.id) })).submissionDetails
      solutionCode = details?.code || null
      language = details?.lang || latest.lang || null
    }
  } catch {
    // Code is optional. Continue with metadata and note.
  }
  try {
    const note = (await graphql(tabId, NOTE_QUERY, { titleSlug: slug })).questionNote
    sourceNotes = typeof note === "string" ? note : note?.note || null
  } catch {
    // Notes are optional and independent from accepted-code capture.
  }
  const submittedAt = isoTimestamp(latest?.timestamp)
  return {
    platform: "leetcode",
    external_problem_id: slug,
    title: question.title,
    url: `https://leetcode.com/problems/${slug}/`,
    difficulty: question.difficulty?.toLowerCase() || null,
    tags: (question.topicTags || []).map((tag) => tag.name).filter(Boolean),
    accepted: question.status === "ac" || Boolean(latest),
    language,
    solution_code: solutionCode,
    source_notes: sourceNotes,
    first_solved_at: submittedAt,
    last_submitted_at: submittedAt,
    source_updated_at: submittedAt,
  }
}

async function listSolved(tabId) {
  const slugs = []
  let skip = 0
  let total = null
  while (total === null || skip < total) {
    const page = (await graphql(tabId, LIST_QUERY, {
      categorySlug: "",
      limit: 100,
      skip,
      filters: { status: "AC" },
    })).problemsetQuestionList || {}
    const questions = page.questions || []
    total = Number(page.total || 0)
    slugs.push(...questions.map((item) => item.titleSlug).filter(Boolean))
    if (!questions.length || questions.length < 100) break
    skip += questions.length
  }
  return [...new Set(slugs)]
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = await mapper(items[index])
      } catch {
        results[index] = null
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

async function runImport(tabId, resume = false) {
  if (importJob) return
  importJob = (async () => {
    const state = await storage()
    let checkpoint = resume ? state.importCheckpoint : null
    if (!checkpoint?.slugs?.length) {
      const slugs = await listSolved(tabId)
      checkpoint = { status: "running", slugs, total: slugs.length, processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 }
    } else {
      checkpoint = { ...checkpoint, status: "running" }
    }
    await chrome.storage.local.set({ importCheckpoint: checkpoint, importControl: "running" })
    while (checkpoint.processed < checkpoint.total) {
      const control = (await chrome.storage.local.get("importControl")).importControl
      if (control === "cancelled") {
        checkpoint.status = "cancelled"
        break
      }
      if (control === "paused") {
        checkpoint.status = "paused"
        break
      }
      const batchSlugs = checkpoint.slugs.slice(checkpoint.processed, checkpoint.processed + 20)
      const records = (await mapWithConcurrency(batchSlugs, 2, (slug) => normalizedProblem(tabId, slug))).filter(Boolean)
      let result = { imported: 0, updated: 0, skipped: 0, failed: batchSlugs.length - records.length }
      if (records.length) {
        try {
          const response = await api("/integrations/dsa/extension/import-batches", { method: "POST", body: JSON.stringify({ records }) })
          result = { ...result, ...response }
        } catch {
          result.failed += records.length
        }
      }
      checkpoint = {
        ...checkpoint,
        processed: checkpoint.processed + batchSlugs.length,
        imported: checkpoint.imported + result.imported,
        updated: checkpoint.updated + result.updated,
        skipped: checkpoint.skipped + result.skipped,
        failed: checkpoint.failed + result.failed,
      }
      await chrome.storage.local.set({ importCheckpoint: checkpoint })
    }
    if (checkpoint.processed >= checkpoint.total) checkpoint.status = "complete"
    await chrome.storage.local.set({ importCheckpoint: checkpoint, importControl: checkpoint.status })
  })().catch(async () => {
    const current = (await chrome.storage.local.get("importCheckpoint")).importCheckpoint || {}
    await chrome.storage.local.set({ importCheckpoint: { ...current, status: "failed" }, importControl: "failed" })
  }).finally(() => { importJob = null })
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  ;(async () => {
    if (request.type === "PAIR") {
      const origin = String(request.apiOrigin || "http://localhost:8000").replace(/\/$/, "")
      await chrome.storage.local.set({ apiOrigin: origin })
      const result = await api("/integrations/dsa/extension/exchange", {
        method: "POST",
        body: JSON.stringify({ code: String(request.code || "").trim().toUpperCase(), extension_name: "Chrome / Edge" }),
      })
      await chrome.storage.local.set({ extensionToken: result.token })
      return { ok: true }
    }
    if (request.type === "PAGE_STATE") return { ok: true, data: await pageState(request.tabId, request.url) }
    if (request.type === "CAPTURE") {
      const record = await normalizedProblem(request.tabId, request.slug)
      if (String(request.trackerNotes || "").trim()) record.tracker_notes = request.trackerNotes
      if (request.trackerTags?.length) record.tracker_tags = request.trackerTags
      return { ok: true, data: await api("/integrations/dsa/extension/import-batches", { method: "POST", body: JSON.stringify({ records: [record] }) }) }
    }
    if (request.type === "START_IMPORT") {
      void runImport(request.tabId, false)
      return { ok: true }
    }
    if (request.type === "PAUSE_IMPORT") {
      await chrome.storage.local.set({ importControl: "paused" })
      return { ok: true }
    }
    if (request.type === "RESUME_IMPORT") {
      await chrome.storage.local.set({ importControl: "running" })
      void runImport(request.tabId, true)
      return { ok: true }
    }
    if (request.type === "CANCEL_IMPORT") {
      await chrome.storage.local.set({ importControl: "cancelled" })
      return { ok: true }
    }
    return { ok: false, error: "Unknown extension action." }
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || "Something went wrong." }))
  return true
})
