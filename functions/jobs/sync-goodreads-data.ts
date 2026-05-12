import convertToHttps from 'to-https'
import got from 'got'
import pMap from 'p-map'
import {
  describeMediaStore,
  listStoredMedia,
  storeRemoteMedia,
  toPublicMediaUrl,
} from '../services/media/media-service.js'

import fetchUser from '../api/goodreads/fetch-user.js'
import fetchFullReadShelfForAi from '../api/goodreads/fetch-full-read-shelf-for-ai.js'
import fetchRecentlyReadBooks from '../api/goodreads/fetch-recently-read-books.js'
import generateGoodreadsSummary from '../api/goodreads/generate-goodreads-summary.js'
import type { DocumentStore } from '../ports/document-store.js'
import fetchBookFromGoogle from '../api/google-books/fetch-book.js'
import { getGoogleBooksApiKey } from '../config/backend-config.js'
import { getDefaultWidgetUserId, toProviderCollectionPath } from '../config/backend-paths.js'
import { GOODREADS_BOOKS_TO_DISPLAY } from '../config/goodreads-config.js'
import { getLogger } from '../services/logger.js'
import { toStoredDateTime } from '../utils/time.js'
import { getXmlTextOrNull } from '../utils/goodreads-xml.js'
import { sortGoodreadsRecentlyReadBooksByReadAtDesc } from '../utils/sort-goodreads-recently-read-books.js'
import { simplifyTitleForGoogleBooksQuery } from '../utils/simplify-title-for-google-books-query.js'

import type {
  GoogleBooksFetchByIsbnResult,
  GoogleBooksVolumeSubset,
} from '../types/google-books.js'
import { isGoogleBooksVolumesResponseSubset } from '../types/google-books.js'
import type {
  GoodreadsAiReadShelfEntry,
  GoodreadsProfile,
  GoodreadsRecentlyReadBook,
  GoodreadsRecentlyReadBookFromGoogle,
  GoodreadsReviewListRawReview,
  GoodreadsUpdate,
  GoodreadsWidgetCollections,
  GoodreadsUserStatusBook,
  GoodreadsReviewBook,
} from '../types/goodreads.js'
import type { GoodreadsWidgetDocument } from '../types/widget-content.js'
import type { SyncJobExecutionOptions, SyncProgressReporter } from '../types/sync-pipeline.js'

const toBookMediaDestinationPath = id => `books/${id}-thumbnail.jpg`

const transformBookData = (
  book: GoodreadsRecentlyReadBookFromGoogle,
): GoodreadsRecentlyReadBook => {
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
    isbn,
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

type GoodreadsUpdateWithMedia = GoodreadsUpdate & {
  cdnMediaURL?: string
  mediaDestinationPath?: string
}

const processUpdatesWithMedia = async (
  updates: GoodreadsUpdate[] | null | undefined = [],
  books: GoodreadsRecentlyReadBook[] = [],
  onProgress?: SyncProgressReporter,
): Promise<GoodreadsUpdateWithMedia[] | null | undefined> => {
  const logger = getLogger()
  if (!updates || updates.length === 0) {
    return updates
  }

  // Create a map of books by ISBN for quick lookup
  const booksByISBN = new Map<string, GoodreadsRecentlyReadBook>()
  books.forEach(book => {
    // Get ISBN from book data (we store it in transformBookData)
    const isbn = book.isbn
    if (isbn && typeof isbn === 'string') {
      // Store by both with and without dashes for matching
      booksByISBN.set(isbn, book)
      booksByISBN.set(isbn.replace(/-/g, ''), book)
    }
  })

  // Find updates that need book data fetched
  const updatesNeedingBooks: Array<{ update: GoodreadsUpdate; isbn: string | null }> = []
  const updatesWithMedia: GoodreadsUpdateWithMedia[] = updates.map((update): GoodreadsUpdateWithMedia => {
    // Get ISBN from the update's book
    let isbn: string | null = null
    if ((update.type === 'userstatus' || update.type === 'review') && update.book) {
      const isbn13 = getXmlTextOrNull(update.book.isbn13)
      const isbn10 = getXmlTextOrNull(update.book.isbn)
      isbn = isbn13 ?? isbn10
    }

    // If we have ISBN, try to match with existing books
    if (isbn) {
      const matchingBook = booksByISBN.get(isbn) || booksByISBN.get(isbn.replace(/-/g, ''))
      if (matchingBook?.cdnMediaURL) {
        // Book already exists, use its CDN URL
        const updateWithMedia: GoodreadsUpdateWithMedia = { ...update }
        updateWithMedia.cdnMediaURL = matchingBook.cdnMediaURL
        updateWithMedia.mediaDestinationPath = matchingBook.mediaDestinationPath
        return updateWithMedia
      }
    }

    // Book not found in existing books, need to fetch it
    // Include update even if no ISBN (will fetch by title/author)
    updatesNeedingBooks.push({ update, isbn })
    return update
  })

  // Fetch books for updates that don't have matching books
  // Deduplicate by ISBN or title to avoid fetching the same book multiple times
  if (updatesNeedingBooks.length > 0) {
    onProgress?.({
      phase: 'goodreads.google_books',
      message: 'Fetching book data from Google Books.',
    })
    // Create a map of unique books to fetch (keyed by ISBN or title)
    const uniqueBooksToFetch = new Map<
      string,
      {
        update: GoodreadsUpdate
        isbn: string | null
        book: GoodreadsReviewBook | GoodreadsUserStatusBook
        updates: GoodreadsUpdate[]
      }
    >()
    updatesNeedingBooks.forEach(({ update, isbn }) => {
      const book = update.book
      if (!book?.title) return
      
      // Use ISBN as key if available, otherwise use title
      const key = isbn ? `isbn:${isbn}` : `title:${book.title.toLowerCase().trim()}`
      
      if (!uniqueBooksToFetch.has(key)) {
        uniqueBooksToFetch.set(key, {
          update, // Store first update as reference
          isbn,
          book,
          updates: [] // Store all updates that need this book
        })
      }
      
      // Add this update to the list of updates needing this book
      uniqueBooksToFetch.get(key).updates.push(update)
    })
    
    // Fetch each unique book only once with concurrency control and delays to avoid rate limiting
    const fetchedBookResults = await pMap(
      Array.from(uniqueBooksToFetch.values()),
      async ({ update, isbn, book, updates }, index) => {
        // Add a small delay between requests to avoid rate limiting (except for first request)
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)) // 200ms delay between requests
        }
        
        let result: GoogleBooksFetchByIsbnResult | null = null
        
        // Helper function to fetch with retry and exponential backoff
        const fetchWithRetry = async (fetchFn, maxRetries = 3) => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              return await fetchFn()
            } catch (error) {
              const statusCode = error.response?.statusCode || error.statusCode
              const errorBody = error.response?.body ? (typeof error.response.body === 'string' ? JSON.parse(error.response.body) : error.response.body) : null
              const isQuotaExceeded = errorBody?.error?.status === 'RESOURCE_EXHAUSTED' || 
                                      (errorBody?.error?.code === 429 && 
                                       errorBody?.error?.message?.includes('Quota exceeded'))
              
              // Don't retry on daily quota exceeded - it won't help
              if (isQuotaExceeded) {
                logger.error('Daily quota exceeded for Google Books API. Book fetch will be skipped.', {
                  message: errorBody?.error?.message,
                  quota_limit: errorBody?.error?.details?.[0]?.metadata?.quota_limit_value
                })
                throw error // Re-throw to be caught by outer try/catch
              }
              
              // Retry on 429 (rate limit) or 503 (Service Unavailable) - but not quota exceeded
              if ((statusCode === 429 || statusCode === 503) && attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000 // Exponential backoff: 2s, 4s, 8s
                logger.warn(`Rate limited (${statusCode}) for book fetch, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`)
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
              }
              
              // For other errors or max retries reached, throw
              throw error
            }
          }
        }
        
        // Try fetching by ISBN first (if available)
        if (isbn) {
          try {
            result = await fetchWithRetry(() => fetchBookFromGoogle({ isbn }))
          } catch (error) {
            logger.error(`Error fetching book by ISBN ${isbn} after retries:`, error)
            result = null
          }
        }
        
        // If ISBN search fails or no ISBN, try searching by title + author
        if (!result || !result.book) {
          if (book && book.title) {
            // Try to get author name - different structure for review vs userstatus updates
            const authorName = book.author?.name || book.author?.displayName || book.author?.sortName
            
            const titleForQuery =
              simplifyTitleForGoogleBooksQuery(book.title) || book.title.trim()
            let searchQuery
            if (authorName) {
              searchQuery = `intitle:${titleForQuery} inauthor:${authorName}`
            } else {
              searchQuery = `intitle:${titleForQuery}`
            }
            
            try {
              const googleBooksAPIKey = getGoogleBooksApiKey()
              result = await fetchWithRetry(async () => {
                const { body } = await got('https://www.googleapis.com/books/v1/volumes', {
                  searchParams: {
                    q: searchQuery,
                    key: googleBooksAPIKey,
                    country: 'US'
                  }
                })
                const parsed: unknown = JSON.parse(body)
                const foundBook: GoogleBooksVolumeSubset | undefined = isGoogleBooksVolumesResponseSubset(parsed)
                  ? parsed.items?.[0]
                  : undefined
                
                if (foundBook) {
                  return {
                    book: foundBook,
                    rating: null,
                  }
                }
                return null
              })
              
              if (result && result.book) {
                logger.info(`Found book by ${authorName ? 'title/author' : 'title'} for update: ${book.title}`)
              }
            } catch (error) {
              logger.error(`Error fetching book by ${authorName ? 'title/author' : 'title'} for ${book.title} after retries:`, error)
              result = null
            }
          }
        }
        
        return {
          googleBookResult: result,
          update, // Keep reference to first update for matching
          updates, // All updates that need this book
          isbn,
        }
      },
      {
        concurrency: 1, // Very low concurrency to avoid rate limiting (429 errors)
        stopOnError: false,
      }
    )
    
    // Extract ISBN from Google Books response if available, otherwise use the update's ISBN
    type FetchedBookWithMetadata = GoodreadsRecentlyReadBook & { update: GoodreadsUpdate }

    const fetchedBooksWithMetadata: FetchedBookWithMetadata[] = fetchedBookResults
      .filter(
        (
          entry,
        ): entry is typeof entry & {
          googleBookResult: GoogleBooksFetchByIsbnResult & { book: GoogleBooksVolumeSubset }
        } => Boolean(entry.googleBookResult && entry.googleBookResult.book),
      )
      .flatMap(({ googleBookResult, updates, isbn: updateISBN }) => {
        // Try to get ISBN from Google Books response first
        let isbn = updateISBN
        const volumeInfo = googleBookResult.book.volumeInfo
        if (volumeInfo?.industryIdentifiers) {
          const isbn13 = volumeInfo.industryIdentifiers.find(id => id.type === 'ISBN_13')
          const isbn10 = volumeInfo.industryIdentifiers.find(id => id.type === 'ISBN_10')
          isbn = isbn13?.identifier || isbn10?.identifier || updateISBN
        }
        
        const transformedBook = transformBookData({
          book: googleBookResult.book,
          rating: googleBookResult.rating,
          isbn,
        })
        
        // Return one entry per update that needs this book
        return updates.map(updateRef => ({
          ...transformedBook,
          update: updateRef, // Each update gets its own reference
        }))
      })

    // Upload media for newly fetched books
    const storedMediaFileNames = await listStoredMedia()
    const mediaToDownload = fetchedBooksWithMetadata
      .filter(({ mediaDestinationPath, thumbnail }) => {
        if (!thumbnail) {
          return false
        }
        const isAlreadyDownloaded = storedMediaFileNames.includes(mediaDestinationPath)
        return !isAlreadyDownloaded
      })
      .map(({ id, mediaDestinationPath, thumbnail }) => ({
        destinationPath: mediaDestinationPath,
        id,
        mediaURL: thumbnail,
      }))

    if (mediaToDownload.length > 0) {
      onProgress?.({
        phase: 'goodreads.covers',
        message: 'Fetching book cover images.',
      })
      try {
        await pMap(mediaToDownload, storeRemoteMedia, {
          concurrency: 10,
          stopOnError: false,
        })
        logger.info('Goodreads updates book media upload finished.', {
          mediaStore: describeMediaStore(),
          totalUploadedCount: mediaToDownload.length,
          uploadedFiles: mediaToDownload.map(({ destinationPath }) => destinationPath),
        })
      } catch (error) {
        logger.error('Something went wrong fetching and uploading update book media files.', error)
      }
    }

    // Create a map of fetched books by update reference, link, ISBN, and title for matching
    const fetchedBooksByUpdate = new Map<GoodreadsUpdate, FetchedBookWithMetadata>()
    const fetchedBooksByLink = new Map<string, FetchedBookWithMetadata>()
    const fetchedBooksByISBN = new Map<string, FetchedBookWithMetadata>()
    const fetchedBooksByTitle = new Map<string, FetchedBookWithMetadata>()
    
    fetchedBooksWithMetadata.forEach(book => {
      // Map by update object reference (most reliable for exact matches)
      if (book.update) {
        fetchedBooksByUpdate.set(book.update, book)
      }
      // Also map by update link (unique identifier)
      if (book.update && book.update.link) {
        fetchedBooksByLink.set(book.update.link, book)
      }
      // Map by ISBN from Google Books response
      if (book.isbn) {
        const isbnStr = String(book.isbn)
        fetchedBooksByISBN.set(isbnStr, book)
        fetchedBooksByISBN.set(isbnStr.replace(/-/g, ''), book)
      }
      // Also map by the update's original ISBN (in case it differs from Google Books)
      if (book.update) {
        let updateISBN = null
        if (book.update.type === 'userstatus' && book.update.book) {
          const isbn13 = book.update.book.isbn13
          const isbn10 = book.update.book.isbn
          updateISBN = getXmlTextOrNull(isbn13) ?? getXmlTextOrNull(isbn10)
        } else if (book.update.type === 'review' && book.update.book) {
          const isbn13 = book.update.book.isbn13
          const isbn10 = book.update.book.isbn
          updateISBN = getXmlTextOrNull(isbn13) ?? getXmlTextOrNull(isbn10)
        }
        if (updateISBN && String(updateISBN) !== String(book.isbn)) {
          fetchedBooksByISBN.set(String(updateISBN), book)
          fetchedBooksByISBN.set(String(updateISBN).replace(/-/g, ''), book)
        }
      }
      // Also map by title for cases where ISBN is missing (like review updates)
      if (book.title) {
        const titleKey = book.title.toLowerCase().trim()
        fetchedBooksByTitle.set(titleKey, book)
      }
    })

    // Update updates with fetched book data
    return updatesWithMedia.map((update): GoodreadsUpdateWithMedia => {
      if (update.cdnMediaURL) {
        // Already has media from existing books
        return update
      }

      // Try to match by update object reference first (most reliable)
      let fetchedBook: FetchedBookWithMetadata | undefined = fetchedBooksByUpdate.get(update)
      
      // Fallback to link matching
      if (!fetchedBook && update.link) {
        fetchedBook = fetchedBooksByLink.get(update.link)
      }
      
      // Fallback to ISBN matching
      if (!fetchedBook) {
        let isbn: string | null = null
        if (update.type === 'userstatus' && update.book) {
          const isbn13 = getXmlTextOrNull(update.book.isbn13)
          const isbn10 = getXmlTextOrNull(update.book.isbn)
          isbn = isbn13 ?? isbn10
        } else if (update.type === 'review' && update.book) {
          const isbn13 = getXmlTextOrNull(update.book.isbn13)
          const isbn10 = getXmlTextOrNull(update.book.isbn)
          isbn = isbn13 ?? isbn10
        }

        if (isbn) {
          const isbnStr = String(isbn)
          fetchedBook = fetchedBooksByISBN.get(isbnStr) || fetchedBooksByISBN.get(isbnStr.replace(/-/g, ''))
        }
      }
      
      // Fallback to title matching (for review updates without ISBN)
      if (!fetchedBook && update.book && update.book.title) {
        const titleKey = update.book.title.toLowerCase().trim()
        fetchedBook = fetchedBooksByTitle.get(titleKey)
      }

      if (fetchedBook && fetchedBook.cdnMediaURL) {
        const updateWithMedia: GoodreadsUpdateWithMedia = { ...update }
        updateWithMedia.cdnMediaURL = fetchedBook.cdnMediaURL
        updateWithMedia.mediaDestinationPath = fetchedBook.mediaDestinationPath
        return updateWithMedia
      }

      return update
    })
  }

  return updatesWithMedia
}

type FetchAllGoodreadsPromisesSuccess = {
  collections: GoodreadsWidgetCollections
  fullReadShelf: GoodreadsAiReadShelfEntry[]
  profile?: GoodreadsProfile
  responses: { user?: unknown; reviews?: GoodreadsReviewListRawReview[] }
}

type FetchAllGoodreadsPromisesResult = FetchAllGoodreadsPromisesSuccess | { error: string }

const fetchAllGoodreadsPromises = async (
  onProgress?: SyncProgressReporter,
): Promise<FetchAllGoodreadsPromisesResult> => {
  const logger = getLogger()
  try {
    onProgress?.({
      phase: 'goodreads.books',
      message: 'Fetching books from Goodreads.',
    })
    const [user, recentlyRead] = await Promise.all([
      fetchUser(),
      fetchRecentlyReadBooks(),
    ])

    let fullReadShelf: GoodreadsAiReadShelfEntry[] = []
    try {
      onProgress?.({
        phase: 'goodreads.full_shelf',
        message: 'Scanning your full read shelf for the AI summary.',
      })
      fullReadShelf = await fetchFullReadShelfForAi()
    } catch (error: unknown) {
      logger.warn(
        'Could not paginate full Goodreads read shelf for AI summary; summary will use widget books only.',
        error instanceof Error ? error.message : error,
      )
    }

    const processedUpdates =
      user.updates == null
        ? null
        : await processUpdatesWithMedia(user.updates, recentlyRead.books ?? [], onProgress)

    return {
      collections: {
        recentlyReadBooks: sortGoodreadsRecentlyReadBooksByReadAtDesc(
          recentlyRead.books ?? [],
        ).slice(0, GOODREADS_BOOKS_TO_DISPLAY),
        updates: processedUpdates,
      },
      fullReadShelf,
      profile: user.profile,
      responses: {
        user: user.jsonResponse,
        reviews: recentlyRead.rawReviewsResponse,
      },
    }
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Sync Goodreads Data
 */
const syncGoodreadsData = async (
  documentStore: DocumentStore,
  { userId = getDefaultWidgetUserId(), onProgress }: SyncJobExecutionOptions = {}
) => {
  const logger = getLogger()
  const goodreadsCollectionPath = toProviderCollectionPath('goodreads', userId)
  const result = await fetchAllGoodreadsPromises(onProgress)

  if ('error' in result) {
    logger.error('Failed to fetch Goodreads data.', result.error)
    return {
      result: 'FAILURE',
      error: result.error,
    }
  }

  const widgetContent: GoodreadsWidgetDocument = {
    collections: result.collections,
    meta: {
      synced: toStoredDateTime(),
    },
    profile: result.profile,
  }

  // Generate AI summary (LLM)
  let aiSummary: string | undefined
  try {
    onProgress?.({
      phase: 'goodreads.ai',
      message: 'Generating Goodreads AI summary.',
    })
    aiSummary = await generateGoodreadsSummary(widgetContent, {
      fullReadShelf: result.fullReadShelf,
    })
    widgetContent.aiSummary = aiSummary
  } catch (error) {
    logger.error('Failed to generate Goodreads AI summary:', error)
    // Continue with sync even if AI summary fails
  }

  const saveUserResponse = async () => await documentStore.setDocument(
    `${goodreadsCollectionPath}/last-response_user-show`,
    {
      response: result.responses.user,
      updated: toStoredDateTime(),
    }
  )

  const saveBookReviews = async () => await documentStore.setDocument(
    `${goodreadsCollectionPath}/last-response_book-reviews`,
    {
      response: result.responses.reviews,
      updated: toStoredDateTime(),
    }
  )

  const saveWidgetContent = async () =>
    await documentStore.setDocument(`${goodreadsCollectionPath}/widget-content`, widgetContent)

  const saveAISummary = async () => {
    if (aiSummary) {
      await documentStore.setDocument(`${goodreadsCollectionPath}/last-response_ai-summary`, {
        summary: aiSummary,
        generatedAt: toStoredDateTime(),
      })
    }
  }

  try {
    onProgress?.({
      phase: 'goodreads.persist',
      message: 'Saving Goodreads profile, books, and summaries to storage.',
    })
    await Promise.all([
      saveUserResponse(),
      saveBookReviews(),
      saveWidgetContent(),
      saveAISummary(),
    ])
  } catch (err) {
    logger.error('Failed to save Goodreads data to database.', err)
    return {
      result: 'FAILURE',
      error: err.message || err,
    }
  }

  return {
    result: 'SUCCESS',
    data: widgetContent
  }
}

export default syncGoodreadsData
