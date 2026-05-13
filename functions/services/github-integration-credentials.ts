import type { DocumentStore } from '../ports/document-store.js'
import { getGitHubOAuthConfig } from '../config/backend-config.js'
import { getUsersCollectionPath } from '../config/backend-paths.js'
import { USER_INTEGRATIONS_SEGMENT } from '../config/future-tenant-collections.js'
import {
  decryptJsonEnvelope,
  encryptJsonEnvelope,
  readCredentialEnvelopeSchemaVersion,
  type IntegrationCredentialEnvelope,
} from './integration-token-crypto.js'
import { refreshGitHubUserAccessToken } from './github-oauth2.js'
import { toStoredDateTime } from '../utils/time.js'

export const GITHUB_INTEGRATION_ID = 'github'

const TOKEN_EXPIRY_SKEW_MS = 120_000

export interface GitHubOAuthCredentialPayload {
  accessToken: string
  refreshToken?: string
  /** ISO 8601 expiry of access_token when GitHub returns expires_in */
  expiresAt?: string
}

export interface ResolvedGitHubApiAuth {
  accessToken: string
  githubUsername: string
}

function tokenNeedsRefresh(expiresAtIso: string | undefined): boolean {
  if (!expiresAtIso) return false
  const t = Date.parse(expiresAtIso)
  if (!Number.isFinite(t)) return false
  return Date.now() > t - TOKEN_EXPIRY_SKEW_MS
}

function expiresAtFromGithubExpiresIn(expiresInSeconds: number | undefined): string | undefined {
  if (expiresInSeconds === undefined || !Number.isFinite(expiresInSeconds)) return undefined
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}

export async function mergeCredentialRefresh(
  documentStore: DocumentStore,
  path: string,
  uid: string,
  payload: GitHubOAuthCredentialPayload,
): Promise<GitHubOAuthCredentialPayload> {
  const envelope = encryptJsonEnvelope(uid, payload)
  if (documentStore.mergeDocument) {
    await documentStore.mergeDocument(path, {
      credentialEnvelope: envelope,
      updatedAt: toStoredDateTime(),
    })
  }
  return payload
}

async function tryRefreshGitHubAccessTokenForUser(
  documentStore: DocumentStore,
  path: string,
  uid: string,
  refreshToken: string,
): Promise<GitHubOAuthCredentialPayload | null> {
  const { clientId, clientSecret } = getGitHubOAuthConfig()
  if (!clientId || !clientSecret) return null
  try {
    const refreshed = await refreshGitHubUserAccessToken({
      clientId,
      clientSecret,
      refreshToken,
    })
    const next: GitHubOAuthCredentialPayload = {
      accessToken: refreshed.access_token,
      expiresAt: expiresAtFromGithubExpiresIn(refreshed.expires_in),
      refreshToken: refreshed.refresh_token ?? refreshToken,
    }
    return documentStore.mergeDocument
      ? await mergeCredentialRefresh(documentStore, path, uid, next)
      : next
  } catch {
    return null
  }
}

export async function loadGitHubAuthForUser(
  documentStore: DocumentStore,
  uid: string,
): Promise<ResolvedGitHubApiAuth | null> {
  const path = `${getUsersCollectionPath()}/${uid}/${USER_INTEGRATIONS_SEGMENT}/${GITHUB_INTEGRATION_ID}`
  const doc = await documentStore.getDocument<Record<string, unknown>>(path)
  if (!doc || typeof doc !== 'object') return null

  const status = doc.status
  if (status !== 'connected') return null

  const githubUsername = typeof doc.githubUsername === 'string' ? doc.githubUsername : ''
  if (!githubUsername) return null

  const env = doc.credentialEnvelope as IntegrationCredentialEnvelope | undefined
  const schemaVersion = env ? readCredentialEnvelopeSchemaVersion(env) : undefined
  if (!env || schemaVersion !== 1) return null

  let creds: GitHubOAuthCredentialPayload
  try {
    creds = decryptJsonEnvelope<GitHubOAuthCredentialPayload>(uid, env)
  } catch {
    return null
  }
  if (!creds.accessToken) return null

  if (tokenNeedsRefresh(creds.expiresAt) && creds.refreshToken) {
    const nextCreds = await tryRefreshGitHubAccessTokenForUser(
      documentStore,
      path,
      uid,
      creds.refreshToken,
    )
    if (!nextCreds) return null
    creds = nextCreds
  }

  return {
    accessToken: creds.accessToken,
    githubUsername,
  }
}
