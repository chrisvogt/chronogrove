import { logger } from 'firebase-functions'

import { getAiSummaryApiKey } from '../../config/backend-config.js'
import { requestAiSummaryCompletion } from '../../utils/ai-summary-messages.js'
import extractJsonFromAiResponse from '../../utils/extract-json-from-ai-response.js'

import type { GoodreadsAiReadShelfEntry } from '../../types/goodreads.js'
import type { GoodreadsWidgetDocument } from '../../types/widget-content.js'

export type GenerateGoodreadsSummaryOptions = {
  /** Full read shelf from Goodreads XML only; drives long-tail context in the prompt */
  fullReadShelf?: GoodreadsAiReadShelfEntry[]
}

type GoodreadsSummaryJson = {
  response?: string
  debug?: Record<string, unknown>
}

/** Extract top-level <p> blocks; the homepage UI collapses extra paragraphs behind “Read more”. */
const extractParagraphTags = (html: string): string[] => {
  const re = /<p\b[^>]*>[\s\S]*?<\/p>/gi
  return html.match(re) ?? []
}

const normalizeParagraphSummary = (html: string): string => {
  const paras = extractParagraphTags(html)
  if (paras.length === 0) {
    return html.trim()
  }
  if (paras.length === 1) {
    logger.warn('Goodreads AI summary contained only one <p>.')
    return paras[0]
  }
  return paras.join('')
}

/**
 * Generate AI summary of Goodreads reading data (LLM JSON → HTML paragraphs).
 * @param {Object} goodreadsData - The Goodreads data object containing collections and profile info
 * @returns {Promise<string>} - The AI-generated summary
 */
const generateGoodreadsSummary = async (
  goodreadsData: GoodreadsWidgetDocument,
  options: GenerateGoodreadsSummaryOptions = {},
): Promise<string> => {
  const apiKey = getAiSummaryApiKey()

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }

  const { collections, profile } = goodreadsData
  const { fullReadShelf = [] } = options

  const fullShelfForPrompt =
    fullReadShelf.length > 0
      ? fullReadShelf
      : (collections?.recentlyReadBooks?.map((book) => ({
        title: book.title,
        authors: book.authors ?? [],
        isbn: book.isbn ?? null,
        rating: book.rating ?? null,
        finishedOrAddedDate: null,
      })) ?? [])

  const prompt = `
You are writing a short, reader-facing “AI reading summary” for Chris Vogt’s personal homepage (chrisvogt.me). It appears next to a live list of books he recently finished and what he is reading now, so visitors already see titles and ratings there.

Return **valid JSON only** (no markdown fences, no commentary) using this shape:
{
  "response": "<string: two or three HTML paragraphs, see rules below>",
  "debug": {
    "recentlyReadBooks": [...],
    "readingPatterns": [...]
  }
}

Rules for the "response" string (strict — the UI is built for this):
- **Two or three** <p>...</p> elements, back-to-back, with nothing before, between, or after them (no wrapper <div>, no line breaks outside the tags).
- **Third person** only, referring to him as **Chris** (e.g. “Chris tends to…”, “He often…”). Never “I”, “you”, or “the reader”.
- Tone: calm, specific, a little editorial — like a sharp one-column blurb in a magazine, not marketing fluff. Avoid generic openers (“Chris loves books”, “As an avid reader”).
- **Do not** repeat or enumerate the book list; at most **one** quick nod to a title or theme if it sharpens a point. Ratings are visible elsewhere — mention them only if unusual or telling.
- **completeReadShelf** is his full “read” shelf from Goodreads (title, authors, ISBN, his stars, finish or date-added). Use it for **long-run habits**: balance of fiction vs non-fiction, streaks, eras, breadth, how tastes shift over time.
- **recentlyReadBooksForWidget** adds categories and page counts (via Google Books) for what the page actually shows — use it for **texture on what he’s been into lately** (subjects, chunkier vs slimmer books) without re-listing every title.

Styling inside paragraphs (optional, sparse):
- You may use **bold or italic** (<strong>, <em>) for a phrase or two; no hyperlinks, no lists, no headings, no images.

Goodreads Profile: ${profile?.name || profile?.username || 'Chris Vogt'}

"recentlyReadBooksForWidget": ${JSON.stringify(collections?.recentlyReadBooks?.map(book => ({
    title: book.title,
    authors: book.authors,
    rating: book.rating,
    categories: book.categories || [],
    pageCount: book.pageCount
  })) || [])}

"completeReadShelf": ${JSON.stringify(fullShelfForPrompt)}
`

  try {
    const responseText = await requestAiSummaryCompletion({ apiKey, userMessage: prompt })
    const parsed = extractJsonFromAiResponse<GoodreadsSummaryJson>(responseText)
    if (!parsed) {
      throw new Error('Model response was not valid JSON (no markdown block or raw JSON)')
    }
    const { response: sanitizedResponse = '' } = parsed
    return normalizeParagraphSummary(sanitizedResponse)
  } catch (error: unknown) {
    logger.error('Error generating Goodreads AI summary:', error)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate AI summary: ${message}`, { cause: error })
  }
}

export default generateGoodreadsSummary
