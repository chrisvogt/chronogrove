import { describe, it, expect, vi, beforeEach } from 'vitest'

const syncGoodreadsMediaTarget = vi.hoisted(() => {
  const { join } = require('node:path') as typeof import('node:path')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto')
  return join(tmpdir(), `cg-sync-goodreads-${randomUUID()}`)
})

import syncGoodreadsData from './sync-goodreads-data.js'
import type { DocumentStore } from '../ports/document-store.js'
import { configureLogger } from '../services/logger.js'

// Use fake timers for retry/delay tests
vi.useFakeTimers()

// Mock the API functions
vi.mock('../api/goodreads/fetch-user.js', () => ({
  default: vi.fn()
}))

vi.mock('../api/goodreads/fetch-recently-read-books.js', () => ({
  default: vi.fn()
}))

vi.mock('../api/goodreads/fetch-full-read-shelf-for-ai.js', () => ({
  default: vi.fn()
}))

vi.mock('../api/goodreads/generate-goodreads-summary.js', () => ({
  default: vi.fn()
}))

vi.mock('p-map', () => ({
  default: vi.fn()
}))

vi.mock('../api/google-books/fetch-book.js', () => ({
  default: vi.fn()
}))

vi.mock('got', () => ({
  default: vi.fn()
}))

vi.mock('../services/media/media-service.js', () => ({
  describeMediaStore: vi.fn(() => ({ backend: 'disk', target: syncGoodreadsMediaTarget })),
  listStoredMedia: vi.fn(),
  storeRemoteMedia: vi.fn(),
  toPublicMediaUrl: vi.fn((path) => `https://cdn.example.com/${path}`),
}))

import fetchUser from '../api/goodreads/fetch-user.js'
import fetchFullReadShelfForAi from '../api/goodreads/fetch-full-read-shelf-for-ai.js'
import fetchRecentlyReadBooks from '../api/goodreads/fetch-recently-read-books.js'
import generateGoodreadsSummary from '../api/goodreads/generate-goodreads-summary.js'

describe('syncGoodreadsData', () => {
  let documentStore: DocumentStore
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    configureLogger(logger)
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn().mockResolvedValue(undefined),
    }
    fetchFullReadShelfForAi.mockResolvedValue([])

    // Mock pMap to just execute the mapper function synchronously
    const pMapModule = await import('p-map')
    pMapModule.default.mockImplementation(async (items, mapper) => {
      const results = []
      for (const item of items) {
        results.push(await mapper(item))
      }
      return results
    })

    // Mock listStoredMedia to return empty array
    const mediaService = await import('../services/media/media-service.js')
    mediaService.listStoredMedia.mockResolvedValue([])
  })

  it('should successfully sync Goodreads data and save to database', async () => {
    const mockUserData = {
      profile: {
        displayName: 'Test User',
        profileURL: 'https://www.goodreads.com/user/show/123'
      },
      updates: [
        {
          id: 'update1',
          type: 'review',
          content: 'Great book!'
        }
      ],
      jsonResponse: { user: 'data' }
    }

    const mockRecentlyReadData = {
      books: [
        {
          id: 'book1',
          title: 'Test Book',
          author: 'Test Author',
          rating: 4
        }
      ],
      rawReviewsResponse: { reviews: 'data' }
    }

    const mockAISummary = '<p>Chris has been actively reading lately.</p>'

    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    generateGoodreadsSummary.mockResolvedValue(mockAISummary)

    const result = await syncGoodreadsData(documentStore)

    expect(generateGoodreadsSummary).toHaveBeenCalledWith(expect.any(Object), { fullReadShelf: [] })
    expect(result.result).toBe('SUCCESS')
    expect(result.data.collections).toEqual({
      recentlyReadBooks: mockRecentlyReadData.books,
      updates: mockUserData.updates
    })
    expect(result.data.profile).toEqual(mockUserData.profile)
    expect(result.data.meta.synced).toEqual(expect.any(String))
    expect(result.data.aiSummary).toBe(mockAISummary)

    expect(documentStore.setDocument).toHaveBeenCalledTimes(4)
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/last-response_user-show',
      expect.objectContaining({
        response: { user: 'data' },
        updated: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/last-response_book-reviews',
      expect.objectContaining({
        response: { reviews: 'data' },
        updated: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/widget-content',
      expect.objectContaining({
        aiSummary: mockAISummary,
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/last-response_ai-summary',
      expect.objectContaining({
        summary: mockAISummary,
        generatedAt: expect.any(String),
      })
    )
  })

  it('should sort recentlyReadBooks by readAt descending before persisting widget content', async () => {
    fetchUser.mockResolvedValue({
      profile: { displayName: 'Reader', readCount: 2 },
      updates: [],
      jsonResponse: {},
    })
    fetchRecentlyReadBooks.mockResolvedValue({
      books: [
        {
          id: 'older',
          title: 'Older read',
          readAt: '2020-06-01',
          categories: [],
          cdnMediaURL: 'https://cdn.example/o.jpg',
          mediaDestinationPath: 'books/older.jpg',
          smallThumbnail: '',
          thumbnail: '',
          infoLink: '',
        },
        {
          id: 'newer',
          title: 'Newer read',
          readAt: '2025-03-15',
          categories: [],
          cdnMediaURL: 'https://cdn.example/n.jpg',
          mediaDestinationPath: 'books/newer.jpg',
          smallThumbnail: '',
          thumbnail: '',
          infoLink: '',
        },
      ],
      rawReviewsResponse: [],
    })
    generateGoodreadsSummary.mockResolvedValue('<p>Summary.</p>')

    const result = await syncGoodreadsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    const sorted = result.data.collections?.recentlyReadBooks ?? []
    expect(sorted).toHaveLength(2)
    expect(sorted[0]?.id).toBe('newer')
    expect(sorted[0]?.readAt).toBe('2025-03-15')
    expect(sorted[1]?.id).toBe('older')

    const widgetCall = vi.mocked(documentStore.setDocument).mock.calls.find(
      (call) => call[0] === 'users/chrisvogt/goodreads/widget-content',
    )
    const persisted = widgetCall?.[1] as { collections?: { recentlyReadBooks?: { id?: string }[] } }
    expect(persisted?.collections?.recentlyReadBooks?.[0]?.id).toBe('newer')
  })

  it('should handle API errors gracefully', async () => {
    fetchUser.mockRejectedValue(new Error('API Error'))
    fetchRecentlyReadBooks.mockResolvedValue({ books: [], rawReviewsResponse: {} })

    const result = await syncGoodreadsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'API Error'
    })

    expect(documentStore.setDocument).not.toHaveBeenCalled()
  })

  it('persists null updates when Goodreads user payload has null updates', async () => {
    fetchUser.mockResolvedValue({
      profile: { displayName: 'Reader' },
      updates: null,
      jsonResponse: {},
    })
    fetchRecentlyReadBooks.mockResolvedValue({ books: [], rawReviewsResponse: [] })
    generateGoodreadsSummary.mockResolvedValue('<p>x</p>')

    const result = await syncGoodreadsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.data.collections?.updates).toBeNull()
  })

  it('treats null recentlyRead.books as empty when processing updates', async () => {
    const mockFetchBookFromGoogle = (await import('../api/google-books/fetch-book.js')).default
    const mockPMap = (await import('p-map')).default
    fetchUser.mockResolvedValue({
      profile: { displayName: 'Reader' },
      updates: [{ id: 'u1', type: 'userstatus', book: { title: 'T', isbn13: '9781111111111' } }],
      jsonResponse: {},
    })
    fetchRecentlyReadBooks.mockResolvedValue({
      books: null as unknown as never,
      rawReviewsResponse: [],
    })
    generateGoodreadsSummary.mockResolvedValue('<p>x</p>')
    vi.mocked(mockFetchBookFromGoogle).mockResolvedValue({
      book: {
        id: 'gb1',
        volumeInfo: { title: 'T', imageLinks: { thumbnail: 'http://x/t.jpg' } },
      },
      rating: null,
    })
    mockPMap.mockImplementation(async (items: unknown[], mapper: (item: unknown, i: number) => Promise<unknown>) => {
      const results: unknown[] = []
      for (let i = 0; i < items.length; i++) {
        results.push(await mapper(items[i], i))
      }
      return results
    })
    const resultPromise = syncGoodreadsData(documentStore)
    await vi.runAllTimersAsync()
    const result = await resultPromise
    expect(result.result).toBe('SUCCESS')
  })

  it('should handle database save errors', async () => {
    const mockUserData = {
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: {}
    }

    const mockRecentlyReadData = {
      books: [],
      rawReviewsResponse: {}
    }

    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    vi.mocked(documentStore.setDocument).mockRejectedValue(new Error('Database Error'))

    const result = await syncGoodreadsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Database Error'
    })
  })

  it('should surface non-Error database save failures', async () => {
    const mockUserData = {
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: {},
    }
    const mockRecentlyReadData = {
      books: [],
      rawReviewsResponse: {},
    }
    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    vi.mocked(documentStore.setDocument).mockRejectedValue('persist unavailable')

    const result = await syncGoodreadsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'persist unavailable',
    })
  })

  it('continues when full read shelf pagination fails and passes empty shelf to the AI summary', async () => {
    const mockUserData = {
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: {},
    }
    const mockRecentlyReadData = {
      books: [{ id: 'b1', title: 'Still Here' }],
      rawReviewsResponse: [],
    }

    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    fetchFullReadShelfForAi.mockRejectedValue(new Error('Goodreads timeout'))
    generateGoodreadsSummary.mockResolvedValue('<p>One</p><p>Two</p>')

    const result = await syncGoodreadsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(logger.warn).toHaveBeenCalledWith(
      'Could not paginate full Goodreads read shelf for AI summary; summary will use widget books only.',
      'Goodreads timeout',
    )
    expect(generateGoodreadsSummary).toHaveBeenCalledWith(expect.any(Object), { fullReadShelf: [] })
  })

  it('logs non-Error rejections from full read shelf fetch as-is', async () => {
    const mockUserData = {
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: {},
    }
    const mockRecentlyReadData = {
      books: [],
      rawReviewsResponse: [],
    }

    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    fetchFullReadShelfForAi.mockRejectedValue('upstream unavailable')
    generateGoodreadsSummary.mockResolvedValue('<p>a</p><p>b</p>')

    await syncGoodreadsData(documentStore)

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not paginate full Goodreads read shelf for AI summary; summary will use widget books only.',
      'upstream unavailable',
    )
  })

  it('should handle partial API failures', async () => {
    fetchUser.mockResolvedValue({
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: {}
    })
    fetchRecentlyReadBooks.mockRejectedValue(new Error('Reviews API Error'))

    const result = await syncGoodreadsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Reviews API Error'
    })
  })

  it('should continue sync even when AI summary generation fails', async () => {
    const mockUserData = {
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: { user: 'data' }
    }

    const mockRecentlyReadData = {
      books: [{ id: 'book1', title: 'Test Book' }],
      rawReviewsResponse: { reviews: 'data' }
    }

    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    generateGoodreadsSummary.mockRejectedValue(new Error('AI API Error'))

    const result = await syncGoodreadsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.data.aiSummary).toBeUndefined()
    
    // Should still save other data
    expect(documentStore.setDocument).toHaveBeenCalledTimes(3)
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/last-response_user-show',
      expect.any(Object)
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/last-response_book-reviews',
      expect.any(Object)
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/widget-content',
      expect.any(Object)
    )
  })

  it('should save AI summary separately when generated successfully', async () => {
    const mockUserData = {
      profile: { displayName: 'Test User' },
      updates: [],
      jsonResponse: { user: 'data' }
    }

    const mockRecentlyReadData = {
      books: [{ id: 'book1', title: 'Test Book' }],
      rawReviewsResponse: { reviews: 'data' }
    }

    const mockAISummary = '<p>AI generated summary</p>'

    fetchUser.mockResolvedValue(mockUserData)
    fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
    generateGoodreadsSummary.mockResolvedValue(mockAISummary)

    const result = await syncGoodreadsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.data.aiSummary).toBe(mockAISummary)
    
    // Verify AI summary was saved separately
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/goodreads/last-response_ai-summary',
      {
        summary: mockAISummary,
        generatedAt: expect.any(String)
      }
    )
  })

  describe('processUpdatesWithMedia', () => {
    let mockFetchBookFromGoogle
    let mockGot
    let mockListStoredMedia
    let mockFetchAndUploadFile
    let mockPMap
    let mockLogger

    beforeEach(async () => {
      mockFetchBookFromGoogle = (await import('../api/google-books/fetch-book.js')).default
      mockGot = (await import('got')).default
      mockListStoredMedia = (await import('../services/media/media-service.js')).listStoredMedia
      mockFetchAndUploadFile = (await import('../services/media/media-service.js')).storeRemoteMedia
      mockPMap = (await import('p-map')).default
      mockLogger = logger

      // Set up environment variables
      process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    })

    it('should return empty updates unchanged', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates).toEqual([])
    })

    it('should match userstatus updates with existing books by ISBN13', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              isbn: '0143127551',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'book1',
            isbn: '9780143127550',
            title: 'Test Book',
            cdnMediaURL: 'https://cdn.example.com/books/book1-thumbnail.jpg',
            mediaDestinationPath: 'books/book1-thumbnail.jpg'
          }
        ],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockListStoredMedia.mockResolvedValue([])

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBe('https://cdn.example.com/books/book1-thumbnail.jpg')
      expect(result.data.collections.updates[0].mediaDestinationPath).toBe('books/book1-thumbnail.jpg')
    })

    it('applies delay after the first Google Books fetch when multiple new books are needed', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'u1',
            type: 'userstatus',
            book: { isbn13: '9781000000001', title: 'Alpha' },
          },
          {
            id: 'u2',
            type: 'userstatus',
            book: { isbn13: '9782000000002', title: 'Beta' },
          },
        ],
        jsonResponse: { user: 'data' },
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      }

      const makeBook = (id: string) => ({
        book: {
          id,
          volumeInfo: {
            title: 'x',
            imageLinks: { thumbnail: 'http://books.google.com/t.jpg' },
          },
        },
        rating: null,
      })

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle
        .mockResolvedValueOnce(makeBook('g1'))
        .mockResolvedValueOnce(makeBook('g2'))
      mockListStoredMedia.mockResolvedValue([])

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockFetchBookFromGoogle).toHaveBeenCalledTimes(2)
    })

    it('keeps CDN from existing books while still fetching covers for other updates', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'u1',
            type: 'userstatus',
            book: { isbn13: '9781111111111', title: 'Cached' },
          },
          {
            id: 'u2',
            type: 'userstatus',
            book: { isbn13: '9782222222222', title: 'Need Fetch' },
          },
        ],
        jsonResponse: { user: 'data' },
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'b1',
            isbn: '9781111111111',
            title: 'Cached',
            cdnMediaURL: 'https://cdn.example.com/cached.jpg',
            mediaDestinationPath: 'books/cached.jpg',
          },
        ],
        rawReviewsResponse: { reviews: 'data' },
      }

      const mockGoogleBookResult = {
        book: {
          id: 'gb2',
          volumeInfo: {
            title: 'Need Fetch',
            imageLinks: { thumbnail: 'http://books.google.com/t2.jpg' },
          },
        },
        rating: null,
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBe('https://cdn.example.com/cached.jpg')
      expect(result.data.collections.updates[1].cdnMediaURL).toBeDefined()
    })

    it('invokes onProgress for Goodreads SSE phases when Google Books and covers run', async () => {
      const onProgress = vi.fn()
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'u1',
            type: 'userstatus',
            book: { isbn13: '9781111111111', title: 'Cached' },
          },
          {
            id: 'u2',
            type: 'userstatus',
            book: { isbn13: '9782222222222', title: 'Need Fetch' },
          },
        ],
        jsonResponse: { user: 'data' },
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'b1',
            isbn: '9781111111111',
            title: 'Cached',
            cdnMediaURL: 'https://cdn.example.com/cached.jpg',
            mediaDestinationPath: 'books/cached.jpg',
          },
        ],
        rawReviewsResponse: { reviews: 'data' },
      }

      const mockGoogleBookResult = {
        book: {
          id: 'gb2',
          volumeInfo: {
            title: 'Need Fetch',
            imageLinks: { thumbnail: 'http://books.google.com/t2.jpg' },
          },
        },
        rating: null,
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      fetchFullReadShelfForAi.mockResolvedValue([{ title: 'Shelf A' }])
      generateGoodreadsSummary.mockResolvedValue('<p>x</p><p>y</p>')

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore, { onProgress })
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(onProgress.mock.calls.map((c) => c[0].phase)).toEqual(
        expect.arrayContaining([
          'goodreads.books',
          'goodreads.full_shelf',
          'goodreads.google_books',
          'goodreads.covers',
          'goodreads.ai',
          'goodreads.persist',
        ]),
      )
    })

    it('should match userstatus updates with existing books by ISBN10 when ISBN13 not available', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: { nil: 'true' }, // nil object
              isbn: '0143127551',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'book1',
            isbn: '0143127551',
            title: 'Test Book',
            cdnMediaURL: 'https://cdn.example.com/books/book1-thumbnail.jpg',
            mediaDestinationPath: 'books/book1-thumbnail.jpg'
          }
        ],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockListStoredMedia.mockResolvedValue([])

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBe('https://cdn.example.com/books/book1-thumbnail.jpg')
    })

    it('should match review updates with existing books by ISBN', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'review',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'book1',
            isbn: '9780143127550',
            title: 'Test Book',
            cdnMediaURL: 'https://cdn.example.com/books/book1-thumbnail.jpg',
            mediaDestinationPath: 'books/book1-thumbnail.jpg'
          }
        ],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockListStoredMedia.mockResolvedValue([])

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBe('https://cdn.example.com/books/book1-thumbnail.jpg')
    })

    it('should match books by ISBN without dashes', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '978-0-14-312755-0', // with dashes
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'book1',
            isbn: '9780143127550', // without dashes
            title: 'Test Book',
            cdnMediaURL: 'https://cdn.example.com/books/book1-thumbnail.jpg',
            mediaDestinationPath: 'books/book1-thumbnail.jpg'
          }
        ],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockListStoredMedia.mockResolvedValue([])

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBe('https://cdn.example.com/books/book1-thumbnail.jpg')
    })

    it('should fetch book from Google Books API when not in existing books', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [], // No existing books
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author'],
            infoLink: 'http://books.google.com/book',
            imageLinks: {
              smallThumbnail: 'http://books.google.com/small.jpg',
              thumbnail: 'http://books.google.com/thumb.jpg',
            },
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9780143127550' }
            ]
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      // Mock pMap to execute the mapper function
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockFetchBookFromGoogle).toHaveBeenCalledWith({ isbn: '9780143127550' })
    })

    it('should search by title and author when ISBN search fails', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book',
              author: { name: 'Test Author' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author'],
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null) // ISBN search fails
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should have attempted title/author search
      expect(mockGot).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: 'intitle:Test Book inauthor:Test Author',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    })

    it('should search with simplified title when book title has series parenthetical', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'The Secret Commonwealth (The Book of Dust, #2)',
              author: { name: 'Philip Pullman' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'The Secret Commonwealth',
            authors: ['Philip Pullman'],
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockGot).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: 'intitle:The Secret Commonwealth inauthor:Philip Pullman',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    })

    it('should use raw title when simplification is empty for update title search', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: '(Paren Only)',
              author: { name: 'Some Author' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'X',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockGot).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: 'intitle:(Paren Only) inauthor:Some Author',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    })

    it('should search by title only when author is not available', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
              // No author
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockGot).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: 'intitle:Test Book',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    })

    it('should handle author with displayName property', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book',
              author: { displayName: 'Display Author' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify({ items: [] }) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockGot).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: 'intitle:Test Book inauthor:Display Author',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    })

    it('should handle author with sortName property', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book',
              author: { sortName: 'Author, Sort' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify({ items: [] }) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockGot).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        searchParams: {
          q: 'intitle:Test Book inauthor:Author, Sort',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    })

    it('should upload book media for newly fetched books', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            link: 'https://goodreads.com/update/1',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            authors: ['Test Author'],
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            },
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9780143127550' }
            ]
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([]) // No existing media
      mockFetchAndUploadFile.mockResolvedValue({ fileName: 'books/google-book-id-thumbnail.jpg' })
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should have called pMap for media upload
      expect(mockPMap).toHaveBeenCalled()
    })

    it('should skip media upload for already downloaded media', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            link: 'https://goodreads.com/update/1',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue(['books/google-book-id-thumbnail.jpg']) // Already exists
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // fetchAndUploadFile should not be called since media already exists
      expect(mockFetchAndUploadFile).not.toHaveBeenCalled()
    })

    it('should handle media upload errors gracefully', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            link: 'https://goodreads.com/update/1',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      let pMapCallCount = 0
      mockPMap.mockImplementation(async (items, mapper) => {
        pMapCallCount++
        if (pMapCallCount === 1) {
          // First call: book fetching
          const results = []
          for (let i = 0; i < items.length; i++) {
            const result = await mapper(items[i], i)
            results.push(result)
          }
          return results
        } else {
          // Second call: media upload - throw error
          throw new Error('Upload failed')
        }
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Something went wrong fetching and uploading update book media files.',
        expect.any(Error)
      )
    })

    it('should skip updates without title for book fetching', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550'
              // No title
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should not attempt title search without title
      expect(mockGot).not.toHaveBeenCalled()
    })

    it('should deduplicate book fetches for multiple updates with same ISBN', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          },
          {
            id: 'update2',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550', // Same ISBN
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should only fetch once for deduplicated ISBN
      expect(mockFetchBookFromGoogle).toHaveBeenCalledTimes(1)
    })

    it('should deduplicate book fetches by title when no ISBN', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              title: 'Test Book'
              // No ISBN
            }
          },
          {
            id: 'update2',
            type: 'userstatus',
            book: {
              title: 'Test Book' // Same title
              // No ISBN
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify({ items: [] }) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should only search once for deduplicated title
      expect(mockGot).toHaveBeenCalledTimes(1)
    })

    it('should handle rate limit errors with retry', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const rateLimitError = {
        response: {
          statusCode: 429,
          body: JSON.stringify({ error: { message: 'Rate limit exceeded' } })
        }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
    })

    it('should continue writing Goodreads data to canonical collections', async () => {
      fetchUser.mockResolvedValue({
        profile: { displayName: 'Test User' },
        updates: [],
        jsonResponse: { user: 'data' },
      })
      fetchRecentlyReadBooks.mockResolvedValue({
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      })
      generateGoodreadsSummary.mockResolvedValue('<p>Summary</p>')

      await syncGoodreadsData(documentStore, {
        userId: 'chrisvogt',
      })

      expect(documentStore.setDocument).toHaveBeenCalledWith(
        'users/chrisvogt/goodreads/widget-content',
        expect.any(Object)
      )
    })

    it('should handle quota exceeded errors without retry', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const quotaExceededError = {
        response: {
          statusCode: 429,
          body: JSON.stringify({
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Quota exceeded for quota metric',
              details: [{ metadata: { quota_limit_value: '1000' } }]
            }
          })
        }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockRejectedValue(quotaExceededError)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Daily quota exceeded for Google Books API. Book fetch will be skipped.',
        expect.objectContaining({
          message: 'Quota exceeded for quota metric'
        })
      )
    })

    it('should treat 429 with Quota exceeded message as quota when status is not RESOURCE_EXHAUSTED', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const quotaMessageOnlyError = {
        response: {
          statusCode: 429,
          body: JSON.stringify({
            error: {
              code: 429,
              message: 'Quota exceeded for this project.',
            },
          }),
        }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockRejectedValue(quotaMessageOnlyError)
      mockListStoredMedia.mockResolvedValue([])

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Daily quota exceeded for Google Books API. Book fetch will be skipped.',
        expect.objectContaining({
          message: 'Quota exceeded for this project.',
        })
      )
    })

    it('should retry book fetch when Google returns 503 Service Unavailable', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const serviceUnavailableError = {
        response: {
          statusCode: 503,
          body: JSON.stringify({ error: { message: 'Backend unavailable' } })
        }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle
        .mockRejectedValueOnce(serviceUnavailableError)
        .mockResolvedValueOnce(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])

      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/Rate limited \(503\)/),
      )
    })

    it('should match updates to fetched books by link', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            link: 'https://goodreads.com/update/unique-link',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBeDefined()
    })

    it('should match updates to fetched books by title fallback', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'review', // Review type without ISBN
            book: {
              title: 'Unique Test Book Title'
              // No ISBN
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'Unique Test Book Title',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBeDefined()
    })

    it('skips title-key map when fetched Google volume omits title', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            link: 'https://goodreads.com/u/1',
            book: { isbn13: '9780143127550', title: 'Has Title' },
          },
        ],
        jsonResponse: { user: 'data' },
      }
      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      }
      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
            industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780143127550' }],
          },
        },
        rating: null,
      }
      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })
      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise
      expect(result.result).toBe('SUCCESS')
    })

    it('should handle books without thumbnails', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book'
            // No imageLinks
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should not attempt media upload for books without thumbnails
      expect(mockFetchAndUploadFile).not.toHaveBeenCalled()
    })

    it('should handle title search errors gracefully', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book',
              author: { name: 'Test Author' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockRejectedValue(new Error('Network error'))
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching book by title/author'),
        expect.any(Error)
      )
    })

    it('treats non-subset Google volumes JSON as no items for the type guard', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: { isbn13: '9780143127550', title: 'Bad JSON Shape' },
          },
        ],
        jsonResponse: { user: 'data' },
      }
      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      }
      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify({ totalItems: 0 }) })
      mockListStoredMedia.mockResolvedValue([])
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })
      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise
      expect(result.result).toBe('SUCCESS')
    })

    it('returns null from volumes helper when response has empty items array', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: { isbn13: '9780143127550', title: 'No Hits' },
          },
        ],
        jsonResponse: { user: 'data' },
      }
      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      }
      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify({ items: [] }) })
      mockListStoredMedia.mockResolvedValue([])
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })
      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise
      expect(result.result).toBe('SUCCESS')
    })

    it('logs title-only path when volumes search fails with no author on the update', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Solo Title',
            },
          },
        ],
        jsonResponse: { user: 'data' },
      }
      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      }
      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockRejectedValue(new Error('Network error'))
      mockListStoredMedia.mockResolvedValue([])
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })
      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise
      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching book by title for Solo Title'),
        expect.any(Error),
      )
    })

    it('should extract ISBN_10 from Google Books when ISBN_13 is absent', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            },
            industryIdentifiers: [{ type: 'ISBN_10', identifier: '0143127551' }],
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
    })

    it('falls back to update ISBN when volume industryIdentifiers omit ISBN_13 and ISBN_10', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: { isbn13: '9780143127550', title: 'Test Book' },
          },
        ],
        jsonResponse: { user: 'data' },
      }
      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' },
      }
      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
            industryIdentifiers: [{ type: 'OTHER', identifier: 'nope' }],
          },
        },
        rating: null,
      }
      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      })
      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise
      expect(result.result).toBe('SUCCESS')
    })

    it('should handle review update types with ISBN10', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'review',
            book: {
              isbn13: null,
              isbn: '0143127551', // ISBN10
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [
          {
            id: 'book1',
            isbn: '0143127551',
            title: 'Test Book',
            cdnMediaURL: 'https://cdn.example.com/books/book1-thumbnail.jpg',
            mediaDestinationPath: 'books/book1-thumbnail.jpg'
          }
        ],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockListStoredMedia.mockResolvedValue([])

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBe('https://cdn.example.com/books/book1-thumbnail.jpg')
    })

    it('should handle updates without book property', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus'
            // No book property
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
    })

    it('should handle 503 service unavailable with retry', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const serviceUnavailableError = {
        response: {
          statusCode: 503,
          body: JSON.stringify({ error: { message: 'Service temporarily unavailable' } })
        }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle
        .mockRejectedValueOnce(serviceUnavailableError)
        .mockResolvedValueOnce(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
    })

    it('should log book found by title/author search', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book',
              author: { name: 'Test Author' }
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null) // ISBN search fails
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found book by title/author for update')
      )
    })

    it('should handle null updates', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: null, // null updates
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)

      const result = await syncGoodreadsData(documentStore)

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates).toBeNull()
    })

    it('should handle ISBN search error gracefully and continue', async () => {
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockRejectedValue(new Error('API Error'))
      mockGot.mockResolvedValue({ body: JSON.stringify({ items: [] }) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching book by ISBN'),
        expect.any(Error)
      )
    })

    it('should fallback to link matching when update reference not found', async () => {
      // This tests line 368-369: fallback to link matching
      const updateWithLink = {
        id: 'update1',
        type: 'userstatus',
        link: 'https://goodreads.com/update/unique-link-123',
        book: {
          isbn13: '9780143127550',
          title: 'Test Book'
        }
      }

      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [updateWithLink],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      // Mock pMap to return results that will need link-based matching
      // The key is that the update object reference changes during the process
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          // Clone update identities so final matching falls back to link matching.
          // NOTE: `processUpdatesWithMedia` uses the `updates` array later to create
          // `fetchedBooksWithMetadata[].update`, so we must clone `result.updates` (not only `result.update`).
          const clonedUpdates = Array.isArray(result?.updates)
            ? result.updates.map((u: unknown) => (typeof u === 'object' && u ? { ...(u as object) } : u))
            : result?.updates
          results.push({
            ...result,
            ...(result?.update ? { update: clonedUpdates?.[0] ?? result.update } : {}),
            ...(result?.updates ? { updates: clonedUpdates } : {}),
          })
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      // Should have CDN URL from the fetched book matched by link
      expect(result.data.collections.updates[0].cdnMediaURL).toBeDefined()
    })

    it('should fallback to ISBN matching for review updates in final matching phase', async () => {
      // This tests lines 379-382: review type ISBN fallback in final matching
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'review', // Review type
            book: {
              isbn13: '9780143127550',
              isbn: '0143127551',
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [], // No existing books to match initially
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            },
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9780143127550' }
            ]
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          // Clone update identities so final matching falls back to ISBN matching.
          const clonedUpdates = Array.isArray(result?.updates)
            ? result.updates.map((u: unknown) => (typeof u === 'object' && u ? { ...(u as object) } : u))
            : result?.updates
          results.push({
            ...result,
            ...(result?.update ? { update: clonedUpdates?.[0] ?? result.update } : {}),
            ...(result?.updates ? { updates: clonedUpdates } : {}),
          })
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBeDefined()
    })

    it('should use ISBN10 for review updates when ISBN13 is not a string', async () => {
      // This tests lines 379-382 specifically with ISBN10 fallback
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'review',
            book: {
              isbn13: { nil: 'true' }, // Not a string
              isbn: '0143127551', // Valid ISBN10 string
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
    })

    it('should handle review updates without ISBN in final matching (title fallback)', async () => {
      // This ensures the title fallback works for review updates without ISBN
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'review',
            book: {
              // No isbn13 or isbn
              title: 'Unique Book Title For Testing'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleSearchResponse = {
        items: [{
          id: 'search-result-id',
          volumeInfo: {
            title: 'Unique Book Title For Testing',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            }
          }
        }]
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(null)
      mockGot.mockResolvedValue({ body: JSON.stringify(mockGoogleSearchResponse) })
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBeDefined()
    })

    it('should handle different ISBN in update vs Google Books response', async () => {
      // Tests line 344-347: mapping by both update ISBN and Google Books ISBN
      const mockUserData = {
        profile: { displayName: 'Test User' },
        updates: [
          {
            id: 'update1',
            type: 'userstatus',
            book: {
              isbn13: '9780143127550', // Update has this ISBN
              title: 'Test Book'
            }
          }
        ],
        jsonResponse: { user: 'data' }
      }

      const mockRecentlyReadData = {
        books: [],
        rawReviewsResponse: { reviews: 'data' }
      }

      const mockGoogleBookResult = {
        book: {
          id: 'google-book-id',
          volumeInfo: {
            title: 'Test Book',
            imageLinks: {
              thumbnail: 'http://books.google.com/thumb.jpg'
            },
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9781234567890' } // Different ISBN from Google
            ]
          }
        },
        rating: null
      }

      fetchUser.mockResolvedValue(mockUserData)
      fetchRecentlyReadBooks.mockResolvedValue(mockRecentlyReadData)
      mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookResult)
      mockListStoredMedia.mockResolvedValue([])
      
      mockPMap.mockImplementation(async (items, mapper) => {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      })

      const resultPromise = syncGoodreadsData(documentStore)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result.result).toBe('SUCCESS')
      expect(result.data.collections.updates[0].cdnMediaURL).toBeDefined()
    })
  })
}) 
