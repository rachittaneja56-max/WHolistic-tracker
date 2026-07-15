const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const baseClient = require('../leetcode-client.js')
const jobState = require('../job-state.js')
const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8')

function backgroundHarness({ initial = {}, request, fetchImpl } = {}) {
  const values = new Map(Object.entries(initial))
  const local = {
    async get(keys) {
      const requested = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {})
      return Object.fromEntries(requested.filter((key) => values.has(key)).map((key) => [key, values.get(key)]))
    },
    async set(next) { Object.entries(next).forEach(([key, value]) => values.set(key, value)) },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key) },
    async setAccessLevel() {},
  }
  const noopEvent = { addListener() {} }
  const sandbox = {
    URL,
    Date,
    Response,
    crypto: globalThis.crypto,
    fetch: fetchImpl || (async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
    setTimeout,
    clearTimeout,
    importScripts() {},
    PdkgLeetCode: { ...baseClient, request: request || baseClient.request },
    PdkgImportJobState: jobState,
    chrome: {
      storage: { local },
      runtime: {
        getManifest: () => ({ version: '1.1.0', host_permissions: ['https://leetcode.com/*', 'http://localhost:8000/*'] }),
        onInstalled: noopEvent,
        onStartup: noopEvent,
        onMessage: noopEvent,
      },
      alarms: { clear: async () => true, create() {}, onAlarm: noopEvent, get: async () => null },
      tabs: { get: async () => null, query: async () => [] },
      scripting: { executeScript: async () => [] },
    },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(backgroundSource, sandbox, { filename: 'background.js' })
  return { sandbox, values }
}

test('backend 401 clears the revoked extension token', async () => {
  const { sandbox, values } = backgroundHarness({
    initial: { extensionToken: 'revoked-token', apiOrigin: 'http://localhost:8000' },
    fetchImpl: async () => new Response(JSON.stringify({ detail: 'revoked' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  })

  await assert.rejects(
    sandbox.api('/health', { method: 'GET' }),
    (error) => error.details.code === 'connection_revoked' && error.details.httpStatus === 401,
  )
  assert.equal(values.has('extensionToken'), false)
})

test('optional code and note failures preserve metadata with explicit partial capture states', async () => {
  const { sandbox } = backgroundHarness({
    request: async ({ operation }) => {
      if (operation === 'question') return { title: 'Two Sum', titleSlug: 'two-sum', difficulty: 'Easy', status: 'ac', topicTags: [{ name: 'Array' }] }
      if (operation === 'submissions') return [{ id: '100', statusDisplay: 'Accepted', lang: 'javascript', timestamp: '1700000000' }]
      if (operation === 'submissionDetails' || operation === 'questionNote') {
        throw baseClient.clientError({ operation, stage: 'request', code: 'graphql_error', message: `${operation} unavailable` })
      }
      throw new Error(`Unexpected operation ${operation}`)
    },
  })

  const record = await sandbox.normalizedProblem(1, 'two-sum')
  assert.equal(record.title, 'Two Sum')
  assert.equal(record.accepted, true)
  assert.deepEqual(JSON.parse(JSON.stringify(record.capture_status)), {
    metadata: 'fetched',
    accepted_status: 'fetched',
    solution_code: 'failed',
    source_notes: 'failed',
  })
  assert.deepEqual(Array.from(record.capture_errors), ['submissionDetails:graphql_error', 'questionNote:graphql_error'])
})

test('development and release manifests keep API permissions separated', () => {
  const development = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'))
  const release = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.release.json'), 'utf8'))
  assert.ok(development.host_permissions.includes('http://localhost:8000/*'))
  assert.ok(release.host_permissions.every((permission) => permission.startsWith('https://')))
  assert.equal(release.host_permissions.some((permission) => permission.includes('localhost')), false)
})