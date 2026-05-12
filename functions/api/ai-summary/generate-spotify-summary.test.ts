import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import generateSpotifySummary from './generate-spotify-summary.js'

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

describe('generateSpotifySummary', () => {
  const mockData = {
    metrics: [{ displayName: 'Playlists', id: 'playlists-count', value: 3 }],
    playlists: [{ name: 'Ambient', public: true, trackCount: 40 }],
    profile: { displayName: 'Listener', profileURL: 'https://open.spotify.com/user/x' },
    topTracks: [{ artists: ['A'], name: 'Track 1' }],
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
        assistantJson('```json\n{"response": "<p>Mock listening summary.</p>"}\n```'),
    })
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns assistant HTML when the API responds with JSON', async () => {
    const result = await generateSpotifySummary(mockData)
    expect(result).toBe('<p>Mock listening summary.</p>')
  })

  it('renders empty profile placeholders in the prompt when names are missing', async () => {
    await generateSpotifySummary({
      ...mockData,
      profile: {},
    })
    const init = mockFetch.mock.calls[0]?.[1] as FetchCallInit
    const parsed = JSON.parse(init.body as string) as { messages?: { content?: string }[] }
    const userMsg = parsed.messages?.[0]?.content ?? ''
    expect(userMsg).toMatch(/Spotify profile display name:\s*/)
    expect(userMsg).toContain('Profile URL (context only')
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY

    await expect(generateSpotifySummary(mockData)).rejects.toThrow(
      'ANTHROPIC_API_KEY environment variable is required',
    )
  })

  it('sends playlist and track payload in the user message', async () => {
    await generateSpotifySummary(mockData)
    const init = mockFetch.mock.calls[0]?.[1] as FetchCallInit
    const parsed = JSON.parse(init.body as string) as { messages?: { content?: string }[] }
    const userMsg = parsed.messages?.[0]?.content ?? ''
    expect(userMsg).toContain('Ambient')
    expect(userMsg).toContain('Track 1')
    expect(userMsg).toContain('First person')
  })

  it('should rethrow API errors with cause', async () => {
    const { logger } = await import('firebase-functions')
    const apiError = new Error('API quota exceeded')
    mockFetch.mockRejectedValueOnce(apiError)

    await expect(generateSpotifySummary(mockData)).rejects.toMatchObject({
      message: 'Failed to generate AI summary: API quota exceeded',
      cause: apiError,
    })
    expect(logger.error).toHaveBeenCalledWith('Error generating Spotify AI summary:', apiError)
  })

  it('should rethrow when model response is not valid JSON', async () => {
    const { logger } = await import('firebase-functions')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson('not valid json at all'),
    })

    await expect(generateSpotifySummary(mockData)).rejects.toMatchObject({
      message: expect.stringContaining('Failed to generate AI summary'),
      cause: {
        message: 'Model response was not valid JSON (no markdown block or raw JSON)',
      },
    })
    expect(logger.error).toHaveBeenCalledWith(
      'Error generating Spotify AI summary:',
      expect.any(Error),
    )
  })

  it('logs structured assistant fields when JSON extraction fails', async () => {
    const { logger } = await import('firebase-functions')
    const assistantText = 'Plain prose with no parseable JSON object in sight.'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson(assistantText),
    })

    await expect(generateSpotifySummary(mockData)).rejects.toMatchObject({
      cause: {
        message: 'Model response was not valid JSON (no markdown block or raw JSON)',
      },
    })

    expect(logger.error).toHaveBeenCalledWith(
      'Spotify AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
      expect.objectContaining({
        charLength: assistantText.length,
        trimmedLength: assistantText.trim().length,
        firstCurlyIndex: -1,
        lastCurlyIndex: -1,
        hasMarkdownFence: false,
        head: assistantText,
      }),
    )
  })

  it('parse-failure log omits tail for short assistant text', async () => {
    const { logger } = await import('firebase-functions')
    const shortText = 'too short for tail slice'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson(shortText),
    })

    await expect(generateSpotifySummary(mockData)).rejects.toThrow()

    const parseFailCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) =>
        call[0] ===
        'Spotify AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
    )
    const payload = parseFailCall![1] as { tail?: string; charLength: number }
    expect(payload.charLength).toBeLessThan(3100)
    expect(payload.tail).toBeUndefined()
  })

  it('includes tail in parse-failure log when assistant text is longer than head plus tail', async () => {
    const { logger } = await import('firebase-functions')
    const longNonsense = 'b'.repeat(4000)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson(longNonsense),
    })

    await expect(generateSpotifySummary(mockData)).rejects.toMatchObject({
      cause: {
        message: 'Model response was not valid JSON (no markdown block or raw JSON)',
      },
    })

    const parseFailCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) =>
        call[0] ===
        'Spotify AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
    )
    expect(parseFailCall).toBeDefined()
    const payload = parseFailCall![1] as { head: string; tail: string; charLength: number }
    expect(payload.charLength).toBe(4000)
    expect(payload.head).toBe(longNonsense.slice(0, 2400))
    expect(payload.tail).toBe(longNonsense.slice(-700))
  })

  it('returns empty string when response JSON field is not a string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        assistantJson('```json\n{"response": {"html": "<p>nested</p>"}}\n```'),
    })

    await expect(generateSpotifySummary(mockData)).resolves.toBe('')
  })

  it('wraps non-Error rejections from the AI summary request', async () => {
    mockFetch.mockRejectedValueOnce('rate limited')

    await expect(generateSpotifySummary(mockData)).rejects.toMatchObject({
      message: 'Failed to generate AI summary: rate limited',
    })
  })

  it('surfaces HTTP error bodies from the AI summary API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }),
    })

    await expect(generateSpotifySummary(mockData)).rejects.toThrow(
      'Failed to generate AI summary: AI summary API error (401): invalid x-api-key',
    )
  })

  it('formats unknown errors with object message and JSON fallbacks', async () => {
    mockFetch.mockRejectedValueOnce({ message: 404 })

    await expect(generateSpotifySummary(mockData)).rejects.toThrow(
      'Failed to generate AI summary: {"message":404}',
    )
  })

  it('uses string message property on non-Error rejections', async () => {
    mockFetch.mockRejectedValueOnce({ message: 'from nested message' })

    await expect(generateSpotifySummary(mockData)).rejects.toThrow(
      'Failed to generate AI summary: from nested message',
    )
  })

  it('uses Unknown error when JSON.stringify fails on a thrown value', async () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    mockFetch.mockRejectedValueOnce(circular)

    await expect(generateSpotifySummary(mockData)).rejects.toThrow(
      'Failed to generate AI summary: Unknown error',
    )
  })
})
