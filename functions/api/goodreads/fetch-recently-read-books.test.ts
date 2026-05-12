import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fetchRecentlyReadBooks from './fetch-recently-read-books.js'

// Mock dependencies
vi.mock('xml2js', () => ({
  parseString: vi.fn()
}))

vi.mock('got', () => ({
  default: vi.fn()
}))

vi.mock('firebase-functions', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../google-books/fetch-book.js', () => ({
  default: vi.fn()
}))

vi.mock('../../services/media/media-service.js', () => ({
  listStoredMedia: vi.fn(),
  storeRemoteMedia: vi.fn(),
  toPublicMediaUrl: vi.fn((path) => `https://cdn.example.com/${path}`),
}))

vi.mock('../../selectors/media-store.js', () => ({
  getMediaStore: vi.fn(() => ({
    describe: () => ({ backend: 'disk', target: '/tmp/test-media' }),
  })),
}))

vi.mock('p-map', () => ({
  default: vi.fn()
}))

describe('fetchRecentlyReadBooks', () => {
  let mockParseString
  let mockGot
  let mockFetchAndUploadFile
  let mockFetchBookFromGoogle
  let mockListStoredMedia
  let mockPMap
  let mockLogger

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks()

    // Get mock functions
    mockParseString = (await import('xml2js')).parseString
    mockGot = (await import('got')).default
    mockFetchAndUploadFile = (await import('../../services/media/media-service.js')).storeRemoteMedia
    mockFetchBookFromGoogle = (await import('../google-books/fetch-book.js')).default
    mockListStoredMedia = (await import('../../services/media/media-service.js')).listStoredMedia
    mockPMap = (await import('p-map')).default
    mockLogger = (await import('firebase-functions')).logger

    // Set up environment variables
    process.env.GOODREADS_API_KEY = 'test-api-key'
    process.env.GOODREADS_USER_ID = 'test-user-id'
  })

  afterEach(() => {
    delete process.env.GOODREADS_API_KEY
    delete process.env.GOODREADS_USER_ID
  })

  it('should fetch and transform book data successfully', async () => {
    // Mock Goodreads API response
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
              <isbn13>1234567890123</isbn13>
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    // Mock Google Books API response
    const mockGoogleBookData = {
      book: {
        id: 'test-book-id',
        volumeInfo: {
          authors: ['Test Author'],
          categories: ['Fiction'],
          description: 'Test description',
          imageLinks: {
            smallThumbnail: 'http://example.com/small.jpg',
            thumbnail: 'http://example.com/thumb.jpg'
          },
          infoLink: 'http://example.com/info',
          pageCount: 300,
          previewLink: 'http://example.com/preview',
          subtitle: 'Test Subtitle',
          title: 'Test Book Title'
        }
      },
      rating: '4'
    }

    // Mock stored media list
    const mockStoredMedia = ['books/other-book-thumbnail.jpg']

    // Setup mocks
    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                isbn: ['1234567890'],
                isbn13: ['1234567890123']
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    // Mock pMap to call the mapper function for book fetching
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        // This is the media upload pMap call
        return [{ fileName: 'books/test-book-id-thumbnail.jpg' }]
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookData)
    mockListStoredMedia.mockResolvedValue(mockStoredMedia)
    mockFetchAndUploadFile.mockResolvedValue({ fileName: 'books/test-book-id-thumbnail.jpg' })

    const result = await fetchRecentlyReadBooks()

    // Verify Goodreads API was called
    expect(mockGot).toHaveBeenCalledWith(
      'https://www.goodreads.com/review/list/test-user-id.xml?key=test-api-key&v=2&shelf=read&sort=date_read&per_page=35'
    )

    // Verify XML parsing was called
    expect(mockParseString).toHaveBeenCalledWith(mockGoodreadsResponse, expect.any(Function))

    // Verify pMap was used for fetching books with concurrency control
    expect(mockPMap).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          isbn: '1234567890123',
          rating: '4',
          readAt: '2023-01-01',
        })
      ]),
      expect.any(Function),
      {
        concurrency: 3, // Should use concurrency: 3 for book fetching
        stopOnError: false
      }
    )

    // Verify Google Books API was called
    expect(mockFetchBookFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        isbn: '1234567890123',
        rating: '4',
        readAt: '2023-01-01',
      }),
    )

    // Verify stored media was checked
    expect(mockListStoredMedia).toHaveBeenCalled()

    // Verify media upload was attempted (second pMap call)
    expect(mockPMap).toHaveBeenCalledWith(
      [{
        destinationPath: 'books/test-book-id-thumbnail.jpg',
        id: 'test-book-id',
        mediaURL: 'https://example.com/thumb.jpg'
      }],
      mockFetchAndUploadFile,
      {
        concurrency: 10,
        stopOnError: false
      }
    )

    // Verify result structure
    expect(result).toEqual({
      books: [{
        authors: ['Test Author'],
        categories: ['Fiction'],
        cdnMediaURL: 'https://cdn.example.com/books/test-book-id-thumbnail.jpg',
        mediaDestinationPath: 'books/test-book-id-thumbnail.jpg',
        description: 'Test description',
        id: 'test-book-id',
        infoLink: 'https://example.com/info',
        isbn: '1234567890123', // ISBN should be included
        pageCount: 300,
        previewLink: 'http://example.com/preview',
        rating: '4',
        readAt: '2023-01-01',
        smallThumbnail: 'https://example.com/small.jpg',
        subtitle: 'Test Subtitle',
        thumbnail: 'https://example.com/thumb.jpg',
        title: 'Test Book Title'
      }],
      rawReviewsResponse: [{
        read_at: ['2023-01-01'],
        book: [{
          isbn: ['1234567890'],
          isbn13: ['1234567890123']
        }],
        rating: ['4']
      }],
      mediaStore: { backend: 'disk', target: '/tmp/test-media' },
      result: 'SUCCESS',
      totalUploadedCount: 1,
      uploadedFiles: ['books/test-book-id-thumbnail.jpg']
    })

    // Verify success logging
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Goodreads data sync finished successfully with media uploads.',
      {
        mediaStore: { backend: 'disk', target: '/tmp/test-media' },
        totalUploadedCount: 1,
        uploadedFiles: ['books/test-book-id-thumbnail.jpg']
      }
    )
  })

  it('should handle books without thumbnails', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    const mockGoogleBookData = {
      book: {
        id: 'test-book-id',
        volumeInfo: {
          authors: ['Test Author'],
          title: 'Test Book Title'
          // No imageLinks
        }
      },
      rating: '4'
    }

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                isbn: ['1234567890']
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    // Mock pMap to handle book fetching
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        // This is the media upload pMap call (should not be called for books without thumbnails)
        return []
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookData)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    // Should not attempt to upload media for books without thumbnails
    // But pMap should still be called for book fetching
    expect(mockPMap).toHaveBeenCalled()
    expect(result.totalUploadedCount).toBe(0)
    expect(result.uploadedFiles).toEqual([])
  })

  it('should handle already downloaded media', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    const mockGoogleBookData = {
      book: {
        id: 'test-book-id',
        volumeInfo: {
          authors: ['Test Author'],
          title: 'Test Book Title',
          imageLinks: {
            thumbnail: 'http://example.com/thumb.jpg'
          }
        }
      },
      rating: '4'
    }

    // Mock that the media is already stored
    const mockStoredMedia = ['books/test-book-id-thumbnail.jpg']

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                isbn: ['1234567890']
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    // Mock pMap to handle book fetching
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        // This is the media upload pMap call (should not be called for already downloaded media)
        return []
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookData)
    mockListStoredMedia.mockResolvedValue(mockStoredMedia)

    const result = await fetchRecentlyReadBooks()

    // Should not attempt to upload already downloaded media
    // But pMap should still be called for book fetching
    expect(mockPMap).toHaveBeenCalled()
    expect(result.totalUploadedCount).toBe(0)
    expect(result.uploadedFiles).toEqual([])
  })

  it('should handle XML parsing errors', async () => {
    mockGot.mockResolvedValue({ body: 'invalid xml' })
    mockParseString.mockImplementation((xml, callback) => {
      callback(new Error('XML parsing failed'))
    })

    await expect(fetchRecentlyReadBooks()).rejects.toThrow('XML parsing failed')
  })

  it('should handle media upload errors gracefully', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    const mockGoogleBookData = {
      book: {
        id: 'test-book-id',
        volumeInfo: {
          authors: ['Test Author'],
          title: 'Test Book Title',
          imageLinks: {
            thumbnail: 'http://example.com/thumb.jpg'
          }
        }
      },
      rating: '4'
    }

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                isbn: ['1234567890']
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    // Mock pMap to handle book fetching and media upload
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        // This is the media upload pMap call - simulate failure
        throw new Error('Upload failed')
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBookData)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    // Should handle upload errors gracefully
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Something went wrong fetching and uploading one or more media files.',
      expect.any(Error)
    )
    expect(result.totalUploadedCount).toBe(0)
    expect(result.uploadedFiles).toEqual([])
  })

  it('should filter out books with invalid read dates', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
            </book>
            <rating>4</rating>
          </review>
          <review>
            <read_at></read_at>
            <book>
              <isbn>0987654321</isbn>
            </book>
            <rating>3</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [
              {
                read_at: ['2023-01-01'],
                book: [{
                  isbn: ['1234567890']
                }],
                rating: ['4']
              },
              {
                read_at: [[1,2,3,4]], // Array, not a string, length > 3
                book: [{
                  isbn: ['0987654321']
                }],
                rating: ['3']
              }
            ]
          }]
        }
      })
    })
    // Mock pMap to handle book fetching
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        return []
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue({
      book: {
        id: 'test-book-id',
        volumeInfo: {
          title: 'Test Book'
        }
      },
      rating: '4'
    })
    mockListStoredMedia.mockResolvedValue([])

    await fetchRecentlyReadBooks()

    // Should only process the book with valid date (the second one should be filtered out)
    expect(mockFetchBookFromGoogle).toHaveBeenCalledTimes(1)
    expect(mockFetchBookFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        isbn: '1234567890',
        rating: '4',
        readAt: '2023-01-01',
      }),
    )
  })

  it('should filter out books with missing rating', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
            </book>
            <!-- No rating node -->
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                isbn: ['1234567890'],
              }],
              // rating intentionally omitted
            }],
          }],
        },
      })
    })

    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        return [] // no transformed reviews should reach book fetching
      }
      return []
    })

    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(mockFetchBookFromGoogle).not.toHaveBeenCalled()
    expect(result.books).toEqual([])
  })

  it('should filter out books when book node is not an object', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>not-an-object</book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              // Force a non-object shape for `book`
              book: 'not-an-object',
              rating: ['4'],
            }],
          }],
        },
      })
    })

    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        return []
      }
      return []
    })

    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(mockFetchBookFromGoogle).not.toHaveBeenCalled()
    expect(result.books).toEqual([])
  })

  it('should handle books without ISBN', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <!-- No ISBN -->
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                // No ISBN fields
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    // Mock pMap to handle book fetching (should not be called for books without ISBN)
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        return []
      }
    })
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    // Should not call Google Books API for books without ISBN
    expect(mockFetchBookFromGoogle).not.toHaveBeenCalled()
    expect(result.books).toEqual([])
  })

  it('should handle null or undefined Google Books results', async () => {
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <isbn>1234567890</isbn>
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                isbn: ['1234567890']
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    // Mock pMap to handle book fetching
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        // This is the book fetching pMap call
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        return []
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue(null) // No book data returned
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    // Should filter out null results (no title/author in mock, so fallback not attempted)
    expect(result.books).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Book not found by ISBN or title/author fallback: ISBN 1234567890'
    )
  })

  it('should fall back to title/author search when ISBN lookup fails', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    const mockGoodreadsResponse = `
      <GoodreadsResponse>
        <reviews>
          <review>
            <read_at>2023-01-01</read_at>
            <book>
              <title>Finding My Humanity</title>
              <authors><author><name>Ryan Ubuntu Olson</name></author></authors>
              <isbn>9798889269595</isbn>
              <isbn13>9798889269595</isbn13>
            </book>
            <rating>4</rating>
          </review>
        </reviews>
      </GoodreadsResponse>
    `

    const mockGoogleBookFromTitleSearch = {
      items: [{
        id: 'fallback-book-id',
        volumeInfo: {
          title: 'Finding My Humanity',
          authors: ['Ryan Ubuntu Olson'],
          imageLinks: {
            smallThumbnail: 'http://example.com/small.jpg',
            thumbnail: 'http://example.com/thumb.jpg'
          },
          infoLink: 'http://example.com/info',
          pageCount: 200
        }
      }]
    }

    mockGot
      .mockResolvedValueOnce({ body: mockGoodreadsResponse })
      .mockResolvedValueOnce({ body: JSON.stringify(mockGoogleBookFromTitleSearch) })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                title: ['Finding My Humanity'],
                authors: [{ author: [{ name: ['Ryan Ubuntu Olson'] }] }],
                isbn: ['9798889269595'],
                isbn13: ['9798889269595']
              }],
              rating: ['4']
            }]
          }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) {
          const result = await mapper(items[i], i)
          results.push(result)
        }
        return results
      } else {
        return [{ fileName: 'books/fallback-book-id-thumbnail.jpg' }]
      }
    })
    mockFetchBookFromGoogle.mockResolvedValue(null) // ISBN lookup fails
    mockListStoredMedia.mockResolvedValue([])
    mockFetchAndUploadFile.mockResolvedValue({ fileName: 'books/fallback-book-id-thumbnail.jpg' })

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toHaveLength(1)
    expect(result.books[0].title).toBe('Finding My Humanity')
    expect(result.books[0].authors).toEqual(['Ryan Ubuntu Olson'])
    expect(result.books[0].id).toBe('fallback-book-id')
    // Should have called Google Books volumes API for title/author search
    expect(mockGot).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes',
      expect.objectContaining({
        searchParams: {
          q: 'intitle:Finding My Humanity inauthor:Ryan Ubuntu Olson',
          key: 'test-google-books-api-key',
          country: 'US'
        }
      })
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('uses simplified intitle when Goodreads title has trailing series parenthetical', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    const longTitle = 'The Secret Commonwealth (The Book of Dust, #2)'
    const mockGoodreadsResponse = `<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>${longTitle}</title><isbn13>9780000000001</isbn13><authors><author><name>Philip Pullman</name></author></authors></book><rating>4</rating></review></reviews></GoodreadsResponse>`
    const mockGoogleBookFromTitleSearch = {
      items: [{
        id: 'dust-book-id',
        volumeInfo: {
          title: 'The Secret Commonwealth',
          authors: ['Philip Pullman'],
          imageLinks: { thumbnail: 'http://example.com/t.jpg' },
        },
      }],
    }

    mockGot
      .mockResolvedValueOnce({ body: mockGoodreadsResponse })
      .mockResolvedValueOnce({ body: JSON.stringify(mockGoogleBookFromTitleSearch) })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{
                title: [longTitle],
                authors: [{ author: [{ name: ['Philip Pullman'] }] }],
                isbn13: ['9780000000001'],
              }],
              rating: ['4'],
            }],
          }],
        },
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    await fetchRecentlyReadBooks()

    expect(mockGot).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes',
      expect.objectContaining({
        searchParams: {
          q: 'intitle:The Secret Commonwealth inauthor:Philip Pullman',
          key: 'test-google-books-api-key',
          country: 'US',
        },
      }),
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('uses raw Goodreads title when simplification strips to empty (parenthetical-only)', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    const mockGoodreadsResponse =
      '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>(Paren Only)</title><isbn13>9780000000002</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>'
    const mockGoogleBookFromTitleSearch = {
      items: [{ id: 'p-id', volumeInfo: { title: 'X', imageLinks: { thumbnail: 'http://x.com/t.jpg' } } }],
    }
    mockGot
      .mockResolvedValueOnce({ body: mockGoodreadsResponse })
      .mockResolvedValueOnce({ body: JSON.stringify(mockGoogleBookFromTitleSearch) })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: [{ title: ['(Paren Only)'], isbn13: ['9780000000002'] }],
              rating: ['4'],
            }],
          }],
        },
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) {
          results.push(await mapper(items[i], i))
        }
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    await fetchRecentlyReadBooks()

    expect(mockGot).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes',
      expect.objectContaining({
        searchParams: {
          q: 'intitle:(Paren Only)',
          key: 'test-google-books-api-key',
          country: 'US',
        },
      }),
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('should fall back to title-only search when ISBN fails and no author in Goodreads data', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    const mockGoodreadsResponse = '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>No Author Book</title><isbn13>9780000000000</isbn13></book><rating>3</rating></review></reviews></GoodreadsResponse>'
    const mockGoogleBookFromTitleSearch = {
      items: [{ id: 'title-only-id', volumeInfo: { title: 'No Author Book', imageLinks: { thumbnail: 'http://x.com/t.jpg' } } }]
    }
    mockGot
      .mockResolvedValueOnce({ body: mockGoodreadsResponse })
      .mockResolvedValueOnce({ body: JSON.stringify(mockGoogleBookFromTitleSearch) })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{ review: [{ read_at: ['2023-01-01'], book: [{ title: ['No Author Book'], isbn13: ['9780000000000'] }], rating: ['3'] }] }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toHaveLength(1)
    expect(result.books[0].title).toBe('No Author Book')
    expect(mockGot).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes',
      expect.objectContaining({ searchParams: { q: 'intitle:No Author Book', key: 'test-google-books-api-key', country: 'US' } })
    )
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Found book by title for recently read: No Author Book'))
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('should log warning with title when fallback returns no items', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    mockGot
      .mockResolvedValueOnce({ body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Unknown Book</title><isbn13>9781111111111</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>' })
      .mockResolvedValueOnce({ body: JSON.stringify({ items: [] }) })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{ review: [{ read_at: ['2023-01-01'], book: [{ title: ['Unknown Book'], isbn13: ['9781111111111'] }], rating: ['4'] }] }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toEqual([])
    expect(mockLogger.warn).toHaveBeenCalledWith('Book not found by ISBN or title/author fallback: "Unknown Book"')
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('should handle quota exceeded during title/author fallback', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    mockGot
      .mockResolvedValueOnce({ body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Quota Book</title><isbn13>9782222222222</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>' })
      .mockRejectedValueOnce(
        Object.assign(new Error('Quota exceeded'), {
          response: {
            statusCode: 429,
            body: JSON.stringify({
              error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' }
            })
          }
        })
      )
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{ review: [{ read_at: ['2023-01-01'], book: [{ title: ['Quota Book'], isbn13: ['9782222222222'] }], rating: ['4'] }] }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Daily quota exceeded for Google Books API. Title/author fallback skipped.',
      { message: 'Quota exceeded' }
    )
    expect(mockLogger.warn).toHaveBeenCalledWith('Book not found by ISBN or title/author fallback: "Quota Book"')
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('should retry on 429 during title fallback then succeed', async () => {
    vi.useFakeTimers()
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    const goodreadsBody = '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Retry Book</title><isbn13>9783333333333</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>'
    const successResponse = { body: JSON.stringify({ items: [{ id: 'retry-id', volumeInfo: { title: 'Retry Book', imageLinks: { thumbnail: 'http://x.com/t.jpg' } } }] }) }
    const rateLimitError = Object.assign(new Error('Rate limited'), {
      response: { statusCode: 429, body: JSON.stringify({ error: { code: 429, message: 'Rate limit' } }) }
    })
    mockGot
      .mockResolvedValueOnce({ body: goodreadsBody })
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(successResponse)
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{ review: [{ read_at: ['2023-01-01'], book: [{ title: ['Retry Book'], isbn13: ['9783333333333'] }], rating: ['4'] }] }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return [{ fileName: 'books/retry-id-thumbnail.jpg' }]
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])
    mockFetchAndUploadFile.mockResolvedValue({ fileName: 'books/retry-id-thumbnail.jpg' })

    const resultPromise = fetchRecentlyReadBooks()
    await vi.advanceTimersByTimeAsync(2500)
    const result = await resultPromise
    vi.useRealTimers()

    expect(result.books).toHaveLength(1)
    expect(result.books[0].id).toBe('retry-id')
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Rate limited \(429\) for title search "Retry Book"/)
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('should add delay between requests when fetching multiple books (index > 0)', async () => {
    const mockGoodreadsResponse = '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><isbn13>9781111111111</isbn13></book><rating>4</rating></review><review><read_at>2023-01-02</read_at><book><isbn13>9782222222222</isbn13></book><rating>5</rating></review></reviews></GoodreadsResponse>'
    mockGot.mockResolvedValue({ body: mockGoodreadsResponse })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [
              { read_at: ['2023-01-01'], book: [{ isbn13: ['9781111111111'] }], rating: ['4'] },
              { read_at: ['2023-01-02'], book: [{ isbn13: ['9782222222222'] }], rating: ['5'] }
            ]
          }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle
      .mockResolvedValueOnce({ book: { id: 'id1', volumeInfo: { title: 'Book 1', imageLinks: { thumbnail: 'http://x.com/1.jpg' } } }, rating: '4' })
      .mockResolvedValueOnce({ book: { id: 'id2', volumeInfo: { title: 'Book 2', imageLinks: { thumbnail: 'http://x.com/2.jpg' } } }, rating: '5' })
    mockListStoredMedia.mockResolvedValue(['books/id1-thumbnail.jpg', 'books/id2-thumbnail.jpg'])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toHaveLength(2)
    expect(result.books[0].id).toBe('id2')
    expect(result.books[0].readAt).toBe('2023-01-02')
    expect(result.books[1].id).toBe('id1')
    expect(result.books[1].readAt).toBe('2023-01-01')
    expect(mockFetchBookFromGoogle).toHaveBeenCalledTimes(2)
  })

  it('should parse book data when book is single object (not array) in Goodreads XML', async () => {
    mockGot.mockResolvedValue({ body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Single Object Book</title><isbn13>9785555555555</isbn13></book><rating>5</rating></review></reviews></GoodreadsResponse>' })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{
            review: [{
              read_at: ['2023-01-01'],
              book: { title: ['Single Object Book'], isbn13: ['9785555555555'] },
              rating: ['5']
            }]
          }]
        }
      })
    })
    const mockGoogleBook = {
      book: {
        id: 'single-obj-id',
        volumeInfo: {
          title: 'Single Object Book',
          authors: ['Author'],
          imageLinks: { thumbnail: 'http://example.com/t.jpg' }
        }
      },
      rating: '5'
    }
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return [{ fileName: 'books/single-obj-id-thumbnail.jpg' }]
    })
    mockFetchBookFromGoogle.mockResolvedValue(mockGoogleBook)
    mockListStoredMedia.mockResolvedValue([])
    mockFetchAndUploadFile.mockResolvedValue({ fileName: 'books/single-obj-id-thumbnail.jpg' })

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toHaveLength(1)
    expect(result.books[0].title).toBe('Single Object Book')
    expect(mockFetchBookFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ isbn: '9785555555555', title: 'Single Object Book', rating: '5' })
    )
  })

  it('should log error and warning when fallback request fails after retries', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    const networkError = new Error('Network failure')
    mockGot
      .mockResolvedValueOnce({ body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Fail Book</title><authors><author><name>Fail Author</name></author></authors><isbn13>9784444444444</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>' })
      .mockRejectedValue(networkError)
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [{ review: [{ read_at: ['2023-01-01'], book: [{ title: ['Fail Book'], authors: [{ author: [{ name: ['Fail Author'] }] }], isbn13: ['9784444444444'] }], rating: ['4'] }] }]
        }
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error fetching book by title/author for recently read "Fail Book" after retries:',
      networkError
    )
    expect(mockLogger.warn).toHaveBeenCalledWith('Book not found by ISBN or title/author fallback: "Fail Book"')
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('handles non-string error body from Google Books volumes API during title fallback', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    mockGot
      .mockResolvedValueOnce({
        body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Obj Body</title><isbn13>9787777777777</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>',
      })
      .mockRejectedValueOnce({
        response: {
          statusCode: 500,
          body: { error: { message: 'Server object body' } },
        },
      })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [
            {
              review: [
                {
                  read_at: ['2023-01-01'],
                  book: [{ title: ['Obj Body'], isbn13: ['9787777777777'] }],
                  rating: ['4'],
                },
              ],
            },
          ],
        },
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error fetching book by title for recently read "Obj Body" after retries:',
      expect.objectContaining({
        response: expect.objectContaining({ statusCode: 500 }),
      }),
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('treats 429 with Quota exceeded message as quota without RESOURCE_EXHAUSTED status', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    mockGot
      .mockResolvedValueOnce({
        body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Quota Style</title><isbn13>9799999999999</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>',
      })
      .mockRejectedValueOnce({
        response: {
          statusCode: 429,
          body: JSON.stringify({
            error: {
              code: 429,
              message: 'Quota exceeded for Queries per day',
            },
          }),
        },
      })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [
            {
              review: [
                {
                  read_at: ['2023-01-01'],
                  book: [{ title: ['Quota Style'], isbn13: ['9799999999999'] }],
                  rating: ['4'],
                },
              ],
            },
          ],
        },
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Daily quota exceeded for Google Books API. Title/author fallback skipped.',
      { message: 'Quota exceeded for Queries per day' },
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })

  it('handles invalid JSON string error body from Google Books volumes API during title fallback', async () => {
    process.env.GOOGLE_BOOKS_API_KEY = 'test-google-books-api-key'
    mockGot
      .mockResolvedValueOnce({
        body: '<GoodreadsResponse><reviews><review><read_at>2023-01-01</read_at><book><title>Bad JSON Err</title><isbn13>9788888888888</isbn13></book><rating>4</rating></review></reviews></GoodreadsResponse>',
      })
      .mockRejectedValueOnce({
        response: {
          statusCode: 500,
          body: '{truncated-json',
        },
      })
    mockParseString.mockImplementation((xml, callback) => {
      callback(null, {
        GoodreadsResponse: {
          reviews: [
            {
              review: [
                {
                  read_at: ['2023-01-01'],
                  book: [{ title: ['Bad JSON Err'], isbn13: ['9788888888888'] }],
                  rating: ['4'],
                },
              ],
            },
          ],
        },
      })
    })
    mockPMap.mockImplementation(async (items, mapper, options) => {
      if (options?.concurrency === 3) {
        const results = []
        for (let i = 0; i < items.length; i++) results.push(await mapper(items[i], i))
        return results
      }
      return []
    })
    mockFetchBookFromGoogle.mockResolvedValue(null)
    mockListStoredMedia.mockResolvedValue([])

    const result = await fetchRecentlyReadBooks()

    expect(result.books).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error fetching book by title for recently read "Bad JSON Err" after retries:',
      expect.objectContaining({
        response: expect.objectContaining({ statusCode: 500 }),
      }),
    )
    delete process.env.GOOGLE_BOOKS_API_KEY
  })
}) 
