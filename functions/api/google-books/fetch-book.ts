import { logger } from 'firebase-functions'
import got from 'got'

import { getGoogleBooksApiKey } from '../../config/backend-config.js'

import type {
  GoogleBooksFetchByIsbnInput,
  GoogleBooksFetchByIsbnResult,
  GoogleBooksVolumeSubset,
} from '../../types/google-books.js'

import {
  isGoogleBooksVolumesResponseSubset as isVolumesResponseSubset,
} from '../../types/google-books.js'

type GoogleBooksApiErrorBody = {
  error?: {
    status?: string
    code?: number
    message?: string
    details?: Array<{ metadata?: { quota_limit_value?: unknown } }>
  }
}

type GotLike = {
  response?: { statusCode?: number; body?: string }
  statusCode?: number
}

function parseGoogleBooksVolumeErrorBody(error: unknown): GoogleBooksApiErrorBody | null {
  const e = error as GotLike
  if (!e.response?.body) {
    return null
  }
  try {
    return JSON.parse(e.response.body) as GoogleBooksApiErrorBody
  } catch {
    return null
  }
}

function isGoogleBooksDailyQuotaExceeded(errorBody: GoogleBooksApiErrorBody | null): boolean {
  if (!errorBody?.error) {
    return false
  }
  return (
    errorBody.error.status === 'RESOURCE_EXHAUSTED' ||
    (errorBody.error.code === 429 && Boolean(errorBody.error.message?.includes('Quota exceeded')))
  )
}

const fetchBook = async (
  book: GoogleBooksFetchByIsbnInput,
  maxRetries = 3,
): Promise<GoogleBooksFetchByIsbnResult | null> => {
  const { isbn, rating } = book
  const googleBooksAPIKey = getGoogleBooksApiKey()

  if (!isbn) {
    throw new Error(`ISBN number required to search Google Books. You passed: ${isbn}`)
  }

  const googleBooksVolumeURL = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${googleBooksAPIKey}&country=US`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { body } = await got(googleBooksVolumeURL)
      const parsed: unknown = JSON.parse(body)
      const items = isVolumesResponseSubset(parsed) ? parsed.items : undefined
      const volume: GoogleBooksVolumeSubset | undefined = items?.[0]

      if (!volume) {
        logger.info(`No result from Google Books for ISBN: ${isbn}; title/author fallback may be used.`)
      }

      return {
        book: volume,
        rating,
      }
    } catch (error: unknown) {
      const e = error as GotLike
      const statusCode = e.response?.statusCode ?? e.statusCode
      const errorBody = parseGoogleBooksVolumeErrorBody(error)

      if (isGoogleBooksDailyQuotaExceeded(errorBody)) {
        logger.error(`Daily quota exceeded for Google Books API. ISBN ${isbn} will not be fetched.`, {
          message: errorBody?.error?.message,
          quota_limit: errorBody?.error?.details?.[0]?.metadata?.quota_limit_value,
        })
        return null
      }

      if ((statusCode === 429 || statusCode === 503) && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000
        logger.warn(
          `Rate limited (${statusCode}) for ISBN ${isbn}, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`,
        )
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }

      if (attempt === maxRetries) {
        logger.error(`Error fetching data Google Books API for ISBN ${isbn} after ${maxRetries} attempts.`, error)
        return null
      }

      logger.error('Error fetching data Google Books API.', error)
      return null
    }
  }

  return null
}

export default fetchBook
