import got from 'got'

import { chronogroveHttpUserAgent } from '../config/chronogrove-http-user-agent.js'
import {
  buildSignatureBaseString,
  buildSigningKey,
  compareOAuthParamUtf8Octets,
  oauthPercentEncode,
  oauthTimestampSeconds,
  parseFormStyleBody,
  randomOAuthNonce,
  signHmacSha1Base64,
} from './flickr-oauth1a.js'

/** Bounded wait for Discogs OAuth and REST calls (serverless-friendly). */
export const DISCOGS_HTTP_TIMEOUT_MS = 20_000

const discogsHttpOptions = { timeout: { request: DISCOGS_HTTP_TIMEOUT_MS } as const }

const DISCOGS_REQUEST_TOKEN_URL = 'https://api.discogs.com/oauth/request_token'
const DISCOGS_ACCESS_TOKEN_URL = 'https://api.discogs.com/oauth/access_token'
export const DISCOGS_AUTHORIZE_URL = 'https://www.discogs.com/oauth/authorize'

/**
 * Discogs documents PLAINTEXT for token endpoints; resource requests use HMAC-SHA1
 * (same as typical OAuth 1.0a consumers).
 */
function oauth1AuthorizationHeader(params: Record<string, string>): string {
  const keys = Object.keys(params).sort(compareOAuthParamUtf8Octets)
  const parts = keys.map((k) => `${oauthPercentEncode(k)}="${oauthPercentEncode(params[k] ?? '')}"`)
  return `OAuth ${parts.join(', ')}`
}

function plaintextOAuthSignature(consumerSecret: string, tokenSecret: string): string {
  return buildSigningKey(consumerSecret, tokenSecret)
}

export async function discogsGetRequestToken(params: {
  consumerKey: string
  consumerSecret: string
  oauthCallback: string
}): Promise<{ oauthToken: string; oauthTokenSecret: string }> {
  const oauthParams: Record<string, string> = {
    oauth_callback: params.oauthCallback,
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: randomOAuthNonce(),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: oauthTimestampSeconds(),
    oauth_version: '1.0',
  }
  oauthParams.oauth_signature = plaintextOAuthSignature(params.consumerSecret, '')

  const { body } = await got.get(DISCOGS_REQUEST_TOKEN_URL, {
    ...discogsHttpOptions,
    headers: {
      Authorization: oauth1AuthorizationHeader(oauthParams),
      'User-Agent': chronogroveHttpUserAgent,
    },
  })

  const parsed = parseFormStyleBody(body)
  if (parsed.oauth_callback_confirmed !== 'true') {
    throw new Error('Discogs OAuth: oauth_callback not confirmed')
  }
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Discogs OAuth request_token failed: ${body}`)
  }
  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
  }
}

export async function discogsGetAccessToken(params: {
  consumerKey: string
  consumerSecret: string
  oauthToken: string
  oauthTokenSecret: string
  oauthVerifier: string
}): Promise<{ oauthToken: string; oauthTokenSecret: string }> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: randomOAuthNonce(),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: oauthTimestampSeconds(),
    oauth_token: params.oauthToken,
    oauth_verifier: params.oauthVerifier,
    oauth_version: '1.0',
  }
  oauthParams.oauth_signature = plaintextOAuthSignature(params.consumerSecret, params.oauthTokenSecret)

  const { body } = await got.post(DISCOGS_ACCESS_TOKEN_URL, {
    ...discogsHttpOptions,
    headers: {
      Authorization: oauth1AuthorizationHeader(oauthParams),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': chronogroveHttpUserAgent,
    },
  })

  const parsed = parseFormStyleBody(body)
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Discogs OAuth access_token failed: ${body}`)
  }
  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
  }
}

export function buildDiscogsAuthorizeUrl(oauthToken: string): string {
  const u = new URL(DISCOGS_AUTHORIZE_URL)
  u.searchParams.set('oauth_token', oauthToken)
  return u.toString()
}

export interface DiscogsOAuthSigningAuth {
  consumerKey: string
  consumerSecret: string
  oauthToken: string
  oauthTokenSecret: string
}

/**
 * Signed GET for Discogs API URLs. Merges existing query params with OAuth; sends OAuth only in
 * the `Authorization` header (parameters still participate in the signature base string).
 */
export async function discogsOAuthGotGet(
  fullUrl: string,
  auth: DiscogsOAuthSigningAuth
): Promise<{ body: string }> {
  const u = new URL(fullUrl)
  const baseUrl = `${u.origin}${u.pathname}`
  const extra: Record<string, string> = {}
  u.searchParams.forEach((v, k) => {
    extra[k] = v
  })

  const oauthForSig: Record<string, string> = {
    oauth_consumer_key: auth.consumerKey,
    oauth_nonce: randomOAuthNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: oauthTimestampSeconds(),
    oauth_token: auth.oauthToken,
    oauth_version: '1.0',
  }
  const allParams = { ...extra, ...oauthForSig }
  const base = buildSignatureBaseString('GET', baseUrl, allParams)
  const signingKey = buildSigningKey(auth.consumerSecret, auth.oauthTokenSecret)
  const sig = signHmacSha1Base64(base, signingKey)
  const headerParams = { ...oauthForSig, oauth_signature: sig }

  return got.get(u.toString(), {
    ...discogsHttpOptions,
    responseType: 'text',
    headers: {
      Authorization: oauth1AuthorizationHeader(headerParams),
      Accept: 'application/vnd.discogs.v2.discogs+json',
      'User-Agent': chronogroveHttpUserAgent,
    },
  })
}

export async function discogsGetIdentity(auth: DiscogsOAuthSigningAuth): Promise<{ username: string }> {
  const { body } = await discogsOAuthGotGet('https://api.discogs.com/oauth/identity', auth)
  const data = JSON.parse(body) as { username?: string }
  if (!data.username || typeof data.username !== 'string') {
    throw new Error('Discogs OAuth identity response missing username')
  }
  return { username: data.username }
}
