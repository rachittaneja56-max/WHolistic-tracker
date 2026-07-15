const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const client = require('../leetcode-client.js')
const jobState = require('../job-state.js')
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'leetcode-v1.json'), 'utf8'))

test('versioned LeetCode compatibility fixture validates each named operation', () => {
  assert.equal(fixture.version, 1)
  assert.equal(client.specResult('userStatus', fixture.operations.userStatus).isSignedIn, false)
  assert.equal(client.specResult('question', fixture.operations.question).titleSlug, 'two-sum')
  assert.deepEqual(client.specResult('questionList', fixture.operations.questionList).questions.map((item) => item.titleSlug), ['two-sum'])
  assert.equal(client.specResult('submissions', fixture.operations.submissions)[0].statusDisplay, 'Accepted')
  assert.match(client.specResult('submissionDetails', fixture.operations.submissionDetails).code, /answer/)
  assert.equal(client.specResult('questionNote', fixture.operations.questionNote), 'Use a hash map.')
})

test('schema drift is operation-specific and does not invalidate question metadata', () => {
  const question = client.specResult('question', fixture.operations.question)
  assert.equal(question.title, 'Two Sum')
  assert.throws(
    () => client.specResult('submissions', { submissionList: { submissions: null } }),
    (error) => error.details.operation === 'submissions' && error.details.stage === 'validate' && error.details.code === 'schema_drift',
  )
  assert.throws(
    () => client.specResult('questionNote', { questionNote: { unexpected: true } }),
    (error) => error.details.operation === 'questionNote' && error.details.code === 'schema_drift',
  )
})

test('HTML or Cloudflare responses retain safe diagnostic context', async () => {
  await assert.rejects(
    client.request({
      tabId: 1,
      operation: 'question',
      retries: 0,
      executeScript: async () => [{ result: { status: 403, contentType: 'text/html; charset=UTF-8', json: false, data: null, errors: [] } }],
    }),
    (error) => {
      assert.equal(error.details.operation, 'question')
      assert.equal(error.details.stage, 'decode')
      assert.equal(error.details.httpStatus, 403)
      assert.equal(error.details.contentType, 'text/html; charset=UTF-8')
      assert.equal(error.details.code, 'non_json_response')
      return true
    },
  )
})

test('rate limits are classified as retryable without exposing response bodies', async () => {
  await assert.rejects(
    client.request({
      tabId: 1,
      operation: 'questionList',
      retries: 0,
      executeScript: async () => [{ result: { status: 429, contentType: 'application/json', json: true, data: null, errors: [{ code: 'RATE_LIMITED', message: 'Try later\u0000' }] } }],
    }),
    (error) => {
      assert.equal(error.details.code, 'rate_limited')
      assert.equal(error.details.retryable, true)
      assert.equal(error.details.graphqlErrors[0].message, 'Try later')
      return true
    },
  )
})

test('missing and logged-out states remain explicit', () => {
  assert.equal(client.specResult('userStatus', fixture.operations.userStatus).isSignedIn, false)
  assert.equal(client.specResult('question', { question: null }), null)
  assert.deepEqual(client.specResult('submissions', { submissionList: null }), [])
  assert.equal(client.specResult('questionNote', { questionNote: null }), null)
})

test('pausing and resuming discovery preserves the discovery phase', () => {
  const discovering = { status: 'discovering', resumeStatus: 'discovering', tabId: 7, total: null, discoverySkip: 100, inFlight: ['two-sum'], leaseOwner: 'old', leaseUntil: 'future' }
  const paused = jobState.transition(discovering, 'paused')
  assert.equal(paused.status, 'paused')
  assert.equal(paused.resumeStatus, 'discovering')
  assert.deepEqual(paused.inFlight, [])
  const resumed = jobState.transition(paused, 'resume', 8)
  assert.equal(resumed.status, 'discovering')
  assert.equal(resumed.tabId, 8)
})

test('pausing and resuming import preserves the batch phase, including legacy jobs', () => {
  const running = jobState.transition({ status: 'running', resumeStatus: 'running', tabId: 1, total: 10, discoverySkip: 10 }, 'paused')
  assert.equal(jobState.transition(running, 'resume').status, 'running')
  assert.equal(jobState.resumePhase({ status: 'paused', total: null, discoverySkip: 0 }), 'discovering')
  assert.equal(jobState.resumePhase({ status: 'paused', total: 10, discoverySkip: 10 }), 'running')
})