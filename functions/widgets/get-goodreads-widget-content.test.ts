import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import getGoodreadsWidgetContent from './get-goodreads-widget-content.js'
import type { DocumentStore } from '../ports/document-store.js'

describe('getGoodreadsWidgetContent', () => {
  let documentStore: DocumentStore

  beforeEach(() => {
    vi.clearAllMocks()

    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    }
  })

  it('should return properly formatted widget content', async () => {
    const mockData = {
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0
        }
      },
      collections: {
        recentlyReadBooks: [
          {
            id: 'book1',
            title: 'Test Book',
            author: 'Test Author',
            rating: 4
          }
        ],
        updates: [
          {
            id: 'update1',
            type: 'review',
            content: 'Great book!'
          }
        ]
      },
      profile: {
        displayName: 'Test User',
        profileURL: 'https://www.goodreads.com/user/show/123'
      }
    }

    vi.mocked(documentStore.getDocument).mockResolvedValue(mockData)

    const result = await getGoodreadsWidgetContent(documentStore, 'user123')

    expect(result).toEqual({
      collections: mockData.collections,
      profile: mockData.profile,
      meta: {
        synced: new Timestamp(1640995200, 0).toDate()
      }
    })

    expect(documentStore.getDocument).toHaveBeenCalledWith('users/user123/goodreads/widget-content')
  })

  it('should handle missing data gracefully', async () => {
    const mockData = {
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0
        }
      }
    }

    vi.mocked(documentStore.getDocument).mockResolvedValue(mockData)

    const result = await getGoodreadsWidgetContent(documentStore, 'user123')

    expect(result).toEqual({
      meta: {
        synced: new Timestamp(1640995200, 0).toDate()
      }
    })
  })

  it('should return default widget content when doc does not exist', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(undefined)

    const result = await getGoodreadsWidgetContent(documentStore, 'user123')

    expect(result).toEqual({
      meta: { synced: new Date(0) },
      recentBooks: [],
      summary: null,
    })
  })

  it('should throw error when get() throws', async () => {
    vi.mocked(documentStore.getDocument).mockRejectedValue(new Error('Database error'))

    await expect(getGoodreadsWidgetContent(documentStore, 'user123')).rejects.toThrow('Database error')
  })
})
