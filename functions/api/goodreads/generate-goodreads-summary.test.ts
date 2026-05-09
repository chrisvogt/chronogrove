import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import generateGoodreadsSummary from './generate-goodreads-summary.js'

type FetchCallInit = { body?: string; method?: string; headers?: Record<string, string> }

vi.mock('firebase-functions', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

import { logger } from 'firebase-functions'

const assistantPayload = (text: string) =>
  JSON.stringify({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
  })

describe('generateGoodreadsSummary', () => {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    mockFetch.mockReset()
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    process.env = originalEnv
    globalThis.fetch = originalFetch
  })

  const mockAiSummaryText = (text: string) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => assistantPayload(text),
    })
  }

  const lastUserPrompt = (): string => {
    const init = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1] as FetchCallInit
    return JSON.parse(init.body as string).messages[0].content as string
  }

  it('should throw error when ANTHROPIC_API_KEY is not provided', async () => {
    delete process.env.ANTHROPIC_API_KEY

    await expect(generateGoodreadsSummary({})).rejects.toThrow(
      'ANTHROPIC_API_KEY environment variable is required',
    )
  })

  it('should generate AI summary successfully', async () => {
    const mockGoodreadsData = {
      collections: {
        recentlyReadBooks: [
          {
            title: 'The Great Gatsby',
            authors: ['F. Scott Fitzgerald'],
            rating: 4,
            categories: ['Fiction', 'Classic'],
            pageCount: 180,
          },
          {
            title: 'Sapiens',
            authors: ['Yuval Noah Harari'],
            rating: 5,
            categories: ['Non-fiction', 'History'],
            pageCount: 443,
          },
        ],
      },
      profile: {
        displayName: 'Chris Vogt',
      },
    }

    const mockResponseText = `\`\`\`json
{
  "response": "<p>Chris has been exploring a diverse range of literature lately.</p><p>Recent reads include both classic fiction and contemporary non-fiction.</p>",
  "debug": {
    "recentlyReadBooks": [{"title": "The Great Gatsby", "authors": ["F. Scott Fitzgerald"], "rating": 4}],
    "readingPatterns": ["fiction", "non-fiction"]
  }
}
\`\`\``

    mockAiSummaryText(mockResponseText)

    const result = await generateGoodreadsSummary(mockGoodreadsData)

    expect(result).toBe(
      '<p>Chris has been exploring a diverse range of literature lately.</p><p>Recent reads include both classic fiction and contemporary non-fiction.</p>',
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
    const init = mockFetch.mock.calls[0][1] as FetchCallInit
    const body = JSON.parse(init.body as string) as { model: string; messages: { content: string }[] }
    expect(body.model).toBeTruthy()
    expect(body.messages[0].content).toContain('chrisvogt.me')
  })

  it('should handle missing collections gracefully', async () => {
    const mockGoodreadsData = {
      profile: {
        displayName: 'Chris Vogt',
      },
    }

    const mockResponseText = `\`\`\`json
{
  "response": "<p>Chris's reading activity data is currently unavailable.</p>",
  "debug": {
    "recentlyReadBooks": [],
    "readingPatterns": []
  }
}
\`\`\``

    mockAiSummaryText(mockResponseText)

    const result = await generateGoodreadsSummary(mockGoodreadsData)

    expect(result).toBe('<p>Chris\'s reading activity data is currently unavailable.</p>')

    const prompt = lastUserPrompt()
    expect(prompt).toContain('"recentlyReadBooksForWidget": []')
    expect(prompt).toContain('"completeReadShelf": []')
  })

  it('should handle missing profile gracefully', async () => {
    const mockGoodreadsData = {
      collections: {
        recentlyReadBooks: [],
      },
    }

    const mockResponseText = `\`\`\`json
{
  "response": "<p>Reading activity summary unavailable.</p>",
  "debug": {}
}
\`\`\``

    mockAiSummaryText(mockResponseText)

    const result = await generateGoodreadsSummary(mockGoodreadsData)

    expect(result).toBe('<p>Reading activity summary unavailable.</p>')

    expect(lastUserPrompt()).toContain('Chris Vogt')
  })

  it('should handle malformed JSON response', async () => {
    const mockGoodreadsData = {
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    }

    // Empty fenced body (jsonrepair can "fix" `{ invalid json here` into an object, so do not use that)
    const mockResponseText = '```json\n\n```'

    mockAiSummaryText(mockResponseText)

    try {
      await generateGoodreadsSummary(mockGoodreadsData)
      throw new Error('Expected rejection')
    } catch (err) {
      expect(err.message).toContain('Failed to generate AI summary')
      expect(err.cause).toBeDefined()
    }
    expect(logger.error).toHaveBeenCalledWith(
      'Error generating Goodreads AI summary:',
      expect.any(Error),
    )
  })

  it('should handle response without JSON markdown blocks', async () => {
    const mockGoodreadsData = {
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    }

    mockAiSummaryText('Just plain text without JSON blocks')

    try {
      await generateGoodreadsSummary(mockGoodreadsData)
      throw new Error('Expected rejection')
    } catch (err) {
      expect(err.message).toContain('Failed to generate AI summary')
      expect(err.cause).toBeDefined()
    }
  })

  it('should accept raw JSON response when the model does not wrap in markdown', async () => {
    const mockGoodreadsData = {
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    }

    mockAiSummaryText('{"response": "<p>Raw JSON summary.</p>", "debug": {}}')

    const result = await generateGoodreadsSummary(mockGoodreadsData)
    expect(result).toBe('<p>Raw JSON summary.</p>')
  })

  it('should handle AI summary API errors', async () => {
    const mockGoodreadsData = {
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    }

    const apiError = new Error('API quota exceeded')
    mockFetch.mockRejectedValueOnce(apiError)

    await expect(generateGoodreadsSummary(mockGoodreadsData)).rejects.toThrow(
      'Failed to generate AI summary: API quota exceeded',
    )
    expect(logger.error).toHaveBeenCalledWith(
      'Error generating Goodreads AI summary:',
      apiError,
    )
  })

  it('wraps non-Error rejections from the AI summary request', async () => {
    mockFetch.mockRejectedValueOnce('rate limited')

    await expect(
      generateGoodreadsSummary({ collections: { recentlyReadBooks: [] }, profile: {} }),
    ).rejects.toMatchObject({
      message: 'Failed to generate AI summary: rate limited',
    })
  })

  it('should handle response missing required fields', async () => {
    const mockGoodreadsData = {
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    }

    const mockResponseText = `\`\`\`json
{
  "debug": {
    "recentlyReadBooks": []
  }
}
\`\`\``

    mockAiSummaryText(mockResponseText)

    const result = await generateGoodreadsSummary(mockGoodreadsData)

    expect(result).toBe('')
  })

  it('should include comprehensive book data in prompt', async () => {
    const mockGoodreadsData = {
      collections: {
        recentlyReadBooks: [
          {
            title: 'Dune',
            authors: ['Frank Herbert'],
            rating: 5,
            categories: ['Science Fiction'],
            pageCount: 688,
          },
        ],
      },
      profile: {
        displayName: 'Test User',
      },
    }

    const mockResponseText = `\`\`\`json
{
  "response": "<p>Test summary</p>",
  "debug": {}
}
\`\`\``

    mockAiSummaryText(mockResponseText)

    await generateGoodreadsSummary(mockGoodreadsData)

    const promptCall = lastUserPrompt()

    expect(promptCall).toContain('"title":"Dune"')
    expect(promptCall).toContain('"authors":["Frank Herbert"]')
    expect(promptCall).toContain('"rating":5')
    expect(promptCall).toContain('"categories":["Science Fiction"]')
    expect(promptCall).toContain('"pageCount":688')

    expect(promptCall).toContain('chrisvogt.me')
    expect(promptCall).toContain('Two or three')
    expect(promptCall).toContain('Third person')
  })

  it('returns trimmed text when the model response has no paragraph tags', async () => {
    mockAiSummaryText('{"response": "  Plain fallback copy.  ", "debug": {}}')

    const result = await generateGoodreadsSummary({
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    })

    expect(result).toBe('Plain fallback copy.')
  })

  it('keeps all <p> elements when the model returns two or three paragraphs', async () => {
    mockAiSummaryText(
      `\`\`\`json
{
  "response": "<p>First graph.</p><p>Second graph.</p><p>Third graph.</p>",
  "debug": {}
}
\`\`\``,
    )

    const result = await generateGoodreadsSummary({
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    })

    expect(result).toBe('<p>First graph.</p><p>Second graph.</p><p>Third graph.</p>')
  })

  it('maps sparse widget books into completeReadShelf and omits categories when absent', async () => {
    mockAiSummaryText('{"response":"<p>x</p><p>y</p>","debug":{}}')

    const sparseBook: import('../../types/goodreads.js').GoodreadsRecentlyReadBook = {
      id: 'vol1',
      title: 'Minimal Vol',
      cdnMediaURL: 'https://cdn.example/x',
      mediaDestinationPath: 'books/vol1.jpg',
      smallThumbnail: '',
      thumbnail: '',
      categories: [],
    }
    delete (sparseBook as { authors?: string[] }).authors
    delete (sparseBook as { isbn?: string | null }).isbn
    delete (sparseBook as { rating?: string | null }).rating
    delete (sparseBook as { categories?: string[] }).categories

    await generateGoodreadsSummary(
      {
        collections: {
          recentlyReadBooks: [sparseBook],
        },
        profile: { username: 'chrisvogt', readCount: 0 },
      },
      { fullReadShelf: [] },
    )

    const promptCall = lastUserPrompt()
    expect(promptCall).toContain('Goodreads Profile: chrisvogt')
    expect(promptCall).toContain('"authors":[]')
    expect(promptCall).toContain('"isbn":null')
    expect(promptCall).toContain('"rating":null')
    expect(promptCall).toContain('"categories":[]')
    expect(promptCall).toContain('"completeReadShelf":')
    expect(promptCall).toMatch(/"title":"Minimal Vol".*"authors":\[\]/)
  })

  it('should put full read shelf in completeReadShelf when provided', async () => {
    const mockGoodreadsData = {
      collections: { recentlyReadBooks: [] },
      profile: { displayName: 'Chris Vogt' },
    }

    const fullReadShelf = [
      {
        title: 'Deep Work',
        authors: ['Cal Newport'],
        isbn: '9781455586691',
        rating: '5',
        finishedOrAddedDate: '2024-01-15',
      },
    ]

    mockAiSummaryText('{"response": "<p>Shelf summary.</p>", "debug": {}}')

    await generateGoodreadsSummary(mockGoodreadsData, { fullReadShelf })

    const promptCall = lastUserPrompt()
    expect(promptCall).toContain('"completeReadShelf"')
    expect(promptCall).toContain('Deep Work')
    expect(promptCall).toContain('Cal Newport')
    expect(promptCall).toContain('9781455586691')
  })
})
