import { logger } from 'firebase-functions'

import { getAiSummaryApiKey } from '../../config/backend-config.js'
import type { SpotifySummaryInput } from '../../types/spotify-summary.js'
import { requestAiSummaryCompletion } from '../../utils/ai-summary-messages.js'
import extractJsonFromAiResponse from '../../utils/extract-json-from-ai-response.js'

const SPOTIFY_AI_ASSISTANT_LOG_HEAD = 2400
const SPOTIFY_AI_ASSISTANT_LOG_TAIL = 700

const buildSpotifyAssistantTextLogFields = (assistantText: string) => {
  const charLength = assistantText.length
  const trimmedLength = assistantText.trim().length
  const head = assistantText.slice(0, SPOTIFY_AI_ASSISTANT_LOG_HEAD)
  const tail =
    charLength > SPOTIFY_AI_ASSISTANT_LOG_HEAD + SPOTIFY_AI_ASSISTANT_LOG_TAIL
      ? assistantText.slice(-SPOTIFY_AI_ASSISTANT_LOG_TAIL)
      : undefined
  return {
    charLength,
    trimmedLength,
    firstCurlyIndex: assistantText.indexOf('{'),
    lastCurlyIndex: assistantText.lastIndexOf('}'),
    hasMarkdownFence: /```(?:json)?/i.test(assistantText),
    head,
    ...(tail !== undefined ? { tail } : {}),
  }
}

function messageFromUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message
    if (typeof m === 'string') {
      return m
    }
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

/**
 * Generate AI summary of Spotify listening data (LLM JSON → HTML paragraphs).
 */
const generateSpotifySummary = async (spotifyData: SpotifySummaryInput): Promise<string> => {
  const apiKey = getAiSummaryApiKey()

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }

  const { metrics, playlists, profile, topTracks } = spotifyData

  const prompt = `
You are writing a short, reader-facing “AI listening summary” for Chris Vogt’s Spotify activity on his personal homepage (chrisvogt.me). It appears next to live playlists and top tracks, so visitors already see names and artwork there.

Return **valid JSON only** (no markdown fences, no commentary) using exactly this shape:
{
  "response": "<string: two or three HTML paragraphs, see rules below>"
}

Rules for the "response" string (strict — the UI is built for this):
- **JSON-safe HTML:** escape every ASCII double-quote (U+0022) inside the **response** string as a backslash plus double-quote; do not use raw line breaks inside that string (one line of HTML, or JSON-escaped newline as backslash followed by n). The full payload must be valid JSON.
- **Two or three** <p>...</p> elements, back-to-back, with nothing before, between, or after them (no wrapper <div>, no line breaks outside the tags).
- **First person** only: Chris Vogt’s own words — **I**, **my**, **me**. Do not describe him in third person (“Chris…”, “he…”). Avoid pivoting to address the visitor as **you**; stay in first-person perspective throughout.
- **Voice** (match chrisvogt.me editorial tone): calm, specific, a little editorial — like a sharp one-column blurb, not marketing. Lead with listening habits, playlist “lanes,” or recurring artists when you can; avoid empty platitudes (“music is my life”). No meta lines about this being an AI summary or a widget. No thank-you sign-offs. At most one metaphor or framing detail per paragraph.
- Summarize **top tracks** (who and what registers) and how **playlists** suggest curation or mood — without re-listing every title or playlist name.
- **Do not** quote follower counts, playlist totals, or other metrics unless they sharpen a point (visitors can see metrics elsewhere).
- Optional sparse styling inside paragraphs: <strong>, <em>, <b>, <i>; no hyperlinks, lists, headings, or images.

Spotify profile display name: ${profile.displayName ?? ''}
Profile URL (context only, do not echo as a naked link): ${profile.profileURL ?? ''}

"metrics": ${JSON.stringify(metrics)}

"topTracks": ${JSON.stringify(topTracks)}

"playlists": ${JSON.stringify(playlists)}
`

  try {
    const responseText = await requestAiSummaryCompletion({ apiKey, userMessage: prompt })
    const parsed = extractJsonFromAiResponse<{ response?: unknown }>(responseText)
    if (!parsed) {
      logger.error(
        'Spotify AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
        buildSpotifyAssistantTextLogFields(responseText),
      )
      throw new Error('Model response was not valid JSON (no markdown block or raw JSON)')
    }
    const raw = parsed.response
    return typeof raw === 'string' ? raw : ''
  } catch (error: unknown) {
    logger.error('Error generating Spotify AI summary:', error)
    throw new Error(`Failed to generate AI summary: ${messageFromUnknownError(error)}`, { cause: error })
  }
}

export default generateSpotifySummary
