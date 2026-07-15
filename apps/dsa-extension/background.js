importScripts('leetcode-client.js', 'job-state.js')

const LC = globalThis.PdkgLeetCode
const JobState = globalThis.PdkgImportJobState
const JOB_KEY = 'importJobV2'
const JOB_VERSION = 2
const JOB_ALARM = 'pdkg-import-next-batch'
const DEFAULT_API_ORIGIN = 'http://localhost:8000'
const BATCH_SIZE = 10
const LEASE_MS = 120_000
const ACTIVE_JOB_STATUSES = new Set(['discovering', 'running'])

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const nowIso = () => new Date().toISOString()

function safeError(error, fallback = {}) {
  if (error && error.details) return LC.errorDetails(error, fallback)
  return LC.diagnostic({
    operation: fallback.operation || 'extension',
    stage: fallback.stage || 'extension',
    code: fallback.code || 'unexpected_error',
    retryable: Boolean(fallback.retryable),
    message: error && error.message ? error.message : fallback.message || 'The extension could not complete this action.',
  })
}

async function rememberError(error, fallback) {
  const details = safeError(error, fallback)
  await chrome.storage.local.set({ latestSafeError: details })
  return details
}

function releaseApiOrigin() {
  const permissions = chrome.runtime.getManifest().host_permissions || []
  const permission = permissions.find((value) => value.startsWith('https://') && !value.includes('leetcode.com'))
  if (!permission) return null
  try {
    return new URL(permission.replace(/\*$/, '')).origin
  } catch {
    return null
  }
}

function configuredOrigin(state = {}) {
  return releaseApiOrigin() || String(state.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, '')
}

function validateDevelopmentOrigin(rawValue) {
  const value = String(rawValue || DEFAULT_API_ORIGIN).trim().replace(/\/$/, '')
  const parsed = new URL(value)
  const local = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !local) throw new Error('Use HTTPS for a remote API origin.')
  return parsed.origin
}

async function state() {
  return chrome.storage.local.get([
    'extensionToken',
    'apiOrigin',
    JOB_KEY,
    'latestSafeError',
  ])
}

async function api(path, options = {}, retry = 0) {
  const current = await state()
  const origin = configuredOrigin(current)
  let response
  try {
    response = await fetch(`${origin}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(current.extensionToken ? { Authorization: `Bearer ${current.extensionToken}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    const wrapped = new Error('Personal Dev KG is unreachable.')
    wrapped.details = LC.diagnostic({
      operation: 'backend',
      stage: 'request',
      code: 'backend_unreachable',
      retryable: true,
      message: error && error.message ? error.message : 'Personal Dev KG is unreachable.',
    })
    throw wrapped
  }
  const contentType = response.headers.get('content-type') || ''
  let payload = null
  if (response.status !== 204 && contentType.toLowerCase().includes('application/json')) {
    payload = await response.json().catch(() => null)
  }
  if (response.status === 401) {
    await chrome.storage.local.remove('extensionToken')
    const error = new Error('The extension connection was revoked. Reconnect to continue.')
    error.details = LC.diagnostic({
      operation: 'backend',
      stage: 'request',
      httpStatus: 401,
      contentType,
      code: 'connection_revoked',
      retryable: false,
      message: error.message,
    })
    throw error
  }
  if (response.status === 429 && retry < 2) {
    await wait(600 * 2 ** retry + Math.random() * 200)
    return api(path, options, retry + 1)
  }
  if (!response.ok) {
    const error = new Error(
      payload && typeof payload.detail === 'string'
        ? payload.detail
        : `Personal Dev KG rejected the request with status ${response.status}.`,
    )
    error.details = LC.diagnostic({
      operation: 'backend',
      stage: 'request',
      httpStatus: response.status,
      contentType,
      code: response.status === 429 ? 'backend_rate_limited' : 'backend_rejected',
      retryable: response.status === 429 || response.status >= 500,
      message: error.message,
    })
    throw error
  }
  return payload
}

function isoTimestamp(value) {
  if (!value) return null
  const numeric = Number(value)
  const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function slugFromUrl(url) {
  try {
    return new URL(url).pathname.match(/^\/problems\/([^/]+)/)?.[1] || null
  } catch {
    return null
  }
}

async function leetcodeTab(preferredTabId = null) {
  if (preferredTabId != null) {
    try {
      const tab = await chrome.tabs.get(preferredTabId)
      if (tab && tab.url && tab.url.startsWith('https://leetcode.com/')) return tab
    } catch {
      // Find another authenticated LeetCode tab below.
    }
  }
  const tabs = await chrome.tabs.query({ url: ['https://leetcode.com/*'] })
  return tabs.find((tab) => tab.id != null) || null
}

async function pageState(tabId, url) {
  let loggedIn = null
  let loginDiagnostic = null
  try {
    loggedIn = Boolean((await LC.request({ tabId, operation: 'userStatus' })).isSignedIn)
  } catch (error) {
    loginDiagnostic = safeError(error)
  }
  const slug = slugFromUrl(url)
  let problem = null
  let questionDiagnostic = null
  if (slug) {
    try {
      const question = await LC.request({ tabId, operation: 'question', variables: { titleSlug: slug } })
      if (question) {
        problem = {
          slug,
          title: question.title,
          difficulty: question.difficulty ? question.difficulty.toLowerCase() : null,
          accepted: question.status === 'ac',
        }
      }
    } catch (error) {
      questionDiagnostic = safeError(error)
    }
  }
  return { loggedIn, problem, diagnostics: { login: loginDiagnostic, question: questionDiagnostic } }
}

async function normalizedProblem(tabId, slug) {
  const question = await LC.request({ tabId, operation: 'question', variables: { titleSlug: slug } })
  if (!question) throw LC.clientError({
    operation: 'question',
    stage: 'validate',
    code: 'question_not_found',
    message: 'LeetCode did not return this problem.',
  })

  const captureStatus = {
    metadata: 'fetched',
    accepted_status: question.status ? 'fetched' : 'unknown',
    solution_code: 'not_available',
    source_notes: 'not_available',
  }
  const captureErrors = []
  let latest = null
  let solutionCode = null
  let language = null
  let sourceNotes = null

  try {
    const submissions = await LC.request({
      tabId,
      operation: 'submissions',
      variables: { offset: 0, limit: 20, lastKey: null, questionSlug: slug },
    })
    latest = submissions.find((item) => item.statusDisplay === 'Accepted') || null
    captureStatus.accepted_status = 'fetched'
    if (latest && latest.id) {
      try {
        const details = await LC.request({
          tabId,
          operation: 'submissionDetails',
          variables: { submissionId: Number(latest.id) },
        })
        solutionCode = details && typeof details.code === 'string' ? details.code : null
        language = details && details.lang ? details.lang : latest.lang || null
        captureStatus.solution_code = solutionCode ? 'fetched' : 'not_available'
      } catch (error) {
        captureStatus.solution_code = 'failed'
        captureErrors.push(safeError(error))
      }
    }
  } catch (error) {
    captureStatus.accepted_status = question.status ? 'fetched' : 'failed'
    captureStatus.solution_code = 'failed'
    captureErrors.push(safeError(error))
  }

  try {
    sourceNotes = await LC.request({
      tabId,
      operation: 'questionNote',
      variables: { titleSlug: slug },
    })
    captureStatus.source_notes = sourceNotes ? 'fetched' : 'not_available'
  } catch (error) {
    captureStatus.source_notes = 'failed'
    captureErrors.push(safeError(error))
  }

  const submittedAt = isoTimestamp(latest && latest.timestamp)
  return {
    platform: 'leetcode',
    external_problem_id: slug,
    title: question.title,
    url: `https://leetcode.com/problems/${slug}/`,
    difficulty: question.difficulty ? question.difficulty.toLowerCase() : null,
    tags: (question.topicTags || []).map((tag) => tag.name).filter(Boolean),
    accepted: question.status === 'ac' || Boolean(latest),
    language,
    solution_code: solutionCode,
    source_notes: sourceNotes,
    first_solved_at: submittedAt,
    last_submitted_at: submittedAt,
    source_updated_at: submittedAt,
    capture_status: captureStatus,
    capture_errors: captureErrors.map((item) => `${item.operation}:${item.code}`).slice(0, 8),
  }
}

function emptyCounters() {
  return { processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 }
}

function newJob(tabId, overrides = {}) {
  return {
    version: JOB_VERSION,
    id: crypto.randomUUID(),
    previousJobId: null,
    status: 'discovering',
    resumeStatus: ACTIVE_JOB_STATUSES.has(overrides.status) ? overrides.status : 'discovering',
    tabId,
    slugs: [],
    cursor: 0,
    discoverySkip: 0,
    total: null,
    counters: emptyCounters(),
    attempts: {},
    failures: [],
    inFlight: [],
    latestError: null,
    leaseOwner: null,
    leaseUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  }
}

async function loadJob() {
  return (await chrome.storage.local.get(JOB_KEY))[JOB_KEY] || null
}

async function saveJob(job) {
  const next = { ...job, version: JOB_VERSION, updatedAt: nowIso() }
  await chrome.storage.local.set({ [JOB_KEY]: next })
  return next
}

async function scheduleJob(delayMs = 200) {
  await chrome.alarms.clear(JOB_ALARM)
  chrome.alarms.create(JOB_ALARM, { when: Date.now() + Math.max(100, delayMs) })
}

async function acquireLease(job) {
  if (!job || !ACTIVE_JOB_STATUSES.has(job.status)) return null
  if (job.leaseUntil && Date.parse(job.leaseUntil) > Date.now()) return null
  const leaseOwner = crypto.randomUUID()
  await saveJob({ ...job, leaseOwner, leaseUntil: new Date(Date.now() + LEASE_MS).toISOString() })
  const current = await loadJob()
  return current && current.leaseOwner === leaseOwner ? current : null
}

function failureFor(slug, error, attempts) {
  const details = safeError(error)
  return {
    slug,
    attempts,
    operation: details.operation,
    stage: details.stage,
    code: details.code,
    message: details.message,
    retryable: details.retryable,
  }
}

async function processDiscovery(job, tab) {
  const page = await LC.request({
    tabId: tab.id,
    operation: 'questionList',
    variables: {
      categorySlug: '',
      limit: 100,
      skip: job.discoverySkip,
      filters: { status: 'AC' },
    },
  })
  const slugs = [...new Set([...job.slugs, ...page.questions.map((item) => item.titleSlug).filter(Boolean)])]
  const nextSkip = job.discoverySkip + page.questions.length
  const finished = page.questions.length < 100 || nextSkip >= page.total
  const next = await saveJob({
    ...job,
    tabId: tab.id,
    slugs,
    discoverySkip: nextSkip,
    total: finished ? slugs.length : page.total,
    status: finished ? 'running' : 'discovering',
    resumeStatus: finished ? 'running' : 'discovering',
    leaseOwner: null,
    leaseUntil: null,
    latestError: null,
  })
  if (finished && next.total === 0) {
    await saveJob({ ...next, status: 'complete' })
    return
  }
  await scheduleJob(250)
}

async function mapLimited(items, limit, mapper) {
  const output = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return output
}

async function processBatch(job, tab) {
  const batchSlugs = job.slugs.slice(job.cursor, job.cursor + BATCH_SIZE)
  if (!batchSlugs.length) {
    await saveJob({ ...job, status: 'complete', leaseOwner: null, leaseUntil: null, inFlight: [] })
    return
  }
  const attempts = { ...job.attempts }
  for (const slug of batchSlugs) attempts[slug] = Number(attempts[slug] || 0) + 1
  await saveJob({ ...job, tabId: tab.id, attempts, inFlight: batchSlugs })

  const captures = await mapLimited(batchSlugs, 2, async (slug) => {
    try {
      return { slug, record: await normalizedProblem(tab.id, slug), error: null }
    } catch (error) {
      return { slug, record: null, error }
    }
  })
  const records = captures.filter((item) => item.record).map((item) => item.record)
  const failures = captures
    .filter((item) => item.error)
    .map((item) => failureFor(item.slug, item.error, attempts[item.slug]))
  let result = { imported: 0, updated: 0, skipped: 0, failed: 0, results: [] }
  if (records.length) {
    try {
      result = await api('/integrations/dsa/extension/import-batches', {
        method: 'POST',
        body: JSON.stringify({ records }),
      })
      for (const item of result.results || []) {
        if (item.status === 'failed') {
          failures.push({
            slug: item.external_problem_id,
            attempts: attempts[item.external_problem_id] || 1,
            operation: 'backend',
            stage: 'validate',
            code: item.reason || 'import_failed',
            message: 'Personal Dev KG rejected this normalized record.',
            retryable: item.reason === 'conflict',
          })
        }
      }
    } catch (error) {
      for (const record of records) failures.push(failureFor(record.external_problem_id, error, attempts[record.external_problem_id]))
    }
  }

  const current = await loadJob()
  if (!current || current.id !== job.id || ['paused', 'cancelled'].includes(current.status)) return
  const counters = {
    processed: current.counters.processed + batchSlugs.length,
    imported: current.counters.imported + Number(result.imported || 0),
    updated: current.counters.updated + Number(result.updated || 0),
    skipped: current.counters.skipped + Number(result.skipped || 0),
    failed: current.counters.failed + failures.length,
  }
  const cursor = current.cursor + batchSlugs.length
  const status = cursor >= current.slugs.length ? 'complete' : 'running'
  await saveJob({
    ...current,
    cursor,
    status,
    counters,
    attempts,
    failures: [...current.failures, ...failures].slice(-500),
    inFlight: [],
    leaseOwner: null,
    leaseUntil: null,
    latestError: failures.length ? failures[failures.length - 1] : null,
  })
  if (status === 'running') await scheduleJob(failures.some((item) => item.code.includes('rate_limited')) ? 5_000 : 300)
}

async function processJobAlarm() {
  const original = await loadJob()
  const job = await acquireLease(original)
  if (!job) return
  const tab = await leetcodeTab(job.tabId)
  if (!tab || tab.id == null) {
    const details = LC.diagnostic({
      operation: 'tab',
      stage: 'tab',
      code: 'leetcode_tab_required',
      message: 'Open LeetCode, then resume the import.',
      retryable: true,
    })
    await saveJob({ ...job, status: 'needs_tab', latestError: details, leaseOwner: null, leaseUntil: null })
    return
  }
  try {
    if (job.status === 'discovering') await processDiscovery(job, tab)
    else await processBatch(job, tab)
  } catch (error) {
    const details = await rememberError(error)
    const current = await loadJob()
    if (!current || current.id !== job.id) return
    const needsTab = details.stage === 'tab'
    await saveJob({
      ...current,
      status: needsTab ? 'needs_tab' : (details.retryable ? current.status : 'failed'),
      latestError: details,
      leaseOwner: null,
      leaseUntil: null,
    })
    if (!needsTab && details.retryable) await scheduleJob(5_000)
  }
}

async function setJobStatus(status, tabId = null) {
  const job = await loadJob()
  if (!job) return null
  await chrome.alarms.clear(JOB_ALARM)
  const next = await saveJob(JobState.transition(job, status, tabId))
  if (ACTIVE_JOB_STATUSES.has(next.status)) await scheduleJob(150)
  return next
}

async function diagnostics(tabId, url) {
  const current = await state()
  const report = {
    extensionVersion: chrome.runtime.getManifest().version,
    backend: { ok: false, error: null },
    pairing: { ok: Boolean(current.extensionToken), error: null },
    leetcodeLogin: { ok: false, error: null },
    currentQuestion: { ok: false, skipped: true, error: null },
    questionList: { ok: false, error: null },
    latestError: current.latestSafeError || null,
  }
  try {
    await api('/health', { method: 'GET' })
    report.backend.ok = true
  } catch (error) {
    report.backend.error = safeError(error)
  }
  const tab = await leetcodeTab(tabId)
  if (!tab || tab.id == null) {
    const error = LC.diagnostic({ operation: 'tab', stage: 'tab', code: 'leetcode_tab_required', message: 'Open a LeetCode tab.' })
    report.leetcodeLogin.error = error
    report.questionList.error = error
    return report
  }
  try {
    report.leetcodeLogin.ok = Boolean((await LC.request({ tabId: tab.id, operation: 'userStatus' })).isSignedIn)
  } catch (error) {
    report.leetcodeLogin.error = safeError(error)
  }
  const slug = slugFromUrl(url || tab.url)
  if (slug) {
    report.currentQuestion.skipped = false
    try {
      report.currentQuestion.ok = Boolean(await LC.request({ tabId: tab.id, operation: 'question', variables: { titleSlug: slug } }))
    } catch (error) {
      report.currentQuestion.error = safeError(error)
    }
  }
  try {
    await LC.request({
      tabId: tab.id,
      operation: 'questionList',
      variables: { categorySlug: '', limit: 1, skip: 0, filters: { status: 'AC' } },
    })
    report.questionList.ok = true
  } catch (error) {
    report.questionList.error = safeError(error)
  }
  return report
}

async function forgetConnection() {
  const job = await loadJob()
  await chrome.alarms.clear(JOB_ALARM)
  await chrome.storage.local.remove(['extensionToken', 'latestSafeError'])
  if (job && ACTIVE_JOB_STATUSES.has(job.status)) {
    await saveJob({ ...job, status: 'paused', latestError: LC.diagnostic({
      operation: 'backend',
      stage: 'request',
      code: 'connection_forgotten',
      message: 'Reconnect to continue this import.',
    }) })
  }
}

async function initializeWorker() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {})
  const job = await loadJob()
  if (!job || job.version !== JOB_VERSION || !ACTIVE_JOB_STATUSES.has(job.status)) return
  const leaseExpired = !job.leaseUntil || Date.parse(job.leaseUntil) <= Date.now()
  if (leaseExpired) {
    await saveJob({ ...job, leaseOwner: null, leaseUntil: null, inFlight: [] })
    await scheduleJob(300)
  } else {
    await scheduleJob(Math.max(300, Date.parse(job.leaseUntil) - Date.now() + 100))
  }
}

chrome.runtime.onInstalled.addListener(() => { void initializeWorker() })
chrome.runtime.onStartup.addListener(() => { void initializeWorker() })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === JOB_ALARM) void processJobAlarm()
})

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  ;(async () => {
    if (request.type === 'PAIR') {
      const origin = releaseApiOrigin() || validateDevelopmentOrigin(request.apiOrigin)
      await chrome.storage.local.set({ apiOrigin: origin })
      const result = await api('/integrations/dsa/extension/exchange', {
        method: 'POST',
        body: JSON.stringify({
          code: String(request.code || '').trim().toUpperCase(),
          extension_name: `Chrome / Edge ${chrome.runtime.getManifest().version}`,
        }),
      })
      await chrome.storage.local.set({ extensionToken: result.token, latestSafeError: null })
      return { ok: true }
    }
    if (request.type === 'FORGET_CONNECTION' || request.type === 'RECONNECT') {
      await forgetConnection()
      return { ok: true }
    }
    if (request.type === 'PAGE_STATE') return { ok: true, data: await pageState(request.tabId, request.url) }
    if (request.type === 'CAPTURE') {
      const record = await normalizedProblem(request.tabId, request.slug)
      if (String(request.trackerNotes || '').trim()) record.tracker_notes = request.trackerNotes
      if (request.trackerTags && request.trackerTags.length) record.tracker_tags = request.trackerTags
      const data = await api('/integrations/dsa/extension/import-batches', {
        method: 'POST',
        body: JSON.stringify({ records: [record] }),
      })
      return { ok: true, data, captureStatus: record.capture_status, captureErrors: record.capture_errors }
    }
    if (request.type === 'START_IMPORT') {
      const job = newJob(request.tabId)
      await saveJob(job)
      await scheduleJob(100)
      return { ok: true, data: job }
    }
    if (request.type === 'PAUSE_IMPORT') return { ok: true, data: await setJobStatus('paused') }
    if (request.type === 'RESUME_IMPORT') return { ok: true, data: await setJobStatus('resume', request.tabId) }
    if (request.type === 'CANCEL_IMPORT') return { ok: true, data: await setJobStatus('cancelled') }
    if (request.type === 'RETRY_FAILED') {
      const previous = await loadJob()
      const slugs = previous ? [...new Set(previous.failures.map((item) => item.slug).filter(Boolean))] : []
      if (!slugs.length) throw new Error('There are no failed problems to retry.')
      const job = newJob(request.tabId || previous.tabId, {
        previousJobId: previous.id,
        status: 'running',
        slugs,
        total: slugs.length,
      })
      await saveJob(job)
      await scheduleJob(100)
      return { ok: true, data: job }
    }
    if (request.type === 'DIAGNOSTICS') {
      return { ok: true, data: await diagnostics(request.tabId, request.url) }
    }
    if (request.type === 'GET_EXTENSION_CONFIG') {
      return {
        ok: true,
        data: {
          release: Boolean(releaseApiOrigin()),
          apiOrigin: configuredOrigin(await state()),
          version: chrome.runtime.getManifest().version,
        },
      }
    }
    return { ok: false, error: LC.diagnostic({ code: 'unknown_action', message: 'Unknown extension action.' }) }
  })()
    .then(sendResponse)
    .catch(async (error) => {
      const details = await rememberError(error)
      sendResponse({ ok: false, error: details })
    })
  return true
})

void initializeWorker()
