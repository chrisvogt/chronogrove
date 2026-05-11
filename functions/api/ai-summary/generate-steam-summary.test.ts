import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import generateSteamSummary from './generate-steam-summary.js'

type FetchCallInit = { body?: string; method?: string; headers?: Record<string, string> }

vi.mock('firebase-functions', () => ({
  logger: { error: vi.fn() },
}))

const assistantJson = (text: string) =>
  JSON.stringify({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
  })

describe('generateSteamSummary', () => {
  const mockSteamData = {
    collections: {
      recentlyPlayedGames: [
        {
          displayName: 'Cyberpunk 2077',
          playTime2Weeks: 120,
          playTimeForever: 500,
        },
        {
          displayName: 'Elden Ring',
          playTime2Weeks: 90,
          playTimeForever: 300,
        },
      ],
      ownedGames: [
        {
          displayName: 'Cyberpunk 2077',
          playTimeForever: 500,
        },
        {
          displayName: 'Elden Ring',
          playTimeForever: 300,
        },
        {
          displayName: 'Witcher 3',
          playTimeForever: 800,
        },
      ],
    },
    profile: {
      displayName: 'TestGamer',
    },
    metrics: [
      {
        id: 'owned-games-count',
        value: 50,
      },
    ],
  }

  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        assistantJson(
          '```json\n{"response": "Mock AI summary of gaming activity", "debug": {"recentlyPlayedGames": [], "topPlayedGames": []}}\n```',
        ),
    })
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should generate a summary when valid data is provided', async () => {
    const result = await generateSteamSummary(mockSteamData)

    expect(result).toBe('Mock AI summary of gaming activity')
  })

  it('should throw error when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY

    await expect(generateSteamSummary(mockSteamData)).rejects.toThrow(
      'ANTHROPIC_API_KEY environment variable is required',
    )
  })

  it('uses zero for missing playtime fields when building the prompt', async () => {
    await generateSteamSummary({
      collections: {
        recentlyPlayedGames: [{ displayName: 'NoPlaytimeFields' }],
        ownedGames: [{ displayName: 'AlsoNoPlaytime' }],
      },
      profile: { displayName: 'Tester' },
      metrics: [],
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const init = mockFetch.mock.calls[0][1] as FetchCallInit
    const prompt = JSON.parse(init.body as string).messages[0].content as string
    expect(prompt).toMatch(/"playTime2Weeks"\s*:\s*0/)
    expect(prompt).toMatch(/"playTimeForever"\s*:\s*0/)
  })

  it('should handle empty collections gracefully', async () => {
    const emptyData = {
      collections: {
        recentlyPlayedGames: [],
        ownedGames: [],
      },
      profile: {
        displayName: 'TestGamer',
      },
      metrics: [],
    }

    const result = await generateSteamSummary(emptyData)

    expect(result).toBe('Mock AI summary of gaming activity')
  })

  it('should rethrow API errors with cause', async () => {
    const { logger } = await import('firebase-functions')
    const apiError = new Error('API quota exceeded')
    mockFetch.mockRejectedValueOnce(apiError)

    await expect(generateSteamSummary(mockSteamData)).rejects.toMatchObject({
      message: 'Failed to generate AI summary: API quota exceeded',
      cause: apiError,
    })
    expect(logger.error).toHaveBeenCalledWith('Error generating Steam AI summary:', apiError)
  })

  it('should rethrow when model response is not valid JSON', async () => {
    const { logger } = await import('firebase-functions')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson('not valid json at all'),
    })

    await expect(generateSteamSummary(mockSteamData)).rejects.toMatchObject({
      message: expect.stringContaining('Failed to generate AI summary'),
      cause: {
        message: 'Model response was not valid JSON (no markdown block or raw JSON)',
      },
    })
    expect(logger.error).toHaveBeenCalledWith(
      'Error generating Steam AI summary:',
      expect.any(Error),
    )
  })

  it('should rethrow when fenced JSON is empty (unparseable object)', async () => {
    const { logger } = await import('firebase-functions')
    // Empty fenced body: jsonrepair can salvage many broken `{...}` snippets; use this for deterministic null from extractJsonFromAiResponse.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson('```json\n\n```'),
    })

    await expect(generateSteamSummary(mockSteamData)).rejects.toMatchObject({
      message: expect.stringContaining('Failed to generate AI summary'),
      cause: {
        message: 'Model response was not valid JSON (no markdown block or raw JSON)',
      },
    })
    expect(logger.error).toHaveBeenCalledWith(
      'Error generating Steam AI summary:',
      expect.any(Error),
    )
  })

  it('returns empty string when response JSON field is not a string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        assistantJson('```json\n{"response": {"html": "<p>nested</p>"}, "debug": {}}\n```'),
    })

    await expect(generateSteamSummary(mockSteamData)).resolves.toBe('')
  })

  it('wraps non-Error rejections from the AI summary request', async () => {
    mockFetch.mockRejectedValueOnce('rate limited')

    await expect(generateSteamSummary(mockSteamData)).rejects.toMatchObject({
      message: 'Failed to generate AI summary: rate limited',
    })
  })

  it('surfaces HTTP error bodies from the AI summary API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }),
    })

    await expect(generateSteamSummary(mockSteamData)).rejects.toThrow(
      'Failed to generate AI summary: AI summary API error (401): invalid x-api-key',
    )
  })

  it('formats unknown errors with object message and JSON fallbacks in the thrown wrapper', async () => {
    mockFetch.mockRejectedValueOnce({ message: 404 })

    await expect(generateSteamSummary(mockSteamData)).rejects.toThrow(
      'Failed to generate AI summary: {"message":404}',
    )
  })

  it('uses Unknown error when JSON.stringify fails on a thrown value', async () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    mockFetch.mockRejectedValueOnce(circular)

    await expect(generateSteamSummary(mockSteamData)).rejects.toThrow(
      'Failed to generate AI summary: Unknown error',
    )
  })
})
