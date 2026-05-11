import { randomBytes } from 'crypto'
import type { DocumentStore } from '../ports/document-store.js'
import express from 'express'
import { rateLimit } from 'express-rate-limit'

import { getGitHubOAuthConfig } from '../config/backend-config.js'
import {
  OAUTH_GITHUB_PENDING_COLLECTION,
  USER_INTEGRATIONS_SEGMENT,
} from '../config/future-tenant-collections.js'
import { getUsersCollectionPath } from '../config/backend-paths.js'
import { toStoredDateTime } from '../utils/time.js'
import { encryptJsonEnvelope } from '../services/integration-token-crypto.js'
import {
  buildGitHubAppAuthorizeUrl,
  exchangeGitHubOAuthCode,
  fetchGitHubViewerLogin,
} from '../services/github-oauth2.js'
import {
  GITHUB_INTEGRATION_ID,
  type GitHubOAuthCredentialPayload,
} from '../services/github-integration-credentials.js'
import { validateReturnTo, withGitHubOAuthFlash } from '../services/oauth-return-path.js'
import { getRateLimitKey } from '../middleware/rate-limit-key.js'

const PENDING_TTL_MS = 15 * 60 * 1000

const rateLimitMessage = { ok: false, error: 'Too many requests. Please try again later.' }

const githubOAuthRateLimitBase = {
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
} as const

/** OAuth `state` param while status is `pending_oauth`. */
export const GITHUB_OAUTH_PENDING_STATE_FIELD = 'oauthPendingGitHubState'

interface LoggerLike {
  error: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
}

function allowedEmail(email: string | undefined, isProduction: boolean, allowList: string[]): boolean {
  if (!email) return false
  if (!isProduction) return true
  return allowList.some((domain) => email.endsWith(domain))
}

export function resolveGitHubOAuthPublicOrigin(req: express.Request): string {
  const explicit = process.env.PUBLIC_APP_ORIGIN?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost'
  const proto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    (req.protocol === 'http' ? 'http' : 'https')
  return `${proto}://${host}`
}

export function resolveGitHubOAuthRedirectUrl(req: express.Request, target: string): string {
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target
  }
  const base = resolveGitHubOAuthPublicOrigin(req)
  const path = target.startsWith('/') ? target : `/${target}`
  return `${base}${path}`
}

interface GitHubOAuthCallbackQuery {
  code: string
  state: string
}

type GitHubOAuthCallbackQueryRaw = {
  code?: unknown
  state?: unknown
  error?: unknown
  error_description?: unknown
}

function coerceOAuthQueryString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function readGitHubOAuthCallbackQuery(query: express.Request['query']): {
  code: string
  state: string
  providerError: string | null
} {
  const raw = query as GitHubOAuthCallbackQueryRaw
  const providerError = coerceOAuthQueryString(raw.error)
  return {
    code: coerceOAuthQueryString(raw.code),
    state: coerceOAuthQueryString(raw.state),
    providerError: providerError.length > 0 ? providerError : null,
  }
}

function expiresAtFromGithub(expiresInSeconds: number | undefined): string | undefined {
  if (expiresInSeconds === undefined || !Number.isFinite(expiresInSeconds)) return undefined
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}

type GitHubOAuthCfgReady = {
  clientId: string
  clientSecret: string
  callbackUrl: string
}

async function completeGitHubOAuthLink(params: {
  documentStore: DocumentStore
  usersPath: string
  oauthCfg: GitHubOAuthCfgReady
  uid: string
  pendingPath: string
  code: string
  validatedReturnTo: string | null
  req: express.Request
  res: express.Response
  logger: LoggerLike
}): Promise<void> {
  const {
    documentStore,
    usersPath,
    oauthCfg,
    uid,
    pendingPath,
    code,
    validatedReturnTo,
    req,
    res,
    logger,
  } = params

  const token = await exchangeGitHubOAuthCode({
    clientId: oauthCfg.clientId,
    clientSecret: oauthCfg.clientSecret,
    code,
    redirectUri: oauthCfg.callbackUrl,
  })

  const login = await fetchGitHubViewerLogin(token.access_token)

  const credPayload: GitHubOAuthCredentialPayload = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: expiresAtFromGithub(token.expires_in),
  }
  const envelope = encryptJsonEnvelope(uid, credPayload)

  const integrationPath = `${usersPath}/${uid}/${USER_INTEGRATIONS_SEGMENT}/${GITHUB_INTEGRATION_ID}`
  await documentStore.setDocument(integrationPath, {
    providerId: GITHUB_INTEGRATION_ID,
    status: 'connected',
    githubUsername: login,
    credentialEnvelope: envelope,
    oauthCompletedAt: toStoredDateTime(),
    updatedAt: toStoredDateTime(),
  })

  if (documentStore.deleteDocument) {
    await documentStore.deleteDocument(pendingPath)
  }

  logger.info('GitHub OAuth completed', { uid, login })

  const cfg = getGitHubOAuthConfig()
  const successPath =
    validatedReturnTo != null
      ? withGitHubOAuthFlash(validatedReturnTo, 'success')
      : cfg.appSuccessRedirect
  res.redirect(302, resolveGitHubOAuthRedirectUrl(req, successPath))
}

export interface RegisterGitHubOAuthOptions {
  expressApp: express.Express
  authenticateUser: express.RequestHandler
  requireVerifiedEmail: express.RequestHandler
  documentStore: DocumentStore
  logger: LoggerLike
  isProductionEnvironment: boolean
  allowedEmailDomains: string[]
}

export function registerGitHubOAuthRoutes(opts: RegisterGitHubOAuthOptions): void {
  const {
    expressApp,
    authenticateUser,
    requireVerifiedEmail,
    documentStore,
    logger,
    isProductionEnvironment,
    allowedEmailDomains,
  } = opts

  const usersPath = getUsersCollectionPath()

  expressApp.post(
    '/api/oauth/github/start',
    rateLimit({
      ...githubOAuthRateLimitBase,
      windowMs: 15 * 60 * 1000,
      limit: 30,
    }),
    express.json({ limit: '4kb' }),
    authenticateUser,
    requireVerifiedEmail,
    async (req, res) => {
      if (!req.user) return
      const uid = req.user.uid
      const returnTo = validateReturnTo((req.body as { returnTo?: unknown } | undefined)?.returnTo)
      if (!allowedEmail(req.user.email, isProductionEnvironment, allowedEmailDomains)) {
        res.status(403).json({ ok: false, error: 'Forbidden' })
        return
      }

      let encryptionReady = true
      try {
        const { getIntegrationTokenMasterKeyBytes } = await import('../config/backend-config.js')
        getIntegrationTokenMasterKeyBytes()
      } catch {
        encryptionReady = false
      }

      const oauthCfg = getGitHubOAuthConfig()
      if (!oauthCfg.clientId || !oauthCfg.clientSecret || !oauthCfg.callbackUrl) {
        res.status(503).json({
          ok: false,
          error: 'GitHub OAuth is not configured on the server.',
        })
        return
      }
      if (!encryptionReady) {
        res.status(503).json({
          ok: false,
          error: 'Token encryption is not configured (INTEGRATION_TOKEN_MASTER_KEY).',
        })
        return
      }

      try {
        const integrationPath = `${usersPath}/${uid}/${USER_INTEGRATIONS_SEGMENT}/${GITHUB_INTEGRATION_ID}`
        const existing = await documentStore.getDocument<Record<string, unknown>>(integrationPath)
        if (existing?.status === 'connected') {
          res.status(400).json({ ok: false, error: 'GitHub is already linked for this account.' })
          return
        }

        const priorState =
          typeof existing?.[GITHUB_OAUTH_PENDING_STATE_FIELD] === 'string'
            ? existing[GITHUB_OAUTH_PENDING_STATE_FIELD]
            : null
        if (priorState && documentStore.deleteDocument) {
          const stalePath = `${OAUTH_GITHUB_PENDING_COLLECTION}/${encodeURIComponent(priorState)}`
          try {
            await documentStore.deleteDocument(stalePath)
          } catch {
            /* ignore */
          }
        }

        const state = randomBytes(24).toString('hex')
        const pendingPath = `${OAUTH_GITHUB_PENDING_COLLECTION}/${encodeURIComponent(state)}`
        await documentStore.setDocument(pendingPath, {
          uid,
          createdAt: toStoredDateTime(),
          ...(returnTo ? { returnTo } : {}),
        })

        const nextIntegration: Record<string, unknown> = {
          ...(existing && typeof existing === 'object' ? existing : {}),
          providerId: GITHUB_INTEGRATION_ID,
          status: 'pending_oauth',
          [GITHUB_OAUTH_PENDING_STATE_FIELD]: state,
          updatedAt: toStoredDateTime(),
        }
        await documentStore.setDocument(integrationPath, nextIntegration)

        const authorizeUrl = buildGitHubAppAuthorizeUrl(oauthCfg.clientId, oauthCfg.callbackUrl, state)
        res.status(200).json({ ok: true, authorizeUrl })
      } catch (err) {
        logger.error('GitHub OAuth start failed', { uid, error: err })
        res.status(500).json({ ok: false, error: 'Could not start GitHub authorization.' })
      }
    }
  )

  expressApp.get(
    '/api/oauth/github/callback',
    rateLimit({
      ...githubOAuthRateLimitBase,
      windowMs: 15 * 60 * 1000,
      limit: 60,
    }),
    async (req, res) => {
      res.setHeader('Referrer-Policy', 'no-referrer')

      const q = readGitHubOAuthCallbackQuery(req.query)
      let validatedReturnTo: string | null = null

      const failRedirect = (reason: string) => {
        const path = validatedReturnTo
          ? withGitHubOAuthFlash(validatedReturnTo, 'error', reason)
          : withGitHubOAuthFlash('/onboarding', 'error', reason)
        res.redirect(302, resolveGitHubOAuthRedirectUrl(req, path))
      }

      const stateEarly = q.state
      if (stateEarly) {
        const pendingEarlyPath = `${OAUTH_GITHUB_PENDING_COLLECTION}/${encodeURIComponent(stateEarly)}`
        const pendingEarly = await documentStore.getDocument<{ returnTo?: string }>(pendingEarlyPath)
        validatedReturnTo = validateReturnTo(pendingEarly?.returnTo)
      }

      if (q.providerError) {
        logger.warn('GitHub OAuth callback provider error', { error: q.providerError })
        failRedirect(q.providerError)
        return
      }

      const { code, state }: GitHubOAuthCallbackQuery = { code: q.code, state: q.state }

      if (!code || !state) {
        logger.warn('GitHub OAuth callback missing code or state')
        failRedirect('missing_token')
        return
      }

      const pendingPath = `${OAUTH_GITHUB_PENDING_COLLECTION}/${encodeURIComponent(state)}`
      const pending = await documentStore.getDocument<{
        uid?: string
        createdAt?: string
        returnTo?: string
      }>(pendingPath)

      if (!pending?.uid) {
        logger.warn('GitHub OAuth callback: no pending session')
        failRedirect('session_expired')
        return
      }

      validatedReturnTo = validateReturnTo(pending.returnTo) ?? validatedReturnTo

      const created = pending.createdAt ? Date.parse(pending.createdAt) : NaN
      if (!Number.isFinite(created) || Date.now() - created > PENDING_TTL_MS) {
        if (documentStore.deleteDocument) {
          try {
            await documentStore.deleteDocument(pendingPath)
          } catch {
            /* ignore */
          }
        }
        failRedirect('session_expired')
        return
      }

      const uid = pending.uid
      const oauthCfgRaw = getGitHubOAuthConfig()
      if (!oauthCfgRaw.clientId || !oauthCfgRaw.clientSecret || !oauthCfgRaw.callbackUrl) {
        failRedirect('server_misconfigured')
        return
      }
      const oauthCfg: GitHubOAuthCfgReady = {
        clientId: oauthCfgRaw.clientId,
        clientSecret: oauthCfgRaw.clientSecret,
        callbackUrl: oauthCfgRaw.callbackUrl,
      }

      let encryptionReady = true
      try {
        const { getIntegrationTokenMasterKeyBytes } = await import('../config/backend-config.js')
        getIntegrationTokenMasterKeyBytes()
      } catch {
        encryptionReady = false
      }
      if (!encryptionReady) {
        failRedirect('encryption_unconfigured')
        return
      }

      try {
        await completeGitHubOAuthLink({
          documentStore,
          usersPath,
          oauthCfg,
          uid,
          pendingPath,
          code,
          validatedReturnTo,
          req,
          res,
          logger,
        })
      } catch (err) {
        logger.error('GitHub OAuth callback failed', { uid, error: err })
        failRedirect('token_exchange_failed')
      }
    }
  )

  expressApp.delete(
    '/api/oauth/github',
    rateLimit({
      ...githubOAuthRateLimitBase,
      windowMs: 15 * 60 * 1000,
      limit: 20,
    }),
    authenticateUser,
    requireVerifiedEmail,
    async (req, res) => {
      if (!req.user) return
      const uid = req.user.uid
      const integrationPath = `${usersPath}/${uid}/${USER_INTEGRATIONS_SEGMENT}/${GITHUB_INTEGRATION_ID}`
      try {
        if (!documentStore.deleteDocument) {
          res.status(500).json({ ok: false, error: 'Delete not supported by store.' })
          return
        }
        const integration = await documentStore.getDocument<Record<string, unknown>>(integrationPath)
        const pendingState =
          typeof integration?.[GITHUB_OAUTH_PENDING_STATE_FIELD] === 'string'
            ? integration[GITHUB_OAUTH_PENDING_STATE_FIELD]
            : null
        if (pendingState) {
          const pendingPath = `${OAUTH_GITHUB_PENDING_COLLECTION}/${encodeURIComponent(pendingState)}`
          try {
            await documentStore.deleteDocument(pendingPath)
          } catch {
            /* ignore */
          }
        }
        await documentStore.deleteDocument(integrationPath)
        res.status(200).json({ ok: true })
      } catch (err) {
        logger.error('GitHub disconnect failed', { uid, error: err })
        res.status(500).json({ ok: false, error: 'Could not disconnect GitHub.' })
      }
    }
  )
}
