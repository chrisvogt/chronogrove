import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { requestAiSummaryCompletion } from './ai-summary-messages.js'

type FetchCallInit = { body?: string; method?: string; headers?: Record<string, string> }

const makeResponseBody = (contentBlocks: unknown[]) =>
  JSON.stringify({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: contentBlocks,
  })

const textResponse = (text: string) =>
  makeResponseBody([{ type: 'text', text }])

describe('requestAiSummaryCompletion', () => {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_MAX_OUTPUT_TOKENS
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    process.env = originalEnv
    globalThis.fetch = originalFetch
  })

  const okFetch = (text: string) =>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => text,
    })

  const errorFetch = (status: number, body: string) =>
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => body,
    })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('returns the assistant text on a successful response', async () => {
    okFetch(textResponse('<p>Great summary.</p>'))

    const result = await requestAiSummaryCompletion({
      apiKey: 'sk-test',
      userMessage: 'Summarize this.',
    })

    expect(result).toBe('<p>Great summary.</p>')
  })

  it('joins multiple text content blocks into one string', async () => {
    okFetch(
      makeResponseBody([
        { type: 'text', text: 'First. ' },
        { type: 'text', text: 'Second.' },
      ]),
    )

    const result = await requestAiSummaryCompletion({
      apiKey: 'sk-test',
      userMessage: 'Summarize this.',
    })

    expect(result).toBe('First. Second.')
  })

  it('skips non-text content blocks and returns remaining text', async () => {
    okFetch(
      makeResponseBody([
        { type: 'tool_use', id: 'tool_1' },
        { type: 'text', text: 'Only this.' },
      ]),
    )

    const result = await requestAiSummaryCompletion({
      apiKey: 'sk-test',
      userMessage: 'Summarize this.',
    })

    expect(result).toBe('Only this.')
  })

  // ── Request shape ─────────────────────────────────────────────────────────

  it('sends a POST to the Anthropic messages endpoint with correct headers', async () => {
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({
      apiKey: 'my-key',
      userMessage: 'Hello',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'my-key',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
      }),
    )
  })

  it('includes the user message in the request body', async () => {
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({
      apiKey: 'my-key',
      userMessage: 'Tell me about games.',
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { messages: { role: string; content: string }[] }

    expect(body.messages).toEqual([{ role: 'user', content: 'Tell me about games.' }])
  })

  // ── Model default ─────────────────────────────────────────────────────────

  it('uses claude-sonnet-4-6 as the default model', async () => {
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { model: string }

    expect(body.model).toBe('claude-sonnet-4-6')
  })

  it('uses ANTHROPIC_MODEL env var when set', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-4-7'
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { model: string }

    expect(body.model).toBe('claude-opus-4-7')
  })

  it('prefers an explicit model param over the env var', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-4-7'
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({
      apiKey: 'k',
      model: 'claude-haiku-override',
      userMessage: 'hi',
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { model: string }

    expect(body.model).toBe('claude-haiku-override')
  })

  // ── maxTokens resolution ──────────────────────────────────────────────────

  it('defaults max_tokens to 1024 when ANTHROPIC_MAX_OUTPUT_TOKENS is not set', async () => {
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { max_tokens: number }

    expect(body.max_tokens).toBe(1024)
  })

  it('reads max_tokens from ANTHROPIC_MAX_OUTPUT_TOKENS env var', async () => {
    process.env.ANTHROPIC_MAX_OUTPUT_TOKENS = '2048'
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { max_tokens: number }

    expect(body.max_tokens).toBe(2048)
  })

  it.each([
    ['not-a-number', 1024],
    ['0', 1024],
    ['-500', 1024],
    ['Infinity', 1024],
  ])(
    'falls back to 1024 when ANTHROPIC_MAX_OUTPUT_TOKENS is "%s"',
    async (value, expected) => {
      process.env.ANTHROPIC_MAX_OUTPUT_TOKENS = value
      okFetch(textResponse('ok'))

      await requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' })

      const body = JSON.parse(
        (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
      ) as { max_tokens: number }

      expect(body.max_tokens).toBe(expected)
    },
  )

  it('prefers an explicit maxTokens param over the env var', async () => {
    process.env.ANTHROPIC_MAX_OUTPUT_TOKENS = '512'
    okFetch(textResponse('ok'))

    await requestAiSummaryCompletion({ apiKey: 'k', maxTokens: 256, userMessage: 'hi' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as FetchCallInit).body as string,
    ) as { max_tokens: number }

    expect(body.max_tokens).toBe(256)
  })

  // ── HTTP error handling ───────────────────────────────────────────────────

  it('throws with the Anthropic error message on a structured API error', async () => {
    errorFetch(401, JSON.stringify({ error: { message: 'invalid x-api-key' } }))

    await expect(
      requestAiSummaryCompletion({ apiKey: 'bad-key', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API error (401): invalid x-api-key')
  })

  it('falls back to raw body when the error response has no structured message', async () => {
    errorFetch(500, JSON.stringify({ code: 'overloaded' }))

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API error (500): {"code":"overloaded"}')
  })

  it('throws when the response body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => '<html>Bad Gateway</html>',
    })

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API returned non-JSON (503)')
  })

  it('throws when a 200 response body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'not json at all',
    })

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API returned non-JSON (200)')
  })

  // ── No text content ───────────────────────────────────────────────────────

  it('throws when the response has an empty content array', async () => {
    okFetch(makeResponseBody([]))

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API response had no assistant text content')
  })

  it('throws when all content blocks are non-text', async () => {
    okFetch(makeResponseBody([{ type: 'tool_use', id: 'tool_1' }]))

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API response had no assistant text content')
  })

  it('throws when the response body has no content field', async () => {
    okFetch(JSON.stringify({ id: 'msg_test', role: 'assistant' }))

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API response had no assistant text content')
  })

  it('throws when content is not an array', async () => {
    okFetch(JSON.stringify({ content: 'just a string' }))

    await expect(
      requestAiSummaryCompletion({ apiKey: 'k', userMessage: 'hi' }),
    ).rejects.toThrow('AI summary API response had no assistant text content')
  })
})
