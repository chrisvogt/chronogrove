import { parseString } from 'xml2js'
import got from 'got'

import { getGoodreadsConfig } from '../../config/backend-config.js'
import {
  GOODREADS_AI_READ_SHELF_MAX_PAGES,
  GOODREADS_AI_READ_SHELF_PER_PAGE,
} from '../../config/goodreads-config.js'
import type { GoodreadsAiReadShelfEntry } from '../../types/goodreads.js'
import { getXmlTextOrUndefined } from '../../utils/goodreads-xml.js'

const listUrl = (
  userID: string,
  key: string,
  page: number,
  perPage: number,
) =>
  `https://www.goodreads.com/review/list/${userID}.xml?key=${key}&v=2&shelf=read&sort=date_read&per_page=${perPage}&page=${page}`

const extractAuthorNames = (firstBook: Record<string, unknown>): string[] => {
  const authorsValue = firstBook.authors
  if (!Array.isArray(authorsValue) || !authorsValue[0] || typeof authorsValue[0] !== 'object') {
    return []
  }
  const authorsNode = authorsValue[0] as Record<string, unknown>
  const authorValue = authorsNode.author
  if (authorValue == null) {
    return []
  }
  const authorList = Array.isArray(authorValue) ? authorValue : [authorValue]
  const names: string[] = []
  for (const a of authorList) {
    if (a && typeof a === 'object') {
      const n = getXmlTextOrUndefined((a as Record<string, unknown>).name)
      if (n) {
        names.push(n)
      }
    }
  }
  return names
}

const reviewToAiEntry = (review: Record<string, unknown>): GoodreadsAiReadShelfEntry | null => {
  const bookDataUnknown = review?.book
  const firstBookUnknown = Array.isArray(bookDataUnknown) ? bookDataUnknown[0] : bookDataUnknown
  if (!firstBookUnknown || typeof firstBookUnknown !== 'object') {
    return null
  }

  const firstBook = firstBookUnknown as Record<string, unknown>

  const isbn13 = getXmlTextOrUndefined(firstBook.isbn13)
  const isbn10 = getXmlTextOrUndefined(firstBook.isbn)
  const isbn = isbn13 || isbn10 || null
  const title = getXmlTextOrUndefined(firstBook.title)
  const authors = extractAuthorNames(firstBook)

  if (!title && !isbn) {
    return null
  }

  const readAt = getXmlTextOrUndefined(review.read_at)
  const dateAdded = getXmlTextOrUndefined(review.date_added)
  let finishedOrAddedDate: string | null = null
  if (readAt && readAt.length > 3) {
    finishedOrAddedDate = readAt
  } else if (dateAdded && dateAdded.length > 3) {
    finishedOrAddedDate = dateAdded
  }

  const rating = getXmlTextOrUndefined(review.rating)

  return {
    authors,
    finishedOrAddedDate,
    isbn,
    rating: rating ?? null,
    ...(typeof title === 'string' && title.length > 0 ? { title } : {}),
  }
}

const parseReviewListPage = (body: string): Promise<GoodreadsAiReadShelfEntry[]> =>
  new Promise((resolve, reject) => {
    parseString(body, (error, response) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      const reviewsResponseUnknown =
        response?.GoodreadsResponse?.reviews?.[0]?.review ?? []

      const reviewsArray: Record<string, unknown>[] = Array.isArray(reviewsResponseUnknown)
        ? (reviewsResponseUnknown as Record<string, unknown>[])
        : []

      const entries = reviewsArray
        .map((r) => reviewToAiEntry(r))
        .filter((e): e is GoodreadsAiReadShelfEntry => Boolean(e))

      resolve(entries)
    })
  })

/**
 * Fetch every book on the user's "read" shelf from Goodreads only (paginated XML).
 * No Google Books calls and no cover downloads — for AI summary context only.
 */
const fetchFullReadShelfForAi = async (): Promise<GoodreadsAiReadShelfEntry[]> => {
  const { apiKey: key, userId: userID } = getGoodreadsConfig()
  const perPage = GOODREADS_AI_READ_SHELF_PER_PAGE
  const aggregated: GoodreadsAiReadShelfEntry[] = []

  for (let page = 1; page <= GOODREADS_AI_READ_SHELF_MAX_PAGES; page += 1) {
    if (page > 1) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    const { body } = await got(listUrl(userID, key, page, perPage))
    const entries = await parseReviewListPage(body)
    if (entries.length === 0) {
      break
    }
    aggregated.push(...entries)
    if (entries.length < perPage) {
      break
    }
  }

  return aggregated
}

export default fetchFullReadShelfForAi
