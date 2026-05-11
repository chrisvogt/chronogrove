import { parseString } from 'xml2js'
import convertToHttps from 'to-https'
import got from 'got'
import { logger } from 'firebase-functions'
import pMap from 'p-map'
import { listStoredMedia, storeRemoteMedia, toPublicMediaUrl } from '../../services/media/media-service.js'

import fetchBookFromGoogle from '../google-books/fetch-book.js'
import { getMediaStore } from '../../selectors/media-store.js'
import {
  getGoodreadsConfig,
  getGoogleBooksApiKey,
} from '../../config/backend-config.js'
import { GOODREADS_BOOKS_TO_FETCH } from '../../config/goodreads-config.js'

import type {
  GoogleBooksVolumeSubset,
  GoogleBooksFetchByIsbnResult,
} from '../../types/google-books.js'
import {
  isGoogleBooksVolumesResponseSubset,
} from '../../types/google-books.js'
import type {
  GoodreadsRecentlyReadBook,
  GoodreadsRecentlyReadBookFromGoogle,
  GoodreadsReviewListBookSource,
  GoodreadsReviewListRawReview,
} from '../../types/goodreads.js'

import { getXmlTextOrUndefined } from '../../utils/goodreads-xml.js'
import { sortGoodreadsRecentlyReadBooksByReadAtDesc } from '../../utils/sort-goodreads-recently-read-books.js'

const toBookMediaDestinationPath = id => `books/${id}-thumbnail.jpg`

type GotLikeError = {
  response?: { statusCode?: number; body?: unknown }
  statusCode?: number
}

function parseGoogleBooksApiErrorBody(error: unknown): unknown | null {
  const gotErr = error as GotLikeError
  const raw = gotErr.response?.body
  if (raw == null) {
    return null
  }
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

async function fetchGoogleBookByTitleFallback(
  book: GoodreadsReviewListBookSource,
): Promise<GoogleBooksFetchByIsbnResult | null> {
  if (!book.title) {
    return null
  }
  const searchQuery = book.authorName
    ? `intitle:${book.title} inauthor:${book.authorName}`
    : `intitle:${book.title}`
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const googleBooksAPIKey = getGoogleBooksApiKey()
      const { body } = await got('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: searchQuery,
          key: googleBooksAPIKey,
          country: 'US',
        },
      })
      const parsed: unknown = JSON.parse(body)
      const foundBook: GoogleBooksVolumeSubset | undefined =
        isGoogleBooksVolumesResponseSubset(parsed) ? parsed.items?.[0] : undefined

      if (foundBook) {
        logger.info(
          `Found book by ${book.authorName ? 'title/author' : 'title'} for recently read: ${book.title}`,
        )
        return {
          book: foundBook,
          rating: book.rating,
        }
      }
    } catch (error: unknown) {
      const gotErr = error as GotLikeError
      const statusCode = gotErr.response?.statusCode ?? gotErr.statusCode
      const errorBody = parseGoogleBooksApiErrorBody(error) as {
        error?: { status?: string; code?: number; message?: string }
      } | null
      const isQuotaExceeded =
        errorBody?.error?.status === 'RESOURCE_EXHAUSTED' ||
        (errorBody?.error?.code === 429 && Boolean(errorBody?.error?.message?.includes('Quota exceeded')))
      if (isQuotaExceeded) {
        logger.error('Daily quota exceeded for Google Books API. Title/author fallback skipped.', {
          message: errorBody?.error?.message,
        })
        break
      }
      if ((statusCode === 429 || statusCode === 503) && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000
        logger.warn(
          `Rate limited (${statusCode}) for title search "${book.title}", waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`,
        )
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }
      const mode = book.authorName ? 'title/author' : 'title'
      logger.error(
        `Error fetching book by ${mode} for recently read "${book.title}" after retries:`,
        error,
      )
      break
    }
  }
  return null
}

type TransformBookDataInput = GoodreadsRecentlyReadBookFromGoogle

const transformBookData = (book: TransformBookDataInput): GoodreadsRecentlyReadBook => {
  const {
    book: {
      id,
      volumeInfo: {
        authors,
        categories = [],
        description,
        imageLinks: { smallThumbnail = '', thumbnail = '' } = {},
        infoLink = '',
        pageCount,
        previewLink,
        subtitle,
        title,
      } = {},
    } = {},
    rating,
    goodreadsDescription,
    isbn,
    readAt,
  } = book

  const mediaDestinationPath = toBookMediaDestinationPath(id)

  return {
    authors,
    categories,
    cdnMediaURL: toPublicMediaUrl(mediaDestinationPath),
    mediaDestinationPath: mediaDestinationPath,
    description: goodreadsDescription || description,
    id,
    infoLink: infoLink ? convertToHttps(infoLink) : '',
    isbn, // Include ISBN for matching updates to books
    pageCount,
    previewLink,
    rating,
    ...(readAt != null && readAt !== '' ? { readAt } : {}),
    smallThumbnail: smallThumbnail ? convertToHttps(smallThumbnail) : '',
    subtitle,
    thumbnail: thumbnail ? convertToHttps(thumbnail) : '',
    title,
  }
}

export default async () => {
  const mediaStore = getMediaStore()
  const { apiKey: key, userId: userID } = getGoodreadsConfig()

  const { body } = await got(
    `https://www.goodreads.com/review/list/${userID}.xml?key=${key}&v=2&shelf=read&sort=date_read&per_page=${GOODREADS_BOOKS_TO_FETCH}`
  )

  let rawReviewsResponse: GoodreadsReviewListRawReview[] = []

  // Transforms Goodreads Book Reviews response from XML into JSON
  const bookReviews = await new Promise<GoodreadsReviewListBookSource[]>((resolve, reject) => {
    parseString(body, (error, response) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      const reviewsResponseUnknown =
        response?.GoodreadsResponse?.reviews?.[0]?.review ?? []

      const reviewsResponse: GoodreadsReviewListRawReview[] = Array.isArray(reviewsResponseUnknown)
        ? (reviewsResponseUnknown as GoodreadsReviewListRawReview[])
        : []

      const transformedReviews = reviewsResponse.reduce<GoodreadsReviewListBookSource[]>(
        (books, book) => {
          const readDate = getXmlTextOrUndefined(book?.read_at)
          if (!readDate || readDate.length <= 3) {
            return books
          }

          const rating = getXmlTextOrUndefined(book?.rating)
          if (!rating) {
            return books
          }

          const bookDataUnknown = book?.book
          const firstBookUnknown = Array.isArray(bookDataUnknown) ? bookDataUnknown[0] : bookDataUnknown
          if (!firstBookUnknown || typeof firstBookUnknown !== 'object') {
            return books
          }

          const firstBook = firstBookUnknown as Record<string, unknown>

          const goodreadsDescription = getXmlTextOrUndefined(firstBook.description)
          const isbn13 = getXmlTextOrUndefined(firstBook.isbn13)
          const isbn10 = getXmlTextOrUndefined(firstBook.isbn)
          const isbn = isbn13 || isbn10
          if (!isbn) {
            return books
          }

          const title = getXmlTextOrUndefined(firstBook.title)

          let authorName: string | undefined
          const authorsValue = firstBook.authors
          if (Array.isArray(authorsValue) && authorsValue[0] && typeof authorsValue[0] === 'object') {
            const author0 = authorsValue[0] as Record<string, unknown>
            const authorValue = author0.author
            const authorFirst = Array.isArray(authorValue) ? authorValue[0] : undefined
            if (authorFirst && typeof authorFirst === 'object') {
              authorName = getXmlTextOrUndefined((authorFirst as Record<string, unknown>).name)
            }
          }

          books.push({
            isbn,
            rating,
            readAt: readDate,
            goodreadsDescription,
            ...(typeof title === 'string' && { title }),
            ...(typeof authorName === 'string' && { authorName }),
          })

          return books
        },
        [],
      )

      rawReviewsResponse = reviewsResponse

      resolve(transformedReviews)
    })
  })

  // Early slice: only fetch Google Books data and download thumbnails for books we'll use.
  // Avoids unnecessary API calls and rate limiting.
  const bookReviewsToProcess = bookReviews.slice(0, GOODREADS_BOOKS_TO_FETCH)

  // NOTE(chrisvogt): I'd like to eventually phase this out, or replace Goodreads
  // altogether. The Goodreads data is not very good, and is often lacking detailed
  // information. The Google Books data is really clean and useful. So, I'm currently
  // using Goodreads to get my book review, and then returning the book data from
  // Google Books.
  // Use pMap with concurrency control to avoid rate limiting
  const bookResults = await pMap(
    bookReviewsToProcess,
    async (book: GoodreadsReviewListBookSource, index: number) => {
      // Add a small delay between requests to avoid rate limiting (except for first request)
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 200)) // 200ms delay between requests
      }
      
      let result: GoogleBooksFetchByIsbnResult | null = await fetchBookFromGoogle(book)

      if (!result?.book && book.title) {
        const fallback = await fetchGoogleBookByTitleFallback(book)
        if (fallback) {
          result = fallback
        }
      }

      if (!result?.book) {
        const label = book.title ? `"${book.title}"` : `ISBN ${book.isbn}`
        logger.warn(`Book not found by ISBN or title/author fallback: ${label}`)
      }

      return {
        googleBookResult: result,
        goodreadsData: book,
        originalIndex: index
      }
    },
    {
      concurrency: 3, // Limit concurrent requests to avoid rate limiting
      stopOnError: false,
    }
  )

  const books = sortGoodreadsRecentlyReadBooksByReadAtDesc(
    bookResults
      .filter(
        (bookResult): bookResult is {
          googleBookResult: GoogleBooksFetchByIsbnResult & { book: GoogleBooksVolumeSubset }
          goodreadsData: GoodreadsReviewListBookSource
          originalIndex: number
        } => Boolean(bookResult.googleBookResult?.book),
      )
      .map((bookResult) => {
        const { googleBookResult, goodreadsData } = bookResult

        return transformBookData({
          book: googleBookResult.book,
          rating: googleBookResult.rating ?? null,
          goodreadsDescription: goodreadsData.goodreadsDescription,
          isbn: goodreadsData.isbn,
          readAt: goodreadsData.readAt,
        })
      }),
  )

  const storedMediaFileNames = await listStoredMedia()

  // Media skip list uses filenames from storage; widget payloads use the same paths from transformBookData.
  const mediaToDownload = books
    .filter(({ mediaDestinationPath, thumbnail }) => {
      if (!thumbnail) return false // I've found at least 1 book that doesn't contain a thumbnail
      const isAlreadyDownloaded = storedMediaFileNames.includes(mediaDestinationPath)
      return !isAlreadyDownloaded
    })
    .map(({ id, mediaDestinationPath, thumbnail }) => ({
      destinationPath: mediaDestinationPath,
      id,
      mediaURL: thumbnail,
    }))

  if (!mediaToDownload.length) {
    logger.info('Goodreads data sync finished successfully without media uploads.', {
      mediaStore: mediaStore.describe(),
      totalUploadedCount: 0,
      uploadedFiles: [],
    })
    return {
      books,
      rawReviewsResponse,
      result: 'SUCCESS',
      totalUploadedCount: 0,
      uploadedFiles: [],
    }
  }

  let result
  try {
    result = await pMap(mediaToDownload, storeRemoteMedia, {
      concurrency: 10,
      stopOnError: false,
    })
  } catch (error) {
    logger.error('Something went wrong fetching and uploading one or more media files.', error)
    result = [] // Ensure result is always an array
  }

  logger.info('Goodreads data sync finished successfully with media uploads.', {
    mediaStore: mediaStore.describe(),
    totalUploadedCount: result?.length,
    uploadedFiles: result?.map(({ fileName }) => fileName),
  })

  return {
    books,
    rawReviewsResponse,
    mediaStore: mediaStore.describe(),
    result: 'SUCCESS',
    totalUploadedCount: result?.length,
    uploadedFiles: result?.map(({ fileName }) => fileName),
  }
}
