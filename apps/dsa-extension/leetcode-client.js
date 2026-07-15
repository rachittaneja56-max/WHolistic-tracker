;(function initLeetCodeClient(root, factory) {
  const client = factory()
  root.PdkgLeetCode = client
  if (typeof module !== 'undefined' && module.exports) module.exports = client
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLeetCodeClient() {
  const OPERATIONS = Object.freeze({
    userStatus: {
      query: `query globalData { userStatus { isSignedIn } }`,
      validate(data) {
        if (!data || !data.userStatus || typeof data.userStatus.isSignedIn !== 'boolean') {
          throw shapeError('userStatus', 'data.userStatus.isSignedIn must be a boolean')
        }
        return data.userStatus
      },
    },
    question: {
      query: `query question($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId questionFrontendId title titleSlug difficulty status
          topicTags { name }
        }
      }`,
      validate(data) {
        if (!data || !Object.prototype.hasOwnProperty.call(data, 'question')) {
          throw shapeError('question', 'data.question is missing')
        }
        const question = data.question
        if (question === null) return null
        if (!question || typeof question.title !== 'string' || typeof question.titleSlug !== 'string') {
          throw shapeError('question', 'question title/titleSlug is invalid')
        }
        if (question.topicTags != null && !Array.isArray(question.topicTags)) {
          throw shapeError('question', 'question.topicTags must be an array')
        }
        return question
      },
    },
    questionList: {
      query: `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
          total: totalNum
          questions: data { questionFrontendId title titleSlug difficulty status topicTags { name } }
        }
      }`,
      validate(data) {
        const page = data && data.problemsetQuestionList
        if (!page || !Array.isArray(page.questions) || !Number.isFinite(Number(page.total))) {
          throw shapeError('questionList', 'question list total/questions is invalid')
        }
        if (page.questions.some((question) => !question || typeof question.titleSlug !== 'string')) {
          throw shapeError('questionList', 'question list contains an invalid slug')
        }
        return { total: Number(page.total), questions: page.questions }
      },
    },
    submissions: {
      query: `query submissions($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
        submissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
          submissions { id statusDisplay lang timestamp }
        }
      }`,
      validate(data) {
        const list = data && data.submissionList
        if (list === null) return []
        if (!list || !Array.isArray(list.submissions)) {
          throw shapeError('submissions', 'submissionList.submissions must be an array')
        }
        return list.submissions
      },
    },
    submissionDetails: {
      query: `query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) { code lang timestamp }
      }`,
      validate(data) {
        if (!data || !Object.prototype.hasOwnProperty.call(data, 'submissionDetails')) {
          throw shapeError('submissionDetails', 'data.submissionDetails is missing')
        }
        const details = data.submissionDetails
        if (details === null) return null
        if (!details || (details.code != null && typeof details.code !== 'string')) {
          throw shapeError('submissionDetails', 'submission details are invalid')
        }
        return details
      },
    },
    questionNote: {
      query: `query questionNote($titleSlug: String!) { questionNote(titleSlug: $titleSlug) { note } }`,
      validate(data) {
        if (!data || !Object.prototype.hasOwnProperty.call(data, 'questionNote')) {
          throw shapeError('questionNote', 'data.questionNote is missing')
        }
        const note = data.questionNote
        if (note === null || typeof note === 'string') return note
        if (typeof note === 'object' && (note.note === null || typeof note.note === 'string')) return note.note
        throw shapeError('questionNote', 'question note has an unsupported shape')
      },
    },
  })

  function clean(value, limit = 240) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit)
  }

  function diagnostic(input = {}) {
    return {
      operation: clean(input.operation || 'unknown', 60),
      stage: clean(input.stage || 'request', 40),
      httpStatus: Number.isInteger(input.httpStatus) ? input.httpStatus : null,
      contentType: clean(input.contentType || '', 100) || null,
      retryable: Boolean(input.retryable),
      code: clean(input.code || 'leetcode_error', 80),
      message: clean(input.message || 'LeetCode request failed.', 240),
      graphqlErrors: Array.isArray(input.graphqlErrors)
        ? input.graphqlErrors.slice(0, 3).map((item) => ({
            code: clean(item && item.code, 80) || null,
            message: clean(item && item.message, 180) || 'GraphQL error',
          }))
        : [],
    }
  }

  function clientError(input) {
    const details = diagnostic(input)
    const error = new Error(details.message)
    error.name = 'LeetCodeClientError'
    error.details = details
    return error
  }

  function shapeError(operation, message) {
    return clientError({ operation, stage: 'validate', code: 'schema_drift', message, retryable: false })
  }

  function errorDetails(error, fallback = {}) {
    return error && error.details ? diagnostic(error.details) : diagnostic({
      ...fallback,
      stage: fallback.stage || 'request',
      code: fallback.code || 'unexpected_error',
      message: error && error.message ? error.message : fallback.message,
    })
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function executeInTab(tabId, operation, variables, executeScript) {
    const spec = OPERATIONS[operation]
    if (!spec) throw clientError({ operation, stage: 'validate', code: 'unknown_operation', message: 'Unknown LeetCode operation.' })
    let injected
    try {
      injected = await executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (queryText, queryVariables) => {
          try {
            const csrf = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='))?.split('=').slice(1).join('=')
            const response = await fetch('/graphql/', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'x-csrftoken': decodeURIComponent(csrf) } : {}),
              },
              body: JSON.stringify({ query: queryText, variables: queryVariables }),
            })
            const contentType = response.headers.get('content-type') || ''
            if (!contentType.toLowerCase().includes('application/json')) {
              await response.text().catch(() => '')
              return { status: response.status, contentType, json: false, data: null, errors: [] }
            }
            const payload = await response.json()
            return {
              status: response.status,
              contentType,
              json: true,
              data: payload && payload.data ? payload.data : null,
              errors: Array.isArray(payload && payload.errors)
                ? payload.errors.slice(0, 3).map((item) => ({
                    message: String(item && item.message || ''),
                    code: item && item.extensions ? String(item.extensions.code || '') : '',
                  }))
                : [],
            }
          } catch (error) {
            return {
              status: 0,
              contentType: '',
              json: false,
              data: null,
              errors: [{ code: 'tab_fetch_failed', message: String(error && error.message || 'Tab request failed') }],
            }
          }
        },
        args: [spec.query, variables || {}],
      })
    } catch (error) {
      throw clientError({
        operation,
        stage: 'tab',
        code: 'tab_unavailable',
        message: error && error.message ? error.message : 'The LeetCode tab is unavailable.',
        retryable: false,
      })
    }
    const result = injected && injected[0] ? injected[0].result : null
    if (!result) {
      throw clientError({ operation, stage: 'tab', code: 'empty_tab_result', message: 'LeetCode returned no tab result.' })
    }
    return result
  }

  async function request({
    tabId,
    operation,
    variables = {},
    executeScript = (details) => chrome.scripting.executeScript(details),
    retries = 2,
  }) {
    let attempt = 0
    while (true) {
      const result = await executeInTab(tabId, operation, variables, executeScript)
      const status = Number(result.status || 0)
      const retryable = status === 429 || status >= 500
      if (retryable && attempt < retries) {
        await wait(Math.min(8_000, 500 * 2 ** attempt) + Math.random() * 250)
        attempt += 1
        continue
      }
      if (!result.json) {
        throw clientError({
          operation,
          stage: 'decode',
          httpStatus: status || null,
          contentType: result.contentType,
          retryable,
          code: status === 429 ? 'rate_limited' : 'non_json_response',
          message: status === 429 ? 'LeetCode rate limited this request.' : 'LeetCode returned a non-JSON response.',
          graphqlErrors: result.errors,
        })
      }
      if (status >= 400 || (result.errors && result.errors.length)) {
        throw clientError({
          operation,
          stage: 'request',
          httpStatus: status || null,
          contentType: result.contentType,
          retryable,
          code: status === 429 ? 'rate_limited' : 'graphql_error',
          message: result.errors && result.errors[0] && result.errors[0].message
            ? result.errors[0].message
            : 'LeetCode rejected the GraphQL request.',
          graphqlErrors: result.errors,
        })
      }
      try {
        return specResult(operation, result.data)
      } catch (error) {
        if (error && error.details) throw error
        throw shapeError(operation, error && error.message ? error.message : 'LeetCode response shape changed.')
      }
    }
  }

  function specResult(operation, data) {
    const spec = OPERATIONS[operation]
    if (!spec) throw shapeError(operation, 'Unknown operation')
    return spec.validate(data)
  }

  return { OPERATIONS, clean, diagnostic, clientError, errorDetails, request, specResult }
})
