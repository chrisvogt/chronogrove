/** Max length for client-supplied return paths (path + query + optional hash). */
export const OAUTH_RETURN_TO_MAX_LEN = 768

/**
 * Same-origin relative return path only. Used to avoid open redirects after OAuth.
 * Allows path, query, and a single #fragment.
 */
export function validateReturnTo(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s.startsWith('/') || s.startsWith('//')) return null
  if (s.length > OAUTH_RETURN_TO_MAX_LEN) return null
  const noScheme = s.toLowerCase()
  if (noScheme.includes('://') || noScheme.startsWith('/\\')) return null
  if (/[\r\n\0]/.test(s)) return null

  const hashIdx = s.indexOf('#')
  const beforeHash = hashIdx === -1 ? s : s.slice(0, hashIdx)
  const pathPart = beforeHash.split('?')[0] ?? ''
  if (pathPart.includes('..')) return null

  return s
}

/**
 * Append Flickr OAuth result query params for UI flash. Preserves existing query keys
 * except overwrites oauth, status, and reason.
 */
export function withFlickrOAuthFlash(
  returnPath: string,
  status: 'success' | 'error',
  reason?: string
): string {
  const hashIdx = returnPath.indexOf('#')
  const beforeHash = hashIdx === -1 ? returnPath : returnPath.slice(0, hashIdx)
  const hash = hashIdx === -1 ? '' : returnPath.slice(hashIdx + 1)

  const qIdx = beforeHash.indexOf('?')
  const pathname = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx)
  const search = qIdx === -1 ? '' : beforeHash.slice(qIdx + 1)

  const params = new URLSearchParams(search)
  params.set('oauth', 'flickr')
  params.set('status', status)
  if (status === 'error' && reason != null && reason.length > 0) {
    params.set('reason', reason)
  }
  const qs = params.toString()
  const joined = qs ? `${pathname}?${qs}` : pathname
  return hash ? `${joined}#${hash}` : joined
}

/**
 * Append Discogs OAuth result query params for UI flash. Same rules as {@link withFlickrOAuthFlash}.
 */
export function withGitHubOAuthFlash(
  returnPath: string,
  status: 'success' | 'error',
  reason?: string
): string {
  const hashIdx = returnPath.indexOf('#')
  const beforeHash = hashIdx === -1 ? returnPath : returnPath.slice(0, hashIdx)
  const hash = hashIdx === -1 ? '' : returnPath.slice(hashIdx + 1)

  const qIdx = beforeHash.indexOf('?')
  const pathname = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx)
  const search = qIdx === -1 ? '' : beforeHash.slice(qIdx + 1)

  const params = new URLSearchParams(search)
  params.set('oauth', 'github')
  params.set('status', status)
  if (status === 'error' && reason != null && reason.length > 0) {
    params.set('reason', reason)
  }
  const qs = params.toString()
  const joined = qs ? `${pathname}?${qs}` : pathname
  return hash ? `${joined}#${hash}` : joined
}

export function withDiscogsOAuthFlash(
  returnPath: string,
  status: 'success' | 'error',
  reason?: string
): string {
  const hashIdx = returnPath.indexOf('#')
  const beforeHash = hashIdx === -1 ? returnPath : returnPath.slice(0, hashIdx)
  const hash = hashIdx === -1 ? '' : returnPath.slice(hashIdx + 1)

  const qIdx = beforeHash.indexOf('?')
  const pathname = qIdx === -1 ? beforeHash : beforeHash.slice(0, qIdx)
  const search = qIdx === -1 ? '' : beforeHash.slice(qIdx + 1)

  const params = new URLSearchParams(search)
  params.set('oauth', 'discogs')
  params.set('status', status)
  if (status === 'error' && reason != null && reason.length > 0) {
    params.set('reason', reason)
  }
  const qs = params.toString()
  const joined = qs ? `${pathname}?${qs}` : pathname
  return hash ? `${joined}#${hash}` : joined
}
