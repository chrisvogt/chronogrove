import { logger } from 'firebase-functions'

import { getAiSummaryApiKey } from '../../config/backend-config.js'
import type { SteamSummaryInput } from '../../types/steam.js'
import { requestAiSummaryCompletion } from '../../utils/ai-summary-messages.js'
import extractJsonFromAiResponse from '../../utils/extract-json-from-ai-response.js'

/** Logged when `extractJsonFromAiResponse` fails — head/tail help diagnose truncation vs bad escaping. */
const STEAM_AI_ASSISTANT_LOG_HEAD = 2400
const STEAM_AI_ASSISTANT_LOG_TAIL = 700

const buildSteamAssistantTextLogFields = (assistantText: string) => {
  const charLength = assistantText.length
  const trimmedLength = assistantText.trim().length
  const head = assistantText.slice(0, STEAM_AI_ASSISTANT_LOG_HEAD)
  const tail =
    charLength > STEAM_AI_ASSISTANT_LOG_HEAD + STEAM_AI_ASSISTANT_LOG_TAIL
      ? assistantText.slice(-STEAM_AI_ASSISTANT_LOG_TAIL)
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
 * Generate AI summary of Steam gaming data (LLM JSON → HTML paragraphs).
 */
const generateSteamSummary = async (steamData: SteamSummaryInput): Promise<string> => {
  const apiKey = getAiSummaryApiKey()

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }

  const { collections, profile, metrics } = steamData

  const prompt = `
You are writing a short, reader-facing “AI play summary” for Chris Vogt’s Steam activity on his personal homepage (chrisvogt.me). It appears next to live tables of recent and lifetime play, so visitors already see hours and titles there.

Return **valid JSON only** (no markdown fences, no commentary) using exactly this shape (one top-level key — do not echo game lists into the JSON; the page already shows them):
{
  "response": "<string: two or three HTML paragraphs, see rules below>"
}

Rules for the "response" string (strict — the UI is built for this):
- **JSON-safe HTML:** escape every ASCII double-quote (U+0022) inside the **response** string as a backslash plus double-quote; do not use raw line breaks inside that string (one line of HTML, or JSON-escaped newline as backslash followed by n). The full payload must be valid JSON.
- **Two or three** <p>...</p> elements, back-to-back, with nothing before, between, or after them (no wrapper <div>, no line breaks outside the tags).
- **First person** only: Chris Vogt’s own words — **I**, **my**, **me**. Do not describe him in third person (“Chris…”, “he…”). Avoid pivoting to address the visitor as **you**; stay in first-person perspective throughout.
- **Voice** (match chrisvogt.me editorial tone): calm, specific, a little editorial — like a sharp one-column blurb, not marketing. Lead with concrete play habits or through-lines when you can; avoid generic gamer openers and hype. No meta lines about this being an AI summary or a stats table. No thank-you sign-offs. At most one metaphor or framing detail per paragraph.
- Summarize **recent** leanings from recentlyPlayedGames and **long-run** tendencies from topPlayedGames — genre or playstyle patterns (sandbox, survival, RPGs, base-building, etc.) and any standout titles, without re-listing every game.
- The tables show hours — **do not** quote exact hour totals in the prose unless it serves a sharp point.
- All provided time values in the data are **minutes** (for your reasoning only; do not recite them unless needed).
- Exclude games with 0 total playtime from your thinking.
- Optional sparse styling inside paragraphs: <strong>, <em>, <b>, <i>; no hyperlinks, lists, headings, or images.

Steam Profile: ${profile.displayName}  
Total Games Owned: ${metrics.find(m => m.id === 'owned-games-count')?.value || 0}

"recentlyPlayedGames": ${JSON.stringify(collections.recentlyPlayedGames.map(game => ({
    title: game.displayName,
    playTime2Weeks: game.playTime2Weeks || 0,
    playTimeForever: game.playTimeForever || 0
  })))}

"topPlayedGames": ${JSON.stringify(collections.ownedGames
    .filter(game => game.playTimeForever >= 100)
    .sort((a, b) => b.playTimeForever - a.playTimeForever)
    .map(game => ({
      title: game.displayName,
      playTimeForever: game.playTimeForever
    })))}
`

  try {
    const responseText = await requestAiSummaryCompletion({ apiKey, userMessage: prompt })
    const parsed = extractJsonFromAiResponse<{ response?: unknown }>(responseText)
    if (!parsed) {
      logger.error(
        'Steam AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
        buildSteamAssistantTextLogFields(responseText),
      )
      throw new Error('Model response was not valid JSON (no markdown block or raw JSON)')
    }
    const raw = parsed.response
    return typeof raw === 'string' ? raw : ''
  } catch (error: unknown) {
    logger.error('Error generating Steam AI summary:', error)
    throw new Error(`Failed to generate AI summary: ${messageFromUnknownError(error)}`, { cause: error })
  }
}

export default generateSteamSummary
