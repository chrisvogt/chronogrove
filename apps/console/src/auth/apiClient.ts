/** Optional Firebase ID token for `Authorization: Bearer` (same as manual sync SSE). Prefer this when the HttpOnly session cookie is present but server-side `verifySessionCookie` fails through Hosting. */
export type ApiClientAuth = { idToken: string }

/** Matches `API_ERROR_EMAIL_NOT_VERIFIED` from the Functions API session route. */
export const API_ERROR_EMAIL_NOT_VERIFIED = 'email_not_verified' as const

export class SessionCreateError extends Error {
  readonly status: number
  readonly errorCode?: string

  constructor(message: string, status: number, errorCode?: string) {
    super(message)
    this.name = 'SessionCreateError'
    this.status = status
    this.errorCode = errorCode
  }
}

export class ApiClient {
  constructor(private readonly baseUrl = '') {}

  getAuthToken(): string | null {
    const sessionCookie = this.getSessionCookie()
    if (sessionCookie) return sessionCookie
    return typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null
  }

  getSessionCookie(): string | null {
    return this.getCookieValue('session')
  }

  getCookieValue(name: string): string | null {
    if (typeof document === 'undefined') return null
    for (const cookie of document.cookie.split(';')) {
      const trimmedCookie = cookie.trim()
      const separatorIndex = trimmedCookie.indexOf('=')
      if (separatorIndex === -1) continue

      const cookieName = trimmedCookie.slice(0, separatorIndex)
      const value = trimmedCookie.slice(separatorIndex + 1)

      if (cookieName === name) {
        try {
          return decodeURIComponent(value)
        } catch {
          return value
        }
      }
    }
    return null
  }

  /**
   * @param forceRefresh — If true, always `GET /api/csrf-token` so the header token matches the
   * current `_csrfSecret` cookie. Reusing a stale `XSRF-TOKEN` alone causes "CSRF token mismatch".
   */
  async getCsrfToken(forceRefresh = false): Promise<string | null> {
    if (!forceRefresh) {
      const existingToken = this.getCookieValue('XSRF-TOKEN')
      if (existingToken) return existingToken
    }

    const res = await fetch(`${this.baseUrl}/api/csrf-token`, {
      credentials: 'include',
      cache: 'no-store',
    })

    if (!res.ok) {
      throw new Error(`CSRF token request failed: ${res.status}`)
    }

    const payload = await res.json().catch(() => ({} as { csrfToken?: string }))
    return this.getCookieValue('XSRF-TOKEN') ?? payload.csrfToken ?? null
  }

  /**
   * Server-side clear of the HttpOnly `session` cookie (client JS cannot remove it).
   * Call when switching Firebase accounts so API requests match the current user.
   */
  async clearStaleSessionCookie(): Promise<void> {
    try {
      const csrfToken = await this.getCsrfToken(true)
      await fetch(`${this.baseUrl}/api/auth/clear-session-cookie`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
        },
      })
    } catch {
      /* best-effort */
    }
  }

  async createSession(token: string): Promise<{ ok: boolean; message?: string }> {
    const csrfToken = await this.getCsrfToken()
    const res = await fetch(`${this.baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      },
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }))
      const code = typeof body.error === 'string' ? body.error : undefined
      throw new SessionCreateError(
        code ?? `Session failed: ${res.status}`,
        res.status,
        code
      )
    }
    return res.json() as Promise<{ ok: boolean; message?: string }>
  }

  clearSession(): void {
    if (typeof document !== 'undefined') {
      document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      localStorage.removeItem('authToken')
    }
  }

  getAuthorizationHeader(): Record<string, string> {
    const token = this.getAuthToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private bearerFrom(auth?: ApiClientAuth): string | null {
    return auth?.idToken ?? this.getAuthToken()
  }

  async getJson(path: string, auth?: ApiClientAuth): Promise<Response> {
    const bearer = this.bearerFrom(auth)
    return fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: {
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
    })
  }

  async putJson(path: string, body: unknown, auth?: ApiClientAuth): Promise<Response> {
    const csrfToken = await this.getCsrfToken(true)
    const bearer = this.bearerFrom(auth)
    return fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    })
  }

  async deleteJson(path: string, auth?: ApiClientAuth): Promise<Response> {
    const csrfToken = await this.getCsrfToken(true)
    const bearer = this.bearerFrom(auth)
    return fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      },
      credentials: 'include',
    })
  }

  async postJson(path: string, body: unknown, auth?: ApiClientAuth): Promise<Response> {
    const csrfToken = await this.getCsrfToken(true)
    const bearer = this.bearerFrom(auth)
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body ?? {}),
    })
  }

  async patchJson(path: string, body: unknown, auth?: ApiClientAuth): Promise<Response> {
    const csrfToken = await this.getCsrfToken(true)
    const bearer = this.bearerFrom(auth)
    return fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    })
  }

  async logout(): Promise<void> {
    try {
      const csrfToken = await this.getCsrfToken()
      await fetch(`${this.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.getAuthToken()}`,
          ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
        },
        credentials: 'include',
      })
    } finally {
      this.clearSession()
    }
  }
}

export const apiClient = new ApiClient()
