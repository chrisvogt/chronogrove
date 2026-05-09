const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 1024

type TextContentBlock = { type: string; text?: string }

const resolveMaxTokens = (): number => {
  const raw = process.env.ANTHROPIC_MAX_OUTPUT_TOKENS?.trim()
  if (!raw) return DEFAULT_MAX_TOKENS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_TOKENS
}

const assistantTextFromResponseBody = (body: unknown): string | null => {
  if (typeof body !== 'object' || body === null || !('content' in body)) {
    return null
  }
  const { content } = body as { content: unknown }
  if (!Array.isArray(content)) {
    return null
  }
  const parts: string[] = []
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as TextContentBlock).type === 'text' &&
      typeof (block as TextContentBlock).text === 'string'
    ) {
      parts.push((block as { text: string }).text)
    }
  }
  return parts.length > 0 ? parts.join('') : null
}

export type AiSummaryMessageParams = {
  apiKey: string
  /** Defaults to `ANTHROPIC_MODEL` env or `claude-sonnet-4-6` */
  model?: string
  /** Defaults to `ANTHROPIC_MAX_OUTPUT_TOKENS` env or 1024 */
  maxTokens?: number
  userMessage: string
}

/**
 * Single user-turn text completion for widget AI summaries (server-side HTTP).
 */
export const requestAiSummaryCompletion = async ({
  apiKey,
  model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
  maxTokens = resolveMaxTokens(),
  userMessage,
}: AiSummaryMessageParams): Promise<string> => {
  const res = await fetch(MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  const raw = await res.text()
  let body: unknown
  try {
    body = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`AI summary API returned non-JSON (${res.status}): ${raw.slice(0, 500)}`)
  }

  if (!res.ok) {
    const errObj =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
        ? (body as { error: { message: string } }).error.message
        : raw.slice(0, 500)
    throw new Error(`AI summary API error (${res.status}): ${errObj}`)
  }

  const text = assistantTextFromResponseBody(body)
  if (text === null) {
    throw new Error('AI summary API response had no assistant text content')
  }
  return text
}
