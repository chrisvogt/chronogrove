import { logger } from 'firebase-functions'

import { getAiSummaryApiKey } from '../../config/backend-config.js'
import type {
  DiscogsSummaryInput,
  DiscogsTransformedRelease,
} from '../../types/discogs.js'
import { requestAiSummaryCompletion } from '../../utils/ai-summary-messages.js'
import extractJsonFromAiResponse from '../../utils/extract-json-from-ai-response.js'

const DISCOGS_AI_ASSISTANT_LOG_HEAD = 2400
const DISCOGS_AI_ASSISTANT_LOG_TAIL = 700

const buildDiscogsAssistantTextLogFields = (assistantText: string) => {
  const charLength = assistantText.length
  const trimmedLength = assistantText.trim().length
  const head = assistantText.slice(0, DISCOGS_AI_ASSISTANT_LOG_HEAD)
  const tail =
    charLength > DISCOGS_AI_ASSISTANT_LOG_HEAD + DISCOGS_AI_ASSISTANT_LOG_TAIL
      ? assistantText.slice(-DISCOGS_AI_ASSISTANT_LOG_TAIL)
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

const bump = (counts: Record<string, number>, key: string): void => {
  if (!key) return
  counts[key] = (counts[key] ?? 0) + 1
}

const namesFromArtists = (artists: unknown): string[] => {
  if (!Array.isArray(artists)) return []
  return artists
    .map((a) => {
      if (typeof a === 'object' && a !== null && 'name' in a) {
        const n = (a as { name: unknown }).name
        return typeof n === 'string' ? n.trim() : ''
      }
      return ''
    })
    .filter(Boolean)
}

const formatNames = (formats: unknown): string[] => {
  if (!Array.isArray(formats)) return []
  return formats
    .map((f) => {
      if (typeof f === 'object' && f !== null && 'name' in f) {
        const n = (f as { name: unknown }).name
        return typeof n === 'string' ? n.trim() : ''
      }
      return ''
    })
    .filter(Boolean)
}

const stringTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return []
  return tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
}

const decadeFromYear = (year: number | undefined): string => {
  if (typeof year !== 'number' || year <= 0) {
    return 'unknown'
  }
  return `${Math.floor(year / 10) * 10}s`
}

const parseDateAdded = (s: string | undefined): number => {
  if (!s || typeof s !== 'string') return 0
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

/** Compact releases + rollups for the model (handles large collections). */
export const buildDiscogsSummaryInput = (
  releases: DiscogsTransformedRelease[],
  collectionTotal: number,
  profileURL: string | undefined,
): DiscogsSummaryInput => {
  const valid = releases.filter((r) => r.basicInformation)
  const genreCounts: Record<string, number> = {}
  const styleCounts: Record<string, number> = {}
  const decadeCounts: Record<string, number> = {}

  for (const r of valid) {
    const bi = r.basicInformation
    bump(decadeCounts, decadeFromYear(bi.year))
    for (const g of stringTags(bi.genres)) {
      bump(genreCounts, g)
    }
    for (const s of stringTags(bi.styles)) {
      bump(styleCounts, s)
    }
  }

  const sorted = [...valid].sort(
    (a, b) => parseDateAdded(b.dateAdded) - parseDateAdded(a.dateAdded),
  )
  const recentReleases = sorted.slice(0, 72).map((r) => {
    const bi = r.basicInformation
    return {
      artists: namesFromArtists(bi.artists),
      dateAdded: r.dateAdded,
      formats: formatNames(bi.formats),
      genres: stringTags(bi.genres),
      styles: stringTags(bi.styles),
      title: bi.title,
      year: bi.year,
    }
  })

  return {
    collectionTotal,
    decadeCounts,
    genreCounts,
    profileURL,
    recentReleases,
    styleCounts,
  }
}

/**
 * Generate AI summary of Discogs collection data (LLM JSON → HTML paragraphs).
 */
const generateDiscogsSummary = async (input: DiscogsSummaryInput): Promise<string> => {
  const apiKey = getAiSummaryApiKey()

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }

  const prompt = `
You are writing a short, reader-facing “AI collection summary” for Chris Vogt’s physical music collection on Discogs, on his personal homepage (chrisvogt.me). It appears next to live artwork and release rows, so visitors already see titles and formats there.

Return **valid JSON only** (no markdown fences, no commentary) using exactly this shape:
{
  "response": "<string: two or three HTML paragraphs, see rules below>"
}

Rules for the "response" string (strict — the UI is built for this):
- **JSON-safe HTML:** escape every ASCII double-quote (U+0022) inside the **response** string as a backslash plus double-quote; do not use raw line breaks inside that string (one line of HTML, or JSON-escaped newline as backslash followed by n). The full payload must be valid JSON.
- **Two or three** <p>...</p> elements, back-to-back, with nothing before, between, or after them (no wrapper <div>, no line breaks outside the tags).
- **First person** only: Chris Vogt’s own words — **I**, **my**, **me**. Do not describe him in third person (“Chris…”, “he…”). Avoid pivoting to address the visitor as **you**; stay in first-person perspective throughout.
- **Voice** (match chrisvogt.me editorial tone): calm, specific, a little editorial. Describe **collecting** through-lines: eras, genres, formats (vinyl vs CD), labels or scenes if the data suggests it — without catalog listing. No meta lines about this being an AI summary. No thank-you sign-offs.
- **recentReleases** is sorted newest-first (subset of the collection). **decadeCounts**, **genreCounts**, and **styleCounts** are rollups over the full synced collection use them for long-run shape; do not recite every bin or count.
- **Do not** quote exact collection totals unless it serves a sharp point.
- Optional sparse styling inside paragraphs: <strong>, <em>, <b>, <i>; no hyperlinks, lists, headings, or images.

Collection URL (context only): ${input.profileURL ?? ''}
Total items in collection (approximate, from Discogs pagination): ${input.collectionTotal}

"decadeCounts": ${JSON.stringify(input.decadeCounts)}
"genreCounts": ${JSON.stringify(input.genreCounts)}
"styleCounts": ${JSON.stringify(input.styleCounts)}
"recentReleases": ${JSON.stringify(input.recentReleases)}
`

  try {
    const responseText = await requestAiSummaryCompletion({ apiKey, userMessage: prompt })
    const parsed = extractJsonFromAiResponse<{ response?: unknown }>(responseText)
    if (!parsed) {
      logger.error(
        'Discogs AI summary: assistant text could not be parsed as JSON (see head/tail/indices).',
        buildDiscogsAssistantTextLogFields(responseText),
      )
      throw new Error('Model response was not valid JSON (no markdown block or raw JSON)')
    }
    const raw = parsed.response
    return typeof raw === 'string' ? raw : ''
  } catch (error: unknown) {
    logger.error('Error generating Discogs AI summary:', error)
    throw new Error(`Failed to generate AI summary: ${messageFromUnknownError(error)}`, { cause: error })
  }
}

export default generateDiscogsSummary
