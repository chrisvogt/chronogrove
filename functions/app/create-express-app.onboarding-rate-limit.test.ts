import './test-support/create-express-app-common-mocks.js'
import './test-support/create-express-app-onboarding-wizard-mock.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dns from 'dns'
import request from 'supertest'

import { LocalDiskMediaStore } from '../adapters/storage/local-disk-media-store.js'

const onboardingRlMediaDir = mkdtempSync(join(tmpdir(), 'cg-onboarding-rl-'))

/**
 * Real `express-rate-limit` (not mocked) so onboarding limiters exercise the
 * custom 429 handler (`limitLogger.warn`, `response.status(...).json(...)`).
 */

afterAll(() => {
  rmSync(onboardingRlMediaDir, { recursive: true, force: true })
})

describe('createExpressApp onboarding rate limits (real limiter)', () => {
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  const authService = {
    createSessionCookie: vi.fn(),
    deleteUser: vi.fn(),
    getUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    verifyIdToken: vi.fn(),
    verifySessionCookie: vi.fn(),
  }
  const documentStore = {
    getDocument: vi.fn(),
    setDocument: vi.fn(),
    legacyUsernameClaimed: vi.fn(),
    legacyUsernameOwnerUid: vi.fn(),
  }
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
    documentStore.getDocument.mockResolvedValue(null)
    documentStore.legacyUsernameClaimed.mockResolvedValue(false)
    documentStore.legacyUsernameOwnerUid.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const buildApp = async () => {
    vi.resetModules()
    const { createExpressApp } = await import('./create-express-app.js')
    return createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => new LocalDiskMediaStore(onboardingRlMediaDir),
      syncJobQueue,
    })
  }

  it('returns 429 and logs after check-username exceeds onboarding limit', async () => {
    const app = await buildApp()

    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/api/onboarding/check-username').query({ username: 'valid_user' })
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/api/onboarding/check-username').query({ username: 'valid_user' })
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ ok: false, error: 'Too many requests. Please try again later.' })
    expect(logger.warn).toHaveBeenCalledWith('rate_limit_exceeded', {
      label: 'onboarding_check_username',
      path: '/api/onboarding/check-username',
    })
  })

  it('returns 429 and logs after check-domain exceeds onboarding limit', async () => {
    vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue(
      Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' as const })
    )

    const app = await buildApp()

    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/api/onboarding/check-domain').query({ domain: 'widgets.example.com' })
      expect(res.status).toBe(200)
    }

    const blocked = await request(app).get('/api/onboarding/check-domain').query({ domain: 'widgets.example.com' })
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ ok: false, error: 'Too many requests. Please try again later.' })
    expect(logger.warn).toHaveBeenCalledWith('rate_limit_exceeded', {
      label: 'onboarding_check_domain',
      path: '/api/onboarding/check-domain',
    })
  })
})
