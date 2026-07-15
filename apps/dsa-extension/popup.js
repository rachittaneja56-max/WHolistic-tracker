const $ = (id) => document.getElementById(id)
const primarySections = ['pairing', 'offsite', 'logged-out', 'problem', 'importer']
let activeTab = null
let page = null
let extensionConfig = null

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}
function show(...ids) {
  primarySections.forEach((id) => $(id).classList.toggle('hidden', !ids.includes(id)))
}

function errorText(error) {
  if (!error) return 'Something went wrong.'
  if (typeof error === 'string') return error
  const prefix = [error.operation, error.stage, error.code].filter(Boolean).join(' · ')
  return `${prefix ? `${prefix}: ` : ''}${error.message || 'Something went wrong.'}`
}

function notice(message, success = false) {
  $('notice').textContent = message
  $('notice').className = message ? `notice${success ? ' success' : ''}` : 'notice hidden'
}

async function message(payload) {
  return chrome.runtime.sendMessage(payload)
}

function renderProgress(job = {}) {
  const total = Number(job.total || job.slugs?.length || 0)
  const counters = job.counters || {}
  const done = Number(counters.processed || job.cursor || 0)
  $('progress').max = Math.max(total, 1)
  $('progress').value = done
  $('progress-label').textContent = total ? `${done} / ${total}` : 'Not started'
  $('job-status').textContent = job.status || 'idle'
  $('pause').disabled = job.status !== 'running' && job.status !== 'discovering'
  $('resume').disabled = !['paused', 'needs_tab', 'failed'].includes(job.status)
  $('cancel').disabled = !['running', 'discovering', 'paused', 'needs_tab'].includes(job.status)
  $('retry-failed').disabled = !(job.failures && job.failures.length)
  const values = [
    ['done', done],
    ['new', counters.imported || 0],
    ['updated', counters.updated || 0],
    ['skipped', counters.skipped || 0],
    ['failed', counters.failed || 0],
  ]
  $('counters').innerHTML = values.map(([label, value]) => `<div class='counter'><strong>${Number(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')
  const failures = (job.failures || []).slice(-5).reverse()
  $('failure-list').classList.toggle('hidden', !failures.length)
  $('failure-list').innerHTML = failures.length
    ? `<strong>Latest failures</strong><ul>${failures.map((item) => `<li>${escapeHtml(item.slug)}: ${escapeHtml(item.operation)}/${escapeHtml(item.code)}</li>`).join('')}</ul>`
    : ''
}

function renderCaptureDetails(status = {}, errors = []) {
  const labels = {
    metadata: 'Metadata',
    accepted_status: 'Accepted status',
    solution_code: 'Solution code',
    source_notes: 'LeetCode note',
  }
  const items = Object.entries(labels).map(([key, label]) => `<li>${escapeHtml(label)}: ${escapeHtml(status[key] || 'unknown')}</li>`)
  const errorLine = errors.length ? `<p>${errors.length} optional field request(s) could not be completed.</p>` : ''
  $('capture-details').innerHTML = `<strong>Capture details</strong><ul>${items.join('')}</ul>${errorLine}`
  $('capture-details').classList.remove('hidden')
}

function diagnosticRow(label, result, skipped = false) {
  const ok = result && result.ok
  const state = skipped ? 'Skipped' : ok ? 'OK' : 'Needs attention'
  const className = skipped ? 'diagnostic-idle' : ok ? 'diagnostic-ok' : 'diagnostic-warn'
  return `<div class='diagnostic-row'><span>${escapeHtml(label)}</span><span class='${className}' title='${escapeHtml(result && result.error ? errorText(result.error) : '')}'>${escapeHtml(state)}</span></div>`
}

function renderDiagnostics(report) {
  const current = report.currentQuestion || {}
  $('diagnostic-list').innerHTML = [
    diagnosticRow('Backend reachability', report.backend),
    diagnosticRow('Extension pairing', report.pairing),
    diagnosticRow('LeetCode login', report.leetcodeLogin),
    diagnosticRow('Current question', current, current.skipped),
    diagnosticRow('Solved list', report.questionList),
  ].join('')
  const latest = report.latestError
  $('latest-error').classList.toggle('hidden', !latest)
  $('latest-error').textContent = latest ? `Latest safe error: ${errorText(latest)}` : ''
}

async function runDiagnostics() {
  $('run-diagnostics').disabled = true
  const response = await message({ type: 'DIAGNOSTICS', tabId: activeTab?.id, url: activeTab?.url })
  $('run-diagnostics').disabled = false
  if (!response?.ok) return notice(errorText(response?.error))
  renderDiagnostics(response.data)
}

async function refresh() {
  extensionConfig = (await message({ type: 'GET_EXTENSION_CONFIG' })).data
  $('extension-version').textContent = `v${extensionConfig.version}`
  $('api-origin').value = extensionConfig.apiOrigin
  $('api-origin-field').classList.toggle('hidden', extensionConfig.release)
  $('connected-origin').textContent = extensionConfig.apiOrigin

  const stored = await chrome.storage.local.get(['extensionToken', 'importJobV2', 'latestSafeError'])
  $('connection').classList.toggle('hidden', !stored.extensionToken)
  renderProgress(stored.importJobV2)
  if (stored.latestSafeError) {
    $('latest-error').classList.remove('hidden')
    $('latest-error').textContent = `Latest safe error: ${errorText(stored.latestSafeError)}`
  }
  if (!stored.extensionToken) {
    show('pairing')
    await runDiagnostics()
    return
  }
  ;[activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!activeTab?.url?.startsWith('https://leetcode.com/')) {
    show('offsite')
    await runDiagnostics()
    return
  }
  const result = await message({ type: 'PAGE_STATE', tabId: activeTab.id, url: activeTab.url })
  if (!result?.ok) {
    notice(errorText(result?.error))
    show('offsite')
    await runDiagnostics()
    return
  }
  page = result.data
  const sections = []
  if (page.loggedIn === false) sections.push('logged-out')
  if (page.problem) {
    $('title').textContent = page.problem.title
    $('difficulty').textContent = page.problem.difficulty || 'unknown'
    $('tracker-status').textContent = page.problem.accepted ? 'Solved' : 'Not solved'
    sections.push('problem')
  }
  if (page.loggedIn !== false) sections.push('importer')
  show(...sections.length ? sections : ['importer'])
  await runDiagnostics()
}

$('pair').addEventListener('click', async () => {
  notice('')
  $('pair').disabled = true
  const response = await message({ type: 'PAIR', code: $('pair-code').value, apiOrigin: $('api-origin').value })
  $('pair').disabled = false
  if (!response?.ok) return notice(errorText(response?.error))
  notice('Extension paired.', true)
  await refresh()
})
$('reconnect').addEventListener('click', async () => {
  await message({ type: 'RECONNECT' })
  notice('Enter a new pairing code to reconnect.')
  await refresh()
})
$('forget').addEventListener('click', async () => {
  await message({ type: 'FORGET_CONNECTION' })
  notice('Connection removed from this browser.')
  await refresh()
})
$('open-leetcode').addEventListener('click', () => chrome.tabs.create({ url: 'https://leetcode.com/problemset/' }))
$('login').addEventListener('click', () => chrome.tabs.create({ url: 'https://leetcode.com/accounts/login/' }))
$('capture').addEventListener('click', async () => {
  $('capture').disabled = true
  notice('Capturing available metadata, accepted code, and note…')
  const response = await message({
    type: 'CAPTURE',
    tabId: activeTab.id,
    slug: page.problem.slug,
    trackerNotes: $('tracker-note').value,
    trackerTags: $('tracker-tags').value.split(',').map((item) => item.trim()).filter(Boolean),
  })
  $('capture').disabled = false
  if (!response?.ok) return notice(errorText(response?.error))
  renderCaptureDetails(response.captureStatus, response.captureErrors || [])
  notice('Problem saved to your tracker.', true)
})
$('import-all').addEventListener('click', async () => {
  const response = await message({ type: 'START_IMPORT', tabId: activeTab.id })
  if (!response?.ok) return notice(errorText(response?.error))
  notice('Historical import started. It will continue after the popup closes.', true)
  renderProgress(response.data)
})
$('pause').addEventListener('click', async () => renderProgress((await message({ type: 'PAUSE_IMPORT' })).data))
$('resume').addEventListener('click', async () => renderProgress((await message({ type: 'RESUME_IMPORT', tabId: activeTab?.id })).data))
$('cancel').addEventListener('click', async () => renderProgress((await message({ type: 'CANCEL_IMPORT' })).data))
$('retry-failed').addEventListener('click', async () => {
  const response = await message({ type: 'RETRY_FAILED', tabId: activeTab?.id })
  if (!response?.ok) return notice(errorText(response?.error))
  notice('Retry job started.', true)
  renderProgress(response.data)
})
$('run-diagnostics').addEventListener('click', runDiagnostics)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.importJobV2) renderProgress(changes.importJobV2.newValue)
  if (changes.extensionToken && !changes.extensionToken.newValue) void refresh()
})
refresh().catch((error) => notice(errorText(error)))
