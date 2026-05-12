import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import generateDiscogsSummary, { buildDiscogsSummaryInput } from './generate-discogs-summary.js'
import type { DiscogsTransformedRelease } from '../../types/discogs.js'

type FetchCallInit = { body?: string }

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

const sampleRelease = (i: number): DiscogsTransformedRelease => ({
  basicInformation: {
    artists: [{ name: `Artist ${i}` }],
    formats: [{ name: 'Vinyl, LP' }],
    genres: ['Electronic'],
    styles: ['Techno'],
    title: `Album ${i}`,
    year: 1990 + i,
  },
  dateAdded: `2024-${String(i + 1).padStart(2, '0')}-15T12:00:00.000Z`,
  id: i,
})

describe('buildDiscogsSummaryInput', () => {
  it('aggregates genres and sorts recent releases', () => {
    const input = buildDiscogsSummaryInput([sampleRelease(1), sampleRelease(2)], 2, 'https://discogs.example/u')
    expect(input.collectionTotal).toBe(2)
    expect(input.genreCounts.Electronic).toBe(2)
    expect(input.recentReleases.length).toBe(2)
    expect(input.recentReleases[0].title).toBe('Album 2')
  })

  it('skips rows without basicInformation', () => {
    const input = buildDiscogsSummaryInput(
      [{ id: 9 } as DiscogsTransformedRelease, sampleRelease(1)],
      2,
      undefined,
    )
    expect(input.recentReleases.length).toBe(1)
    expect(input.profileURL).toBeUndefined()
  })

  it('uses unknown decade for invalid years and caps recent list at 72', () => {
    const many: DiscogsTransformedRelease[] = []
    for (let n = 0; n < 80; n += 1) {
      many.push({
        basicInformation: {
          artists: [{ name: 'X' }],
          formats: [{ name: 'CD' }],
          genres: ['Rock'],
          styles: [],
          title: `T${n}`,
          year: n === 0 ? 0 : 1980,
        },
        dateAdded: `2025-01-${String((n % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
        id: n,
      })
    }
    const input = buildDiscogsSummaryInput(many, 80, undefined)
    expect(input.decadeCounts.unknown).toBeGreaterThanOrEqual(1)
    expect(input.recentReleases.length).toBe(72)
  })

  it('parses artists, formats, and tags loosely', () => {
    const input = buildDiscogsSummaryInput(
      [
        {
          basicInformation: {
            artists: [{ name: '' }, 'oops' as unknown as { name: string }, { name: 'Valid' }],
            formats: [{ name: 'LP' }, {} as { name: string }],
            genres: ['  Jazz ', 3 as unknown as string],
            styles: [' Dub '],
            title: 'T',
            year: undefined,
          },
          dateAdded: 'not-a-date' as unknown as string,
          id: 1,
        },
      ],
      1,
      'https://example.com',
    )
    expect(input.genreCounts.Jazz).toBe(1)
    expect(input.styleCounts.Dub).toBe(1)
    expect(input.recentReleases[0].artists).toContain('Valid')
    expect(input.recentReleases[0].formats).toContain('LP')
  })

  it('handles null genre/style arrays, valid decades, and date sorting', () => {
    const older: DiscogsTransformedRelease = {
      basicInformation: {
        artists: null as unknown as DiscogsTransformedRelease['basicInformation']['artists'],
        formats: null as unknown as DiscogsTransformedRelease['basicInformation']['formats'],
        genres: null as unknown as DiscogsTransformedRelease['basicInformation']['genres'],
        styles: undefined,
        title: 'Older',
        year: 1995,
      },
      dateAdded: '2019-06-01T00:00:00.000Z',
      id: 1,
    }
    const newer: DiscogsTransformedRelease = {
      basicInformation: {
        artists: [{ name: 'Z' }],
        formats: [{ name: 'CD' }],
        genres: ['Soul'],
        styles: [],
        title: 'Newer',
        year: 2001,
      },
      dateAdded: '2020-01-01T00:00:00.000Z',
      id: 2,
    }
    const input = buildDiscogsSummaryInput([older, newer], 2, undefined)
    expect(input.decadeCounts['1990s']).toBe(1)
    expect(input.decadeCounts['2000s']).toBe(1)
    expect(input.genreCounts.Soul).toBe(1)
    expect(input.recentReleases[0].title).toBe('Newer')
    expect(input.recentReleases[1].title).toBe('Older')
  })
})

describe('generateDiscogsSummary', () => {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  const summaryInput = buildDiscogsSummaryInput([sampleRelease(1)], 1, 'https://discogs.example/u')

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        assistantJson('```json\n{"response": "<p>Mock collection summary.</p>"}\n```'),
    })
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('parse-failure log omits tail for short assistant text', async () => {
    const { logger } = await import('firebase-functions')
    const shortText = 'plain short'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson(shortText),
    })

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow()

    const parseFailCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) =>
        call[0] ===
        'Discogs AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
    )
    const payload = parseFailCall![1] as { tail?: string; charLength: number }
    expect(payload.charLength).toBeLessThan(3100)
    expect(payload.tail).toBeUndefined()
  })

  it('returns assistant HTML when the API responds with JSON', async () => {
    const result = await generateDiscogsSummary(summaryInput)
    expect(result).toBe('<p>Mock collection summary.</p>')
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow(
      'ANTHROPIC_API_KEY environment variable is required',
    )
  })

  it('includes decade rollups in the prompt', async () => {
    await generateDiscogsSummary(summaryInput)
    const init = mockFetch.mock.calls[0]?.[1] as FetchCallInit
    const parsed = JSON.parse(init.body ?? '{}') as { messages?: { content?: string }[] }
    const userMsg = parsed.messages?.[0]?.content ?? ''
    expect(userMsg).toContain('decadeCounts')
    expect(userMsg).toContain('recentReleases')
  })

  it('should rethrow API errors with cause', async () => {
    const { logger } = await import('firebase-functions')
    const apiError = new Error('rate limit')
    mockFetch.mockRejectedValueOnce(apiError)

    await expect(generateDiscogsSummary(summaryInput)).rejects.toMatchObject({
      cause: apiError,
    })
    expect(logger.error).toHaveBeenCalledWith('Error generating Discogs AI summary:', apiError)
  })

  it('logs and throws when assistant text is not parseable JSON', async () => {
    const { logger } = await import('firebase-functions')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson('no json here'),
    })

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow(
      'Failed to generate AI summary:',
    )
    expect(logger.error).toHaveBeenCalledWith(
      'Discogs AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
      expect.any(Object),
    )
  })

  it('includes tail in parse-failure log for very long assistant text', async () => {
    const { logger } = await import('firebase-functions')
    const longNonsense = 'x'.repeat(4000)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson(longNonsense),
    })

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow()

    const parseFailCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) =>
        call[0] ===
        'Discogs AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
    )
    const payload = parseFailCall![1] as { tail?: string; head: string }
    expect(payload.head.length).toBe(2400)
    expect(payload.tail).toBe(longNonsense.slice(-700))
  })

  it('returns empty string when response is not a string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantJson('```json\n{"response": 42}\n```'),
    })

    await expect(generateDiscogsSummary(summaryInput)).resolves.toBe('')
  })

  it('wraps string rejection from fetch', async () => {
    mockFetch.mockRejectedValueOnce('offline')

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow(
      'Failed to generate AI summary: offline',
    )
  })

  it('uses nested string message on non-Error rejection', async () => {
    mockFetch.mockRejectedValueOnce({ message: 'nested msg' })

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow(
      'Failed to generate AI summary: nested msg',
    )
  })

  it('stringifies object message when not a string', async () => {
    mockFetch.mockRejectedValueOnce({ message: 404 })

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow(
      'Failed to generate AI summary: {"message":404}',
    )
  })

  it('uses Unknown error for circular rejection in outer catch', async () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    mockFetch.mockRejectedValueOnce(circular)

    await expect(generateDiscogsSummary(summaryInput)).rejects.toThrow(
      'Failed to generate AI summary: Unknown error',
    )
  })
})
