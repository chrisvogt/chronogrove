import { describe, it, expect, vi, beforeEach } from 'vitest'
import getFlickrWidgetContent from './get-flickr-widget-content.js'
import type { DocumentStore } from '../ports/document-store.js'
import { configureLogger } from '../services/logger.js'

describe('getFlickrWidgetContent', () => {
  let documentStore: DocumentStore
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    configureLogger(logger)

    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    }
  })

  it('should fetch Flickr widget content successfully', async () => {
    const mockData = {
      collections: {
        photos: [
          { id: '1', title: 'Photo 1' },
          { id: '2', title: 'Photo 2' }
        ]
      },
      meta: {
        synced: '2023-01-01T00:00:00Z'
      },
      metrics: [
        {
          displayName: 'Photos',
          value: 2
        }
      ]
    }

    vi.mocked(documentStore.getDocument).mockResolvedValue(mockData)

    const result = await getFlickrWidgetContent(documentStore, 'user123')

    expect(documentStore.getDocument).toHaveBeenCalledWith('users/user123/flickr/widget-content')
    expect(result.collections).toEqual(mockData.collections)
    expect(result.metrics).toEqual(mockData.metrics)
    expect(result.meta?.synced).toBeInstanceOf(Date)
    expect((result.meta?.synced as Date).toISOString()).toBe('2023-01-01T00:00:00.000Z')
  })

  it('should throw error when document does not exist', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(null)

    await expect(getFlickrWidgetContent(documentStore, 'user123')).rejects.toThrow(
      'No Flickr data found in DocumentStore'
    )
  })

  it('should handle DocumentStore errors', async () => {
    const documentStoreError = new Error('DocumentStore connection failed')
    vi.mocked(documentStore.getDocument).mockRejectedValue(documentStoreError)

    await expect(getFlickrWidgetContent(documentStore, 'user123')).rejects.toThrow(
      'DocumentStore connection failed'
    )
    expect(logger.error).toHaveBeenCalledWith('Error getting Flickr widget content:', documentStoreError)
  })

  it('should handle network errors', async () => {
    const networkError = new Error('Network timeout')
    vi.mocked(documentStore.getDocument).mockRejectedValue(networkError)

    await expect(getFlickrWidgetContent(documentStore, 'user123')).rejects.toThrow('Network timeout')
    expect(logger.error).toHaveBeenCalledWith('Error getting Flickr widget content:', networkError)
  })

  it('should handle permission errors', async () => {
    const permissionError = new Error('Permission denied')
    vi.mocked(documentStore.getDocument).mockRejectedValue(permissionError)

    await expect(getFlickrWidgetContent(documentStore, 'user123')).rejects.toThrow('Permission denied')
    expect(logger.error).toHaveBeenCalledWith('Error getting Flickr widget content:', permissionError)
  })

  it('should handle malformed document data', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(null)

    await expect(getFlickrWidgetContent(documentStore, 'user123')).rejects.toThrow(
      'No Flickr data found in DocumentStore'
    )
  })

  it('should handle empty document data', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(undefined)

    await expect(getFlickrWidgetContent(documentStore, 'user123')).rejects.toThrow(
      'No Flickr data found in DocumentStore'
    )
  })

  it('should handle document with only partial data', async () => {
    const partialData = {
      collections: {
        photos: []
      }
      // Missing meta and metrics
    }

    vi.mocked(documentStore.getDocument).mockResolvedValue(partialData)

    const result = await getFlickrWidgetContent(documentStore, 'user123')

    expect(result).toEqual(partialData)
    expect(result.collections.photos).toEqual([])
    expect(result.meta).toBeUndefined()
    expect(result.metrics).toBeUndefined()
  })

  it('should handle document with nested null values', async () => {
    const dataWithNulls = {
      collections: {
        photos: null
      },
      meta: null,
      metrics: null
    }

    vi.mocked(documentStore.getDocument).mockResolvedValue(dataWithNulls)

    const result = await getFlickrWidgetContent(documentStore, 'user123')

    expect(result).toEqual(dataWithNulls)
    expect(result.collections.photos).toBeNull()
  })

  it('should handle document with undefined values', async () => {
    const dataWithUndefined = {
      collections: {
        photos: undefined
      },
      meta: undefined,
      metrics: undefined
    }

    vi.mocked(documentStore.getDocument).mockResolvedValue(dataWithUndefined)

    const result = await getFlickrWidgetContent(documentStore, 'user123')

    expect(result).toEqual(dataWithUndefined)
    expect(result.collections.photos).toBeUndefined()
  })
})
