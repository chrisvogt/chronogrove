import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalDiskMediaStore } from '../adapters/storage/local-disk-media-store.js'

const compressionWireMediaDir = mkdtempSync(join(tmpdir(), 'cg-compression-wire-'))

const { compressionFn, compressionDefaultFilter } = vi.hoisted(() => {
  const compressionDefaultFilter = vi.fn(() => true)
  const compressionFn = vi.fn(
    (_opts?: { filter?: (req: { path?: string; url?: string }, res: unknown) => boolean }) => {
      return (_req: unknown, _res: unknown, next: () => void) => next()
    },
  )
  Object.assign(compressionFn, { filter: compressionDefaultFilter })
  return { compressionFn, compressionDefaultFilter }
})

vi.mock('compression', () => ({ default: compressionFn }))

vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../jobs/delete-user.js', () => ({
  default: vi.fn(() => Promise.resolve({ result: 'SUCCESS' })),
}))

vi.mock('../widgets/get-widget-content.js', () => ({
  getWidgetContent: vi.fn(() => Promise.resolve({ ok: true })),
  validWidgetIds: ['spotify'],
}))

vi.mock('../services/sync-manual.js', () => ({
  runSyncForProvider: vi.fn(() =>
    Promise.resolve({
      afterJob: { jobId: 'j', status: 'completed' },
      beforeJob: { jobId: 'j', status: 'queued' },
      enqueue: { jobId: 'j', status: 'enqueued' },
      worker: { jobId: 'j', result: 'SUCCESS' },
    }),
  ),
}))

afterAll(() => {
  rmSync(compressionWireMediaDir, { recursive: true, force: true })
})

describe('createExpressApp compression middleware registration', () => {
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  const authService = {
    createSessionCookie: vi.fn(),
    deleteUser: vi.fn(),
    getUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    verifyIdToken: vi.fn(),
    verifySessionCookie: vi.fn(),
  }
  const documentStore = { getDocument: vi.fn(), setDocument: vi.fn() }
  const syncJobQueue = {
    claimJob: vi.fn(),
    claimNextJob: vi.fn(),
    completeJob: vi.fn(),
    enqueue: vi.fn(),
    failJob: vi.fn(),
    getJob: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    compressionFn.mockImplementation(
      (_opts?: { filter?: (req: { path?: string; url?: string }, res: unknown) => boolean }) => {
        return (_req: unknown, _res: unknown, next: () => void) => next()
      },
    )
    compressionDefaultFilter.mockImplementation(() => true)
  })

  it('wires compression({ filter }) so SSE sync paths skip the default filter', async () => {
    const { createExpressApp } = await import('./create-express-app.js')
    createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => new LocalDiskMediaStore(compressionWireMediaDir),
      syncJobQueue,
    })

    expect(compressionFn).toHaveBeenCalled()
    const opts = compressionFn.mock.calls[0][0] as {
      filter: (req: { path?: string; url?: string }, res: unknown) => boolean
    }

    expect(opts.filter({ path: '/api/widgets/sync/spotify/stream' }, {})).toBe(false)
    expect(compressionDefaultFilter).not.toHaveBeenCalled()

    compressionDefaultFilter.mockClear()
    expect(opts.filter({ path: '/api/widgets/spotify' }, {})).toBe(true)
    expect(compressionDefaultFilter).toHaveBeenCalledTimes(1)
  })
})
