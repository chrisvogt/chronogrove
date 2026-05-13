import { createHmac, randomBytes } from 'node:crypto'

import got from 'got'

/** Bounded wait for Flickr OAuth and REST calls (serverless-friendly). */
export const FLICKR_HTTP_TIMEOUT_MS = 20_000

const flickrHttpOptions = { timeout: { request: FLICKR_HTTP_TIMEOUT_MS } as const }

function tryDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** OAuth 1.0a percent-encoding (RFC 5849 §3.6). */
export function oauthPercentEncode(input: string): string {
  return encodeURIComponent(input)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%7E/gi, '~')
}

export function buildSigningKey(consumerSecret: string, tokenSecret: string): string {
  return `${oauthPercentEncode(consumerSecret)}&${oauthPercentEncode(tokenSecret)}`
}

function normalizeParamPairs(params: Record<string, string>): [string, string][] {
  return Object.entries(params).map(([k, v]) => [k, v] as [string, string])
}

/** RFC 5849 §3.4.1.3.2: ascending byte value ordering on UTF-8 octets. */
export function compareOAuthParamUtf8Octets(a: string, b: string): number {
  const ua = Buffer.from(a, 'utf8')
  const ub = Buffer.from(b, 'utf8')
  const n = Math.min(ua.length, ub.length)
  for (let i = 0; i < n; i++) {
    const d = ua[i]! - ub[i]!
    if (d !== 0) {
      return d
    }
  }
  return ua.length - ub.length
}

/** Sort by name then value per OAuth 1.0a normalization (UTF-8 octet order). */
export function sortParamPairs(pairs: [string, string][]): [string, string][] {
  return [...pairs].sort((x, y) => {
    const keyCmp = compareOAuthParamUtf8Octets(x[0], y[0])
    if (keyCmp !== 0) {
      return keyCmp
    }
    return compareOAuthParamUtf8Octets(x[1], y[1])
  })
}

export function buildParameterString(params: Record<string, string>): string {
  const sorted = sortParamPairs(normalizeParamPairs(params))
  return sorted.map(([k, v]) => `${oauthPercentEncode(k)}=${oauthPercentEncode(v)}`).join('&')
}

export function buildSignatureBaseString(
  method: string,
  requestUrl: string,
  params: Record<string, string>
): string {
  const base = [
    method.toUpperCase(),
    oauthPercentEncode(requestUrl),
    oauthPercentEncode(buildParameterString(params)),
  ].join('&')
  return base
}

export function signHmacSha1Base64(baseString: string, signingKey: string): string {
  return createHmac('sha1', signingKey).update(baseString).digest('base64')
}

export function randomOAuthNonce(): string {
  return randomBytes(16).toString('hex')
}

export function sortedQueryFromParams(params: Record<string, string>): string {
  return sortParamPairs(normalizeParamPairs(params))
    .map(([k, v]) => `${oauthPercentEncode(k)}=${oauthPercentEncode(v)}`)
    .join('&')
}

export function oauthTimestampSeconds(): string {
  return Math.floor(Date.now() / 1000).toString()
}

export function parseFormStyleBody(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of body.split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    const keyRaw = eq === -1 ? part : part.slice(0, eq)
    const valRaw = eq === -1 ? '' : part.slice(eq + 1)
    out[tryDecodeURIComponent(keyRaw)] = tryDecodeURIComponent(valRaw)
  }
  return out
}

const FLICKR_REQUEST_TOKEN_URL = 'https://www.flickr.com/services/oauth/request_token'
const FLICKR_ACCESS_TOKEN_URL = 'https://www.flickr.com/services/oauth/access_token'
export const FLICKR_AUTHORIZE_URL = 'https://www.flickr.com/services/oauth/authorize'

export async function flickrGetRequestToken(params: {
  consumerKey: string
  consumerSecret: string
  oauthCallback: string
}): Promise<{ oauthToken: string; oauthTokenSecret: string }> {
  const oauthParams: Record<string, string> = {
    oauth_callback: params.oauthCallback,
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: randomOAuthNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: oauthTimestampSeconds(),
    oauth_version: '1.0',
  }
  const base = buildSignatureBaseString('GET', FLICKR_REQUEST_TOKEN_URL, oauthParams)
  const signingKey = buildSigningKey(params.consumerSecret, '')
  oauthParams.oauth_signature = signHmacSha1Base64(base, signingKey)

  const qs = sortedQueryFromParams(oauthParams)
  const { body } = await got(`${FLICKR_REQUEST_TOKEN_URL}?${qs}`, flickrHttpOptions)
  const parsed = parseFormStyleBody(body)
  if (parsed.oauth_callback_confirmed !== 'true') {
    throw new Error('Flickr OAuth: oauth_callback not confirmed')
  }
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Flickr OAuth request_token failed: ${body}`)
  }
  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
  }
}

export async function flickrGetAccessToken(params: {
  consumerKey: string
  consumerSecret: string
  oauthToken: string
  oauthTokenSecret: string
  oauthVerifier: string
}): Promise<{
  oauthToken: string
  oauthTokenSecret: string
  userNsid: string
  username: string
  fullname: string
}> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: randomOAuthNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: oauthTimestampSeconds(),
    oauth_token: params.oauthToken,
    oauth_verifier: params.oauthVerifier,
    oauth_version: '1.0',
  }
  const base = buildSignatureBaseString('GET', FLICKR_ACCESS_TOKEN_URL, oauthParams)
  const signingKey = buildSigningKey(params.consumerSecret, params.oauthTokenSecret)
  oauthParams.oauth_signature = signHmacSha1Base64(base, signingKey)

  const qs = sortedQueryFromParams(oauthParams)
  const { body } = await got(`${FLICKR_ACCESS_TOKEN_URL}?${qs}`, flickrHttpOptions)
  const parsed = parseFormStyleBody(body)
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error(`Flickr OAuth access_token failed: ${body}`)
  }
  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
    userNsid: parsed.user_nsid ?? '',
    username: parsed.username ?? '',
    fullname: parsed.fullname ? parsed.fullname.replace(/\+/g, ' ') : '',
  }
}

export function buildFlickrAuthorizeUrl(oauthToken: string, perms: 'read' | 'write' | 'delete' = 'read'): string {
  const u = new URL(FLICKR_AUTHORIZE_URL)
  u.searchParams.set('oauth_token', oauthToken)
  u.searchParams.set('perms', perms)
  return u.toString()
}

export function flickrSignQuery(
  method: string,
  baseUrlNoQuery: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Record<string, string> {
  const oauthParams: Record<string, string> = { ...params }
  if (!oauthParams.oauth_consumer_key) {
    throw new Error('flickrSignQuery: oauth_consumer_key required in params')
  }
  if (!oauthParams.oauth_nonce) oauthParams.oauth_nonce = randomOAuthNonce()
  if (!oauthParams.oauth_signature_method) oauthParams.oauth_signature_method = 'HMAC-SHA1'
  if (!oauthParams.oauth_timestamp) oauthParams.oauth_timestamp = oauthTimestampSeconds()
  if (!oauthParams.oauth_version) oauthParams.oauth_version = '1.0'

  const base = buildSignatureBaseString(method, baseUrlNoQuery, oauthParams)
  const signingKey = buildSigningKey(consumerSecret, tokenSecret)
  oauthParams.oauth_signature = signHmacSha1Base64(base, signingKey)
  return oauthParams
}
