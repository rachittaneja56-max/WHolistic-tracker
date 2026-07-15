;(function initJobState(root, factory) {
  const api = factory()
  root.PdkgImportJobState = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function createJobState() {
  const ACTIVE_STATUSES = new Set(['discovering', 'running'])

  function resumePhase(job = {}) {
    if (ACTIVE_STATUSES.has(job.status)) return job.status
    if (ACTIVE_STATUSES.has(job.resumeStatus)) return job.resumeStatus
    const total = job.total == null ? null : Number(job.total)
    const discovered = Number(job.discoverySkip || 0)
    if (total == null || (Number.isFinite(total) && discovered < total)) return 'discovering'
    return 'running'
  }

  function transition(job, requestedStatus, tabId = null) {
    const status = requestedStatus === 'resume' ? resumePhase(job) : requestedStatus
    const resumeStatus = ACTIVE_STATUSES.has(status) ? status : resumePhase(job)
    return {
      ...job,
      status,
      resumeStatus,
      tabId: tabId == null ? job.tabId : tabId,
      leaseOwner: null,
      leaseUntil: null,
      inFlight: [],
    }
  }

  return { ACTIVE_STATUSES, resumePhase, transition }
})