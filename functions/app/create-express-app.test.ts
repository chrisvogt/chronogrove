import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { LocalDiskMediaStore } from '../adapters/storage/local-disk-media-store.js'
import { getRateLimitKey } from '../middleware/rate-limit-key.js'
import { createCookieBackedCsrfImpl } from './cookie-backed-csrf.js'
import type { Request } from 'express'

const { capturedRateLimitOptions } = vi.hoisted(() => ({
  capturedRateLimitOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn((opts: Record<string, unknown>) => {
    capturedRateLimitOptions.push(opts)
    return (_req: unknown, _res: unknown, next?: () => void) => next?.()
  }),
}))

vi.mock('../jobs/delete-user.js', () => ({
  default: vi.fn(() => Promise.resolve({ result: 'SUCCESS' })),
}))

vi.mock('../widgets/get-widget-content.js', () => ({
  getWidgetContent: vi.fn(() => Promise.resolve({ payload: { mock: 'widget-content' } })),
  validWidgetIds: ['spotify'],
}))

vi.mock('../services/sync-manual.js', () => ({
  runSyncForProvider: vi.fn(() => Promise.resolve({
    afterJob: { jobId: 'sync-chrisvogt-steam', status: 'completed' },
    beforeJob: { jobId: 'sync-chrisvogt-steam', status: 'queued' },
    enqueue: { jobId: 'sync-chrisvogt-steam', status: 'enqueued' },
    worker: { jobId: 'sync-chrisvogt-steam', result: 'SUCCESS' },
  })),
}))

/** Example Origin that matches `/api` CORS allowlist (`api-cors-allowlist.ts`). */
const TEST_CORS_ALLOWED_ORIGIN = 'https://console.chronogrove.com' as const

describe('createExpressApp media route', () => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

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

  const buildApp = async () => {
    const { createExpressApp } = await import('./create-express-app.js')

    return createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () =>
        new LocalDiskMediaStore(path.join(os.tmpdir(), 'metrics-unused-media-root')),
      syncJobQueue,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    capturedRateLimitOptions.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 404 when disk media serving is disabled', async () => {
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => ({
        describe: () => ({ backend: 'gcs', target: 'bucket' }),
        fetchAndStore: vi.fn(),
        listFiles: vi.fn(),
      }),
      syncJobQueue,
    })

    await request(app)
      .get('/api/media/cover.jpg')
      .expect(404)
  })

  it('returns 404 when no media path is provided', async () => {
    const app = await buildApp()

    await request(app)
      .get('/api/media/')
      .expect(404)
  })

  it('returns 404 when the selected media store is not local disk-backed', async () => {
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => ({
        describe: () => ({ backend: 'gcs', target: '/tmp/not-local' }),
        fetchAndStore: vi.fn(),
        listFiles: vi.fn(),
      }),
      syncJobQueue,
    })

    await request(app)
      .get('/api/media/cover.jpg')
      .expect(404)
  })

  it('returns 404 when the resolved media path escapes the local media root', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-media-root-'))
    const mediaStore = new LocalDiskMediaStore(rootDir)

    vi.spyOn(mediaStore, 'resolveAbsolutePath').mockReturnValue(
      path.join(rootDir, '..', 'outside.txt')
    )
    const { createExpressApp } = await import('./create-express-app.js')
    const routeApp = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => mediaStore,
      syncJobQueue,
    })

    await request(routeApp)
      .get('/api/media/cover.jpg')
      .expect(404)
  })

  it('serves files from the local media root and returns 404 when the file is missing', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-media-files-'))
    const mediaStore = new LocalDiskMediaStore(rootDir)
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => mediaStore,
      syncJobQueue,
    })

    const existingPath = path.join(rootDir, 'cover.jpg')
    fs.writeFileSync(existingPath, 'file-bytes')

    await request(app)
      .get('/api/media/cover.jpg')
      .expect(200)

    await request(app)
      .get('/api/media/missing.jpg')
      .expect(404)
  })

  it('returns 500 when sendFile fails with a non-ENOENT error', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-media-dir-'))
    const mediaStore = new LocalDiskMediaStore(rootDir)
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => mediaStore,
      syncJobQueue,
    })

    fs.mkdirSync(path.join(rootDir, 'folder'))

    await request(app)
      .get('/api/media/folder')
      .expect(500)
  })

  it('does not overwrite the response when sendFile fails after headers are already sent', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-media-sent-'))
    const mediaStore = new LocalDiskMediaStore(rootDir)
    const { createExpressApp } = await import('./create-express-app.js')
    const app = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied: vi.fn().mockResolvedValue(undefined),
      getClientAuthConfig: vi.fn(() => ({})),
      logger,
      resolveMediaStore: () => mediaStore,
    })

    fs.writeFileSync(path.join(rootDir, 'cover.jpg'), 'file-bytes')

    const sendFileSpy = vi
      .spyOn(app.response, 'sendFile')
      .mockImplementation(function mockedSendFile(this: any, _filePath: string, callback?: any) {
        this.status(200).send('already-sent')
        callback?.(Object.assign(new Error('late sendFile failure'), { code: 'ENOENT' }))
        return this
      })

    const response = await request(app)
      .get('/api/media/cover.jpg')
      .expect(200)

    expect(response.text).toBe('already-sent')
    sendFileSpy.mockRestore()
  })
})

describe('createExpressApp auth and session branches', () => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

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

  const ensureRuntimeConfigApplied = vi.fn().mockResolvedValue(undefined)
  const getClientAuthConfig = vi.fn(() => ({
    apiKey: 'public-key',
    authDomain: 'metrics.firebaseapp.com',
    projectId: 'metrics-project',
  }))

  const buildApp = async () => {
    const { createExpressApp } = await import('./create-express-app.js')

    return createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied,
      getClientAuthConfig,
      logger,
      resolveMediaStore: () =>
        new LocalDiskMediaStore(path.join(os.tmpdir(), 'metrics-unused-auth-media')),
      syncJobQueue,
    })
  }

  async function getCsrfHeaders(app: Awaited<ReturnType<typeof buildApp>>) {
    const agent = request.agent(app)
    const capturedCookies: string[] = []
    const cookieBackedCsrf = createCookieBackedCsrfImpl({
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    const csrfState = cookieBackedCsrf.create(
      {
        cookies: {},
        res: {
          cookie: (name: string, value: string) => {
            capturedCookies.push(`${name}=${value}`)
          },
        },
      } as never,
      '_csrfSecret'
    )

    return {
      agent,
      csrfToken: csrfState.token,
      cookies: capturedCookies,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    ensureRuntimeConfigApplied.mockResolvedValue(undefined)
    getClientAuthConfig.mockReturnValue({
      apiKey: 'public-key',
      authDomain: 'metrics.firebaseapp.com',
      projectId: 'metrics-project',
    })
    authService.verifyIdToken.mockResolvedValue({
      uid: 'test-uid',
      email: 'test@chrisvogt.me',
      emailVerified: true,
    })
    authService.verifySessionCookie.mockRejectedValue(new Error('no session cookie'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.NODE_ENV = 'test'
  })

  it('creates a strict secure session cookie in production', async () => {
    process.env.NODE_ENV = 'production'
    const app = await buildApp()

    authService.verifyIdToken.mockResolvedValue({
      uid: 'prod-user',
      email: 'prod@chrisvogt.me',
      emailVerified: true,
    })
    authService.createSessionCookie.mockResolvedValue('prod-session-cookie')

    const { agent, csrfToken, cookies } = await getCsrfHeaders(app)
    const response = await agent
      .post('/api/auth/session')
      .set('Cookie', cookies)
      .set('X-XSRF-TOKEN', csrfToken)
      .set('Authorization', 'Bearer prod-token')
      .expect(200)

    const sessionCookie = (response.headers['set-cookie'] as string[]).find((cookie) =>
      cookie.startsWith('session=')
    )

    expect(sessionCookie).toContain('SameSite=Strict')
    expect(sessionCookie).toContain('HttpOnly')
  })

  it('clears the session cookie with strict settings in production logout', async () => {
    process.env.NODE_ENV = 'production'
    const app = await buildApp()

    authService.verifyIdToken.mockResolvedValue({
      uid: 'prod-user',
      email: 'prod@chrisvogt.me',
      emailVerified: true,
    })
    authService.revokeRefreshTokens.mockResolvedValue(undefined)

    const { agent, csrfToken, cookies } = await getCsrfHeaders(app)
    const response = await agent
      .post('/api/auth/logout')
      .set('Cookie', cookies)
      .set('X-XSRF-TOKEN', csrfToken)
      .set('Authorization', 'Bearer prod-token')
      .expect(200)

    const clearedSessionCookie = (response.headers['set-cookie'] as string[]).find((cookie) =>
      cookie.startsWith('session=')
    )

    expect(clearedSessionCookie).toContain('SameSite=Strict')
    expect(clearedSessionCookie).toContain('session=')
  })

  it('falls back cleanly when session-cookie verification rejects with a plain object', async () => {
    const app = await buildApp()

    authService.verifySessionCookie.mockRejectedValue({
      code: 'auth/invalid-session-cookie',
    })

    const response = await request(app)
      .get('/api/user/profile')
      .set('Cookie', 'session=invalid-cookie')
      .expect(401)

    expect(response.body.ok).toBe(false)
  })

  it('returns 401 when bearer token verification rejects with a plain object', async () => {
    const app = await buildApp()

    authService.verifyIdToken.mockRejectedValue({
      code: 'auth/argument-error',
    })

    const response = await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer bad-token')
      .expect(401)

    expect(response.body.error).toBe('Invalid or expired JWT token')
  })

  it('returns 401 from authenticateUser when reading chosen.email throws (outer catch)', async () => {
    const app = await buildApp()

    let emailReads = 0
    authService.verifyIdToken.mockResolvedValue({
      uid: 'test-uid',
      emailVerified: true,
      get email() {
        emailReads += 1
        if (emailReads < 2) return 'test@chrisvogt.me'
        throw new Error('boom')
      },
    } as never)

    const response = await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer valid-token')
      .expect(401)

    expect(response.body).toEqual({
      ok: false,
      error: 'Invalid or expired token',
    })
    const authErr = vi.mocked(logger.error).mock.calls.find((c) => c[0] === 'Authentication error:')
    expect(authErr?.[1]).toEqual(
      expect.objectContaining({ error: 'boom', uid: 'unknown' }),
    )
  })

  it('rejects state-changing requests when the CSRF token is missing', async () => {
    const app = await buildApp()

    const response = await request(app)
      .post('/api/auth/session')
      .set('Authorization', 'Bearer token')
      .expect(403)

    expect(response.body).toEqual({
      ok: false,
      error: 'CSRF token missing',
    })
  })

  it('returns 403 from session when email is not verified for an allowed-domain user', async () => {
    const app = await buildApp()

    authService.verifyIdToken.mockResolvedValue({
      uid: 'unverified-uid',
      email: 'new@chronogrove.com',
      emailVerified: false,
    })

    const { agent, csrfToken, cookies } = await getCsrfHeaders(app)
    const response = await agent
      .post('/api/auth/session')
      .set('Cookie', cookies)
      .set('X-XSRF-TOKEN', csrfToken)
      .set('Authorization', 'Bearer some-token')
      .expect(403)

    expect(response.body).toEqual({
      ok: false,
      error: 'email_not_verified',
    })
    expect(authService.createSessionCookie).not.toHaveBeenCalled()
  })

  it('returns the client auth config from the provider-neutral endpoint', async () => {
    const app = await buildApp()

    const response = await request(app)
      .get('/api/client-auth-config')
      .expect(200)

    expect(response.body).toEqual({
      apiKey: 'public-key',
      authDomain: 'metrics.firebaseapp.com',
      projectId: 'metrics-project',
    })
    expect(ensureRuntimeConfigApplied).toHaveBeenCalledTimes(1)
    expect(getClientAuthConfig).toHaveBeenCalledTimes(1)
  })

  it('keeps the firebase config endpoint as a compatibility alias', async () => {
    const app = await buildApp()

    const response = await request(app)
      .get('/api/firebase-config')
      .expect(200)

    expect(response.body).toEqual({
      apiKey: 'public-key',
      authDomain: 'metrics.firebaseapp.com',
      projectId: 'metrics-project',
    })
    expect(ensureRuntimeConfigApplied).toHaveBeenCalledTimes(1)
    expect(getClientAuthConfig).toHaveBeenCalledTimes(1)
  })

  it.each([
    'discogs',
    'goodreads',
    'instagram',
    'steam',
  ])('runs %s through the queue-backed sync route wrapper', async (provider) => {
    const app = await buildApp()
    const { runSyncForProvider } = await import('../services/sync-manual.js')

    const response = await request(app)
      .get(`/api/widgets/sync/${provider}`)
      .set('Authorization', 'Bearer valid-sync-token')
      .expect(200)

    expect(runSyncForProvider).toHaveBeenCalledWith({
      documentStore,
      integrationLookupUserId: 'test-uid',
      provider,
      syncJobQueue,
    })
    expect(response.body.enqueue.status).toBe('enqueued')
    expect(response.body.worker.result).toBe('SUCCESS')
  })

  it('returns 401 when manual sync JSON is called without credentials', async () => {
    const app = await buildApp()

    const response = await request(app).get('/api/widgets/sync/spotify').expect(401)

    expect(response.body.ok).toBe(false)
    expect(response.body.error).toBe('No valid authorization header found')
  })

  it('returns 400 for unsupported sync providers', async () => {
    const app = await buildApp()

    const response = await request(app)
      .get('/api/widgets/sync/github')
      .set('Authorization', 'Bearer valid-sync-token')
      .expect(400)

    expect(response.text).toBe('Unrecognized or unsupported provider.')
  })

  it('answers CORS preflight OPTIONS for sync stream (Authorization triggers preflight cross-origin)', async () => {
    const app = await buildApp()

    const response = await request(app)
      .options('/api/widgets/sync/spotify/stream')
      .set('Origin', TEST_CORS_ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')

    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(TEST_CORS_ALLOWED_ORIGIN)
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('returns 404 for GET paths with no matching route (splat fallback)', async () => {
    const app = await buildApp()

    await request(app).get('/no-matching-route-for-coverage').expect(404)
  })

  describe('GET /api/widgets/:provider query user overrides', () => {
    it('uses uid query param when valid', async () => {
      const app = await buildApp()
      const { getWidgetContent } = await import('../widgets/get-widget-content.js')

      await request(app)
        .get('/api/widgets/spotify')
        .query({ uid: 'override-uid-abc' })
        .set('x-forwarded-host', 'api.chronogrove.com')
        .expect(200)

      expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
        'spotify',
        'override-uid-abc',
        documentStore,
        expect.anything()
      )
    })

    it('ignores x-chronogrove-public-host when x-forwarded-host is a non-infrastructure hostname', async () => {
      const prev = process.env.WIDGET_USER_ID_BY_HOSTNAME
      process.env.WIDGET_USER_ID_BY_HOSTNAME = JSON.stringify({
        'api.legitimate.example': 'user-from-forwarded',
        'probe-only.example': 'user-from-probe',
      })
      try {
        const app = await buildApp()
        const { getWidgetContent } = await import('../widgets/get-widget-content.js')
        vi.mocked(getWidgetContent).mockClear()

        await request(app)
          .get('/api/widgets/spotify')
          .set('x-forwarded-host', 'api.legitimate.example')
          .set('x-chronogrove-public-host', 'probe-only.example')
          .expect(200)

        expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
          'spotify',
          'user-from-forwarded',
          documentStore,
          expect.anything(),
        )
      } finally {
        if (prev === undefined) {
          delete process.env.WIDGET_USER_ID_BY_HOSTNAME
        } else {
          process.env.WIDGET_USER_ID_BY_HOSTNAME = prev
        }
      }
    })

    it('honors x-chronogrove-public-host when Host is a Cloud Functions hostname (SSR probe)', async () => {
      const prev = process.env.WIDGET_USER_ID_BY_HOSTNAME
      process.env.WIDGET_USER_ID_BY_HOSTNAME = JSON.stringify({
        'api.tenant.example': 'ssr-tenant-user',
      })
      try {
        const app = await buildApp()
        const { getWidgetContent } = await import('../widgets/get-widget-content.js')
        vi.mocked(getWidgetContent).mockClear()

        await request(app)
          .get('/api/widgets/spotify')
          .set('Host', 'us-central1-demo.cloudfunctions.net')
          .set('x-chronogrove-public-host', 'api.tenant.example')
          .expect(200)

        expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
          'spotify',
          'ssr-tenant-user',
          documentStore,
          expect.anything(),
        )
      } finally {
        if (prev === undefined) {
          delete process.env.WIDGET_USER_ID_BY_HOSTNAME
        } else {
          process.env.WIDGET_USER_ID_BY_HOSTNAME = prev
        }
      }
    })

    it('honors x-chronogrove-public-host when Host is a Cloud Run hostname (SSR probe)', async () => {
      const prev = process.env.WIDGET_USER_ID_BY_HOSTNAME
      process.env.WIDGET_USER_ID_BY_HOSTNAME = JSON.stringify({
        'widgets.run.example': 'run-tenant-user',
      })
      try {
        const app = await buildApp()
        const { getWidgetContent } = await import('../widgets/get-widget-content.js')
        vi.mocked(getWidgetContent).mockClear()

        await request(app)
          .get('/api/widgets/spotify')
          .set('Host', 'my-service-abc123-uc.a.run.app')
          .set('x-chronogrove-public-host', 'widgets.run.example')
          .expect(200)

        expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
          'spotify',
          'run-tenant-user',
          documentStore,
          expect.anything(),
        )
      } finally {
        if (prev === undefined) {
          delete process.env.WIDGET_USER_ID_BY_HOSTNAME
        } else {
          process.env.WIDGET_USER_ID_BY_HOSTNAME = prev
        }
      }
    })

    it('returns 404 when uid query is invalid', async () => {
      const app = await buildApp()

      const response = await request(app)
        .get('/api/widgets/spotify')
        .query({ uid: 'bad!uid' })
        .expect(404)

      expect(response.body).toEqual({ ok: false, error: 'Unknown user.' })
    })

    it('resolves username via tenant_usernames claim', async () => {
      vi.mocked(documentStore.getDocument).mockResolvedValueOnce({ uid: 'claimed-uid' })
      const app = await buildApp()
      const { getWidgetContent } = await import('../widgets/get-widget-content.js')

      await request(app)
        .get('/api/widgets/spotify')
        .query({ username: 'valid-user' })
        .set('x-forwarded-host', 'api.chronogrove.com')
        .expect(200)

      expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
        'spotify',
        'claimed-uid',
        documentStore,
        expect.anything()
      )
    })

    it('falls back to legacyUsernameOwnerUid when claim is missing', async () => {
      vi.mocked(documentStore.getDocument).mockResolvedValueOnce(null)
      vi.mocked(documentStore.legacyUsernameOwnerUid).mockResolvedValueOnce('legacy-owner-uid')
      const app = await buildApp()
      const { getWidgetContent } = await import('../widgets/get-widget-content.js')

      await request(app)
        .get('/api/widgets/spotify')
        .query({ username: 'valid-user' })
        .expect(200)

      expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
        'spotify',
        'legacy-owner-uid',
        documentStore,
        expect.anything()
      )
    })

    it('returns 404 for unknown username slug', async () => {
      vi.mocked(documentStore.getDocument).mockResolvedValueOnce(null)
      vi.mocked(documentStore.legacyUsernameOwnerUid).mockResolvedValueOnce(null)
      const app = await buildApp()

      const response = await request(app)
        .get('/api/widgets/spotify')
        .query({ username: 'valid-user' })
        .expect(404)

      expect(response.body).toEqual({ ok: false, error: 'Unknown user.' })
    })

    it('returns JSON 500 when username resolution fails (e.g. Firestore error)', async () => {
      vi.mocked(documentStore.getDocument).mockRejectedValueOnce(new Error('firestore unavailable'))
      const app = await buildApp()

      const response = await request(app)
        .get('/api/widgets/spotify')
        .query({ username: 'valid-user' })
        .expect(500)

      expect(response.body).toEqual({ ok: false, error: 'firestore unavailable' })
      expect(response.headers['content-type']).toMatch(/json/)
    })

    it('returns 404 for malformed username query', async () => {
      const app = await buildApp()

      const response = await request(app)
        .get('/api/widgets/spotify')
        .query({ username: 'A' })
        .expect(404)

      expect(response.body).toEqual({ ok: false, error: 'Unknown user.' })
    })

    it('prefers uid over username when both are present', async () => {
      vi.mocked(documentStore.getDocument).mockResolvedValueOnce({ uid: 'from-claim' })
      const app = await buildApp()
      const { getWidgetContent } = await import('../widgets/get-widget-content.js')

      await request(app)
        .get('/api/widgets/spotify')
        .query({ uid: 'explicit-uid', username: 'valid-user' })
        .expect(200)

      expect(vi.mocked(getWidgetContent)).toHaveBeenCalledWith(
        'spotify',
        'explicit-uid',
        documentStore,
        expect.anything()
      )
    })
  })

  it('uses first element when GET /api/widgets/:provider param is an array', async () => {
    const app = await buildApp()
    const { getWidgetContent } = await import('../widgets/get-widget-content.js')
    vi.mocked(getWidgetContent).mockClear()

    const widgetRouteLayer = app.router.stack.find(
      (layer) => layer.route?.path === '/api/widgets/:provider'
    )
    const widgetHandler = widgetRouteLayer?.route?.stack.at(-1)?.handle

    expect(widgetHandler).toBeTypeOf('function')

    const req = {
      params: { provider: ['spotify'] },
      query: {},
      headers: { 'x-forwarded-host': 'api.chronogrove.com' },
      hostname: '127.0.0.1',
      cookies: {},
    }
    const res = {
      send: vi.fn(),
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      end: vi.fn(),
    }

    await widgetHandler?.(req, res)

    expect(vi.mocked(getWidgetContent)).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalled()
  })

  it('treats non-string non-array widget :provider as missing', async () => {
    const app = await buildApp()
    const widgetRouteLayer = app.router.stack.find(
      (layer) => layer.route?.path === '/api/widgets/:provider'
    )
    const widgetHandler = widgetRouteLayer?.route?.stack.at(-1)?.handle

    expect(widgetHandler).toBeTypeOf('function')

    const { getWidgetContent } = await import('../widgets/get-widget-content.js')
    vi.mocked(getWidgetContent).mockClear()

    const req = {
      params: { provider: {} },
      query: {},
      headers: { 'x-forwarded-host': 'api.chronogrove.com' },
      hostname: '127.0.0.1',
      cookies: {},
    }
    const res = {
      send: vi.fn(),
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      end: vi.fn(),
    }

    await widgetHandler?.(req, res)

    expect(vi.mocked(getWidgetContent)).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'A valid provider type is required.' }),
    )
  })

  it('accepts array-shaped sync provider params (uses first segment; Express 5)', async () => {
    const { runSyncForProvider } = await import('../services/sync-manual.js')
    const app = await buildApp()
    const syncRouteLayer = app.router.stack.find(
      (layer) => layer.route?.path === '/api/widgets/sync/:provider'
    )
    const syncHandler = syncRouteLayer?.route?.stack.at(-1)?.handle

    expect(syncHandler).toBeTypeOf('function')

    const req = {
      params: {
        provider: ['discogs'],
      },
    }
    const res = {
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    }

    await syncHandler?.(req, res)

    expect(runSyncForProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'discogs' }),
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalled()
  })

  it('widget GET rateLimit keyGenerator includes request path', async () => {
    await buildApp()
    const withKeyGen = capturedRateLimitOptions.find(
      (o) => typeof o.keyGenerator === 'function' && o.keyGenerator !== getRateLimitKey
    )
    expect(withKeyGen).toBeDefined()
    const keyGen = withKeyGen!.keyGenerator as (req: Request) => string
    // No ip / x-forwarded-for / socket so getRateLimitKey uses its local-dev fallback (avoids ipKeyGenerator on the mocked package).
    const req = {
      method: 'GET',
      path: '/api/widgets/spotify',
      headers: {},
    } as Request
    expect(keyGen(req)).toBe('GET:/api/widgets/spotify:local-dev:/api/widgets/spotify')
  })
})
