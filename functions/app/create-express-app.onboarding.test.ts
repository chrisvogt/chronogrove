import './test-support/create-express-app-common-mocks.js'
import './test-support/create-express-app-onboarding-wizard-mock.js'
import './test-support/create-express-app-rate-limit-mock.js'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import dns from 'dns'

import { LocalDiskMediaStore } from '../adapters/storage/local-disk-media-store.js'
import {
  expressAppTestAuthService,
  expressAppTestLogger,
  expressAppTestSyncJobQueue,
} from './test-support/create-express-app-test-doubles.js'
import { findExpressRouteHandler as findRouteHandler } from './test-support/find-express-route-handler.js'

const onboardingExpressMediaDir = mkdtempSync(join(tmpdir(), 'cg-onboarding-express-'))

afterAll(() => {
  rmSync(onboardingExpressMediaDir, { recursive: true, force: true })
})

describe('createExpressApp onboarding routes', () => {
  const logger = expressAppTestLogger()
  const authService = expressAppTestAuthService()
  const documentStore = {
    getDocument: vi.fn(),
    setDocument: vi.fn(),
    deleteDocument: vi.fn(),
    legacyUsernameClaimed: vi.fn(),
    legacyUsernameOwnerUid: vi.fn(),
  }
  const syncJobQueue = expressAppTestSyncJobQueue()

  beforeEach(() => {
    vi.clearAllMocks()
    documentStore.legacyUsernameOwnerUid.mockResolvedValue(null)
    documentStore.legacyUsernameClaimed.mockResolvedValue(false)
  })

  const buildApp = async () => {
    const { createExpressApp } = await import('./create-express-app.js')
    const { loadOnboardingStateForApi, persistOnboardingWizardState } =
      await import('../services/onboarding-wizard-persistence.js')
    return {
      app: createExpressApp({
        authService,
        documentStore,
        ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
        getClientAuthConfig: vi.fn(() => ({})),
        logger,
        resolveMediaStore: () => new LocalDiskMediaStore(onboardingExpressMediaDir),
        syncJobQueue,
      }),
      loadOnboardingStateForApi,
      persistOnboardingWizardState,
    }
  }

  it('GET /api/onboarding/progress does not send when req.user is missing', async () => {
    const { app } = await buildApp()
    const handler = findRouteHandler(app, 'get', '/api/onboarding/progress')
    const json = vi.fn()
    await handler({ headers: {} }, { status: vi.fn().mockReturnValue({ json }), json })
    expect(json).not.toHaveBeenCalled()
  })

  it('PUT /api/onboarding/progress does not send when req.user is missing', async () => {
    const { app, persistOnboardingWizardState } = await buildApp()
    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    await handler({ headers: {}, body: {} }, { status: vi.fn().mockReturnValue({ json }), json })
    expect(json).not.toHaveBeenCalled()
    expect(persistOnboardingWizardState).not.toHaveBeenCalled()
  })

  it('GET /api/onboarding/progress returns payload from persistence', async () => {
    const { app, loadOnboardingStateForApi } = await buildApp()
    const payload = {
      currentStep: 'username' as const,
      completedSteps: [] as [],
      username: null,
      connectedProviderIds: [] as string[],
      customDomain: null,
      updatedAt: 't',
    }
    vi.mocked(loadOnboardingStateForApi).mockResolvedValue(payload)
    documentStore.getDocument.mockResolvedValue({})

    const handler = findRouteHandler(app, 'get', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler(
      { user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true } },
      { status, json }
    )

    expect(loadOnboardingStateForApi).toHaveBeenCalledWith({
      usersCollection: 'users',
      uid: 'u1',
      userDoc: {},
    })
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith({ ok: true, payload })
  })

  it('GET /api/onboarding/progress returns 500 when load fails', async () => {
    const { app, loadOnboardingStateForApi } = await buildApp()
    vi.mocked(loadOnboardingStateForApi).mockRejectedValue(new Error('db'))
    documentStore.getDocument.mockResolvedValue(null)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler(
      { user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true } },
      { status, json }
    )

    expect(status).toHaveBeenCalledWith(500)
  })

  it('PUT /api/onboarding/progress persists and returns 200', async () => {
    const { app, persistOnboardingWizardState, loadOnboardingStateForApi } = await buildApp()
    vi.mocked(persistOnboardingWizardState).mockResolvedValue(undefined)
    documentStore.getDocument.mockResolvedValue({
      username: 'valid_slug',
      onboarding: { currentStep: 'connections', completedSteps: ['username'], updatedAt: 't' },
    })
    vi.mocked(loadOnboardingStateForApi).mockResolvedValue({
      currentStep: 'connections',
      completedSteps: ['username'],
      username: 'valid_slug',
      connectedProviderIds: ['github'],
      integrationStatuses: {},
      customDomain: null,
      updatedAt: 't',
    })

    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    const body = {
      currentStep: 'connections',
      completedSteps: ['username'],
      username: 'valid_slug',
      connectedProviderIds: ['github'],
      customDomain: null,
    }
    await handler(
      { user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true }, body },
      { status, json }
    )

    expect(persistOnboardingWizardState).toHaveBeenCalled()
    expect(loadOnboardingStateForApi).toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(200)
    expect(json.mock.calls[0][0].ok).toBe(true)
  })

  it('PUT /api/onboarding/progress returns 400 for invalid body', async () => {
    const { app, persistOnboardingWizardState } = await buildApp()
    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler({ user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true }, body: {} }, { status, json })

    expect(persistOnboardingWizardState).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(400)
  })

  it('PUT /api/onboarding/progress returns 409 on username_taken', async () => {
    const { app, persistOnboardingWizardState } = await buildApp()
    vi.mocked(persistOnboardingWizardState).mockRejectedValue(new Error('username_taken'))

    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler(
      {
        user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true },
        body: {
          currentStep: 'username',
          completedSteps: [],
          username: 'taken',
          connectedProviderIds: [],
          customDomain: null,
        },
      },
      { status, json }
    )

    expect(status).toHaveBeenCalledWith(409)
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'Username is already taken' })
  })

  it('PUT /api/onboarding/progress returns 409 on hostname_taken', async () => {
    const { app, persistOnboardingWizardState } = await buildApp()
    vi.mocked(persistOnboardingWizardState).mockRejectedValue(new Error('hostname_taken'))

    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler(
      {
        user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true },
        body: {
          currentStep: 'domain',
          completedSteps: ['username', 'connections'],
          username: 'sluggy',
          connectedProviderIds: [],
          customDomain: 'api.taken.example.com',
        },
      },
      { status, json }
    )

    expect(status).toHaveBeenCalledWith(409)
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'That hostname is already claimed' })
  })

  it('PUT /api/onboarding/progress returns 403 on custom_domain_not_entitled', async () => {
    const { app, persistOnboardingWizardState } = await buildApp()
    vi.mocked(persistOnboardingWizardState).mockRejectedValue(
      new Error('custom_domain_not_entitled')
    )

    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler(
      {
        user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true },
        body: {
          currentStep: 'domain',
          completedSteps: [],
          username: null,
          connectedProviderIds: [],
          customDomain: 'api.x.com',
        },
      },
      { status, json }
    )

    expect(status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: 'Custom domain is not enabled for this account',
    })
  })

  it('PUT /api/onboarding/progress returns 500 on unexpected persistence error', async () => {
    const { app, persistOnboardingWizardState } = await buildApp()
    vi.mocked(persistOnboardingWizardState).mockRejectedValue(new Error('firestore down'))

    const handler = findRouteHandler(app, 'put', '/api/onboarding/progress')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler(
      {
        user: { uid: 'u1', email: 'a@chrisvogt.me', emailVerified: true },
        body: {
          currentStep: 'username',
          completedSteps: [],
          username: null,
          connectedProviderIds: [],
          customDomain: null,
        },
      },
      { status, json }
    )

    expect(status).toHaveBeenCalledWith(500)
  })

  it('GET check-username returns 400 when username query is not a string', async () => {
    const { app } = await buildApp()
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler({ query: { username: ['a', 'b'] as unknown as string } }, { json, status })
    expect(status).toHaveBeenCalledWith(400)
  })

  it('GET check-domain returns 400 when domain query is not a string', async () => {
    const { app } = await buildApp()
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler({ query: { domain: 42 as unknown as string } }, { json, status })
    expect(status).toHaveBeenCalledWith(400)
  })

  it('GET check-username returns 400 for invalid slug', async () => {
    const { app } = await buildApp()
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler({ query: { username: '!nope' } }, { json, status })

    expect(status).toHaveBeenCalledWith(400)
  })

  it('GET check-username ignores session when decoded email is missing', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'owner' })
    authService.verifySessionCookie.mockResolvedValue({ uid: 'me' } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        cookies: { session: 's' },
        headers: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username ignores invalid session cookie without logging verify errors (silent path)', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'other' })
    authService.verifySessionCookie.mockRejectedValue(new Error('revoked session'))
    authService.verifyIdToken.mockResolvedValue({
      uid: 'viewer',
      email: 'v@chrisvogt.me',
      emailVerified: true,
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        headers: { authorization: 'Bearer tok' },
        cookies: { session: 'stale' },
      },
      { json }
    )

    expect(logger.error).not.toHaveBeenCalledWith(
      'Session cookie verification failed',
      expect.anything()
    )
    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username ignores invalid bearer when claim exists', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'owner' })
    authService.verifyIdToken.mockRejectedValue(new Error('bad jwt'))

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        headers: { authorization: 'Bearer bad' },
        cookies: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username ignores bearer with disallowed email in production', async () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { app } = await buildApp()
      documentStore.getDocument.mockResolvedValue({ uid: 'owner' })
      authService.verifyIdToken.mockResolvedValue({
        uid: 'x',
        email: 'x@gmail.com',
      } as never)

      const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
      const json = vi.fn()
      await handler(
        {
          query: { username: 'valid_user' },
          headers: { authorization: 'Bearer tok' },
          cookies: {},
        },
        { json }
      )

      expect(json).toHaveBeenCalledWith({ ok: true, available: false })
    } finally {
      process.env.NODE_ENV = prevEnv
    }
  })

  it('GET check-username falls through to legacy when claim uid is not a string', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 999 } as never)
    documentStore.legacyUsernameOwnerUid.mockResolvedValue(null)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler({ query: { username: 'valid_user' } }, { json })

    expect(documentStore.legacyUsernameOwnerUid).toHaveBeenCalled()
    expect(json).toHaveBeenCalledWith({ ok: true, available: true })
  })

  it('GET check-username returns available when no claim and legacy free', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue(null)
    documentStore.legacyUsernameOwnerUid.mockResolvedValue(null)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler({ query: { username: 'valid_user' } }, { json })

    expect(json).toHaveBeenCalledWith({ ok: true, available: true })
  })

  it('GET check-username uses legacyUsernameClaimed when legacyUsernameOwnerUid is absent (available)', async () => {
    const store = {
      getDocument: vi.fn().mockResolvedValue(null),
      setDocument: vi.fn(),
      legacyUsernameClaimed: vi.fn().mockResolvedValue(false),
    }
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore: store,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => new LocalDiskMediaStore(onboardingExpressMediaDir),
      syncJobQueue,
    })
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler({ query: { username: 'valid_user' } }, { json, status })

    expect(store.legacyUsernameClaimed).toHaveBeenCalledWith('users', 'valid_user')
    expect(json).toHaveBeenCalledWith({ ok: true, available: true })
  })

  it('GET check-username uses legacyUsernameClaimed when legacyUsernameOwnerUid is absent (taken)', async () => {
    const store = {
      getDocument: vi.fn().mockResolvedValue(null),
      setDocument: vi.fn(),
      legacyUsernameClaimed: vi.fn().mockResolvedValue(true),
    }
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore: store,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => new LocalDiskMediaStore(onboardingExpressMediaDir),
      syncJobQueue,
    })
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler({ query: { username: 'valid_user' } }, { json, status })

    expect(store.legacyUsernameClaimed).toHaveBeenCalledWith('users', 'valid_user')
    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username legacy username owned by viewer is available', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue(null)
    documentStore.legacyUsernameOwnerUid.mockResolvedValue('me')
    authService.verifySessionCookie.mockRejectedValue(new Error('no cookie'))
    authService.verifyIdToken.mockResolvedValue({
      uid: 'me',
      email: 'me@chrisvogt.me',
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        headers: { authorization: 'Bearer tok' },
        cookies: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: true })
  })

  it('GET check-username legacy username owned by another user is taken', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue(null)
    documentStore.legacyUsernameOwnerUid.mockResolvedValue('owner')
    authService.verifySessionCookie.mockRejectedValue(new Error('no cookie'))
    authService.verifyIdToken.mockResolvedValue({
      uid: 'viewer',
      email: 'v@chrisvogt.me',
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        headers: { authorization: 'Bearer tok' },
        cookies: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username returns taken when claim exists for another user', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'other' })
    authService.verifySessionCookie.mockRejectedValue(new Error('no cookie'))
    authService.verifyIdToken.mockResolvedValue({ uid: 'viewer' } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        headers: { authorization: 'Bearer tok' },
        cookies: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username treats slug as available when viewer owns claim (session)', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'me' })
    authService.verifySessionCookie.mockResolvedValue({
      uid: 'me',
      email: 'me@chrisvogt.me',
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        cookies: { session: 'sess' },
        headers: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: true })
  })

  it('GET check-username clears session and treats viewer as absent when session and bearer uids mismatch and bearer is unverified', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'other' })
    authService.verifySessionCookie.mockResolvedValue({
      uid: 'session-uid',
      email: 'a@chrisvogt.me',
      emailVerified: true,
    } as never)
    authService.verifyIdToken.mockResolvedValue({
      uid: 'bearer-uid',
      email: 'b@chrisvogt.me',
      emailVerified: false,
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const clearCookie = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        cookies: { session: 'sess' },
        headers: { authorization: 'Bearer tok' },
      },
      { json, clearCookie }
    )

    expect(clearCookie).toHaveBeenCalledWith('session', expect.objectContaining({ path: '/' }))
    expect(logger.warn).toHaveBeenCalledWith(
      'Session uid does not match Bearer uid; preferring Bearer and clearing session cookie',
      expect.objectContaining({
        sessionUidPrefix: 'session-',
        bearerUidPrefix: 'bearer-u',
      }),
    )
    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username clears session on uid mismatch but uses verified bearer uid when allowlist passes (mismatch bearer branch)', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'other' })
    authService.verifySessionCookie.mockResolvedValue({
      uid: 'session-uid',
      email: 'a@chrisvogt.me',
      emailVerified: true,
    } as never)
    authService.verifyIdToken.mockResolvedValue({
      uid: 'bearer-uid',
      email: 'b@chrisvogt.me',
      emailVerified: true,
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const clearCookie = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        cookies: { session: 'sess' },
        headers: { authorization: 'Bearer tok' },
      },
      { json, clearCookie }
    )

    expect(clearCookie).toHaveBeenCalledWith('session', expect.objectContaining({ path: '/' }))
    expect(json).toHaveBeenCalledWith({ ok: true, available: false })
  })

  it('GET check-username uses bearer when production session email is not allowlisted', async () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { app } = await buildApp()
      documentStore.getDocument.mockResolvedValue({ uid: 'me' })
      authService.verifySessionCookie.mockResolvedValue({
        uid: 'me',
        email: 'no@example.com',
      } as never)
      authService.verifyIdToken.mockResolvedValue({
        uid: 'me',
        email: 'ok@chrisvogt.me',
      } as never)

      const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
      const json = vi.fn()
      await handler(
        {
          query: { username: 'valid_user' },
          cookies: { session: 'sess' },
          headers: { authorization: 'Bearer tok' },
        },
        { json }
      )

      expect(json).toHaveBeenCalledWith({ ok: true, available: true })
    } finally {
      process.env.NODE_ENV = prevEnv
    }
  })

  it('GET check-username treats slug as available when viewer owns claim (bearer)', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockResolvedValue({ uid: 'me' })
    authService.verifySessionCookie.mockRejectedValue(new Error('bad'))
    authService.verifyIdToken.mockResolvedValue({
      uid: 'me',
      email: 'me@chrisvogt.me',
    } as never)

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    await handler(
      {
        query: { username: 'valid_user' },
        headers: { authorization: 'Bearer idtok' },
        cookies: {},
      },
      { json }
    )

    expect(json).toHaveBeenCalledWith({ ok: true, available: true })
  })

  it('GET check-username returns 500 when legacy helper missing', async () => {
    const store = { getDocument: vi.fn().mockResolvedValue(null), setDocument: vi.fn() }
    const { createExpressApp } = await import('./create-express-app.js')
    const bareApp = createExpressApp({
      authService,
      documentStore: store,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => new LocalDiskMediaStore(onboardingExpressMediaDir),
      syncJobQueue,
    })
    const handler = findRouteHandler(bareApp, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler({ query: { username: 'valid_user' } }, { json, status })

    expect(status).toHaveBeenCalledWith(500)
  })

  it('GET check-username returns 500 on document store error', async () => {
    const { app } = await buildApp()
    documentStore.getDocument.mockRejectedValue(new Error('nope'))

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-username')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler({ query: { username: 'valid_user' } }, { json, status })

    expect(status).toHaveBeenCalledWith(500)
  })

  it('GET check-domain returns 400 for invalid domain', async () => {
    const { app } = await buildApp()
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })

    await handler({ query: { domain: '-bad' } }, { json, status })

    expect(status).toHaveBeenCalledWith(400)
  })

  it('GET check-domain returns 400 when hostname is too long', async () => {
    const { app } = await buildApp()
    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    const domain = 'a'.repeat(254)

    await handler({ query: { domain } }, { json, status })

    expect(status).toHaveBeenCalledWith(400)
  })

  it('GET check-domain returns verified true when CNAME chain reaches required target', async () => {
    const { app } = await buildApp()
    const spy = vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue([
      'personal-stats-chrisvogt.web.app',
    ])

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const json = vi.fn()
    await handler({ query: { domain: 'widgets.example.com' } }, { json })

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        verified: true,
        requiredCname: 'personal-stats-chrisvogt.web.app',
      })
    )
    spy.mockRestore()
  })

  it('GET check-domain returns verified false when CNAME does not reach target', async () => {
    const { app } = await buildApp()
    const spy = vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue(['wrong.example.com'])

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const json = vi.fn()
    await handler({ query: { domain: 'widgets.example.com' } }, { json })

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        verified: false,
        requiredCname: 'personal-stats-chrisvogt.web.app',
      })
    )
    spy.mockRestore()
  })

  it('GET check-domain uses ONBOARDING_REQUIRED_CNAME_TARGET when set', async () => {
    const prev = process.env.ONBOARDING_REQUIRED_CNAME_TARGET
    process.env.ONBOARDING_REQUIRED_CNAME_TARGET = 'API.CHRONOGROVE.COM.'
    try {
      const { app } = await buildApp()
      const spy = vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue(['api.chronogrove.com'])

      const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
      const json = vi.fn()
      await handler({ query: { domain: 'widgets.example.com' } }, { json })

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          verified: true,
          requiredCname: 'api.chronogrove.com',
        })
      )
      spy.mockRestore()
    } finally {
      if (prev === undefined) {
        delete process.env.ONBOARDING_REQUIRED_CNAME_TARGET
      } else {
        process.env.ONBOARDING_REQUIRED_CNAME_TARGET = prev
      }
    }
  })

  it('GET check-domain returns 500 when DNS resolution throws a non-recoverable error', async () => {
    const { app } = await buildApp()
    const spy = vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue(new Error('SERVFAIL'))

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    await handler({ query: { domain: 'widgets.example.com' } }, { json, status })

    expect(logger.error).toHaveBeenCalledWith(
      'Error checking domain DNS',
      expect.objectContaining({ domainLength: 'widgets.example.com'.length })
    )
    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
    spy.mockRestore()
  })

  it('GET check-domain returns 500 when the success res.json throws', async () => {
    const { app } = await buildApp()
    const spy = vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue([])

    const handler = findRouteHandler(app, 'get', '/api/onboarding/check-domain')
    const errorJson = vi.fn().mockImplementationOnce(() => {
      throw new Error('broken response')
    })
    const fallbackJson = vi.fn()
    /* First `json` is on `res` directly; error handler uses `status(500).json(...)` */
    const res = {
      json: errorJson,
      status: vi.fn().mockReturnValue({ json: fallbackJson }),
    }

    await handler({ query: { domain: 'ok.example.com' } }, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(fallbackJson).toHaveBeenCalled()
    spy.mockRestore()
  })
})
