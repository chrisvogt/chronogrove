import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { chronogroveHttpUserAgent } from '../../config/chronogrove-http-user-agent.js'

// Mock firebase-functions logger
vi.mock('firebase-functions', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock fetch globally
global.fetch = vi.fn()

const discogsOAuthGotGetMock = vi.hoisted(() => vi.fn())

vi.mock('../../services/discogs-oauth1a.js', () => ({
  discogsOAuthGotGet: (...args: unknown[]) => discogsOAuthGotGetMock(...args),
}))

describe('fetchReleaseDetails', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    discogsOAuthGotGetMock.mockReset()
    global.fetch.mockReset()
    
    // Mock setTimeout to make tests run faster
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should successfully fetch release details', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default
    
    const mockReleaseData = {
      id: 28461454,
      title: 'The Rise & Fall Of A Midwest Princess',
      year: 2023,
      artists: [{ name: 'Chappell Roan' }],
      labels: [{ name: 'Island Records' }],
      genres: ['Pop'],
      styles: ['Indie Pop']
    }

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReleaseData
    })

    const result = await fetchReleaseDetails('https://api.discogs.com/releases/28461454', '28461454')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.discogs.com/releases/28461454?token=test-api-key',
      {
        headers: {
          'User-Agent': chronogroveHttpUserAgent
        }
      }
    )

    expect(result).toEqual(mockReleaseData)
  })

  it('should handle URLs that already contain token parameter', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default
    
    const mockReleaseData = { id: 123, title: 'Test Release' }

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReleaseData
    })

    const result = await fetchReleaseDetails('https://api.discogs.com/releases/123?token=existing-token', '123')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.discogs.com/releases/123?token=existing-token',
      {
        headers: {
          'User-Agent': chronogroveHttpUserAgent
        }
      }
    )

    expect(result).toEqual(mockReleaseData)
  })

  it('appends token with & when the resource URL already has query parameters', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')

    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default
    const mockReleaseData = { id: 7, title: 'With Query' }

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReleaseData,
    })

    await fetchReleaseDetails('https://api.discogs.com/releases/7?curr_abbr=USD', '7')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.discogs.com/releases/7?curr_abbr=USD&token=test-api-key',
      expect.objectContaining({
        headers: { 'User-Agent': chronogroveHttpUserAgent },
      }),
    )
  })

  it('should return null when API request fails', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })

    const result = await fetchReleaseDetails('https://api.discogs.com/releases/999999', '999999')

    expect(result).toBeNull()
  })

  it('should retry on 429 rate limit errors with exponential backoff', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default
    
    const mockReleaseData = { id: 123, title: 'Test Release' }

    // First two calls return 429, third call succeeds
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockReleaseData
      })

    const promise = fetchReleaseDetails('https://api.discogs.com/releases/123', '123')
    
    // Fast-forward through the delays
    await vi.runAllTimersAsync()
    
    const result = await promise

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual(mockReleaseData)
  })

  it('should return null after max retries on 429 errors', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default

    // All calls return 429
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    })

    const promise = fetchReleaseDetails('https://api.discogs.com/releases/123', '123', 2)
    
    // Fast-forward through the delays
    await vi.runAllTimersAsync()
    
    const result = await promise

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result).toBeNull()
  })

  it('should return null when fetch throws an error', async () => {
    vi.stubEnv('DISCOGS_API_KEY', 'test-api-key')
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default

    fetch.mockRejectedValue(new Error('Network error'))

    const promise = fetchReleaseDetails('https://api.discogs.com/releases/123', '123')
    
    // Fast-forward through the delays
    await vi.runAllTimersAsync()
    
    const result = await promise

    expect(result).toBeNull()
  })

  it('should throw error when DISCOGS_API_KEY is missing', async () => {
    vi.unstubAllEnvs()
    
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default

    await expect(fetchReleaseDetails('https://api.discogs.com/releases/123', '123'))
      .rejects.toThrow('Missing required environment variable: DISCOGS_API_KEY')
  })

  it('uses OAuth signed GET when oauth auth is passed', async () => {
    vi.unstubAllEnvs()
    const mockReleaseData = { id: 99, title: 'OAuth Release' }
    discogsOAuthGotGetMock.mockResolvedValue({ body: JSON.stringify(mockReleaseData) })
    const fetchReleaseDetails = (await import('./fetch-release-details.js')).default
    const oauth = {
      mode: 'oauth' as const,
      consumerKey: 'ck',
      consumerSecret: 'cs',
      discogsUsername: 'u',
      oauthToken: 'ot',
      oauthTokenSecret: 'ots',
    }
    const url = 'https://api.discogs.com/releases/99'
    const result = await fetchReleaseDetails(url, '99', 3, oauth)
    expect(discogsOAuthGotGetMock).toHaveBeenCalledWith(url, {
      consumerKey: 'ck',
      consumerSecret: 'cs',
      oauthToken: 'ot',
      oauthTokenSecret: 'ots',
    })
    expect(result).toEqual(mockReleaseData)
    expect(fetch).not.toHaveBeenCalled()
  })
})
