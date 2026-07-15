import { test, expect, chromium } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('rehydrates a stale persisted import after the MV3 worker target is terminated', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'pdkg-extension-e2e-'))
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    ],
  })

  try {
    let worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host

    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        importJobV2: {
          version: 2,
          id: 'worker-restart-contract',
          previousJobId: null,
          status: 'running',
          resumeStatus: 'running',
          tabId: null,
          slugs: ['two-sum'],
          cursor: 0,
          discoverySkip: 1,
          total: 1,
          counters: { processed: 0, imported: 0, updated: 0, skipped: 0, failed: 0 },
          attempts: {},
          failures: [],
          inFlight: ['two-sum'],
          latestError: null,
          leaseOwner: 'terminated-worker',
          leaseUntil: new Date(Date.now() - 1_000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
      await chrome.alarms.clear('pdkg-import-next-batch')
    })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    const { targetInfos } = await cdp.send('Target.getTargets')
    const workerTarget = targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`))
    expect(workerTarget, 'service-worker target should be discoverable').toBeTruthy()

    await page.goto(`chrome-extension://${extensionId}/tests/fixtures/harness.html`, { waitUntil: 'domcontentloaded' })
    await cdp.send('ServiceWorker.enable')
    await cdp.send('ServiceWorker.stopAllWorkers')
    await expect.poll(() => page.evaluate(async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_EXTENSION_CONFIG' })
        return Boolean(response?.ok)
      } catch {
        return false
      }
    }), { timeout: 8_000 }).toBe(true)


    await expect.poll(async () => page.evaluate(async () => {
      const stored = (await chrome.storage.local.get('importJobV2')).importJobV2
      const alarm = await chrome.alarms.get('pdkg-import-next-batch')
      return {
        id: stored?.id,
        status: stored?.status,
        inFlight: stored?.inFlight,
        leaseOwner: stored?.leaseOwner,
        alarmScheduled: Boolean(alarm),
      }
    })).toMatchObject({
      id: 'worker-restart-contract',
      inFlight: [],
      leaseOwner: null,
    })

    const recovery = await page.evaluate(async () => {
      const stored = (await chrome.storage.local.get('importJobV2')).importJobV2
      const alarm = await chrome.alarms.get('pdkg-import-next-batch')
      return { status: stored.status, alarmScheduled: Boolean(alarm) }
    })
    expect(['running', 'needs_tab']).toContain(recovery.status)
    expect(recovery.alarmScheduled || recovery.status === 'needs_tab').toBe(true)

  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
})