import { beforeEach, describe, expect, it, vi } from 'vitest'

const pMapDefault = vi.hoisted(() =>
  vi.fn(async (items: unknown[], mapper: (item: unknown) => Promise<unknown>) => {
    const out: unknown[] = []
    for (const item of items) {
      out.push(await mapper(item))
    }
    return out
  }),
)

const syncInstagramMediaTarget = vi.hoisted(() => {
  const { syncJobDiskMediaTarget } = require('./test-support/sync-job-disk-media-target.ts')
  return syncJobDiskMediaTarget('instagram')
})

vi.mock('p-map', () => ({
  default: pMapDefault,
}))

import syncInstagramData from './sync-instagram-data.js'
import type { DocumentStore } from '../ports/document-store.js'
import { configureLogger } from '../services/logger.js'

vi.mock('../api/instagram/fetch-instagram-data.js', () => ({
  default: vi.fn(),
}))

vi.mock('../services/media/media-service.js', () => ({
  describeMediaStore: vi.fn(() => ({ backend: 'disk', target: syncInstagramMediaTarget })),
  listStoredMedia: vi.fn(),
  storeRemoteMedia: vi.fn(async (item) => ({
    fileName: item.destinationPath || 'chrisvogt/instagram/test.jpg',
  })),
  toPublicMediaUrl: vi.fn((path) => `https://cdn.example.com/${path}`),
}))

vi.mock('../transformers/transform-instagram-media.js', () => ({
  default: vi.fn((media) => ({ ...media, transformed: true })),
}))

vi.mock('../transformers/to-ig-destination-path.js', () => ({
  default: vi.fn(() => 'chrisvogt/instagram/test.jpg'),
}))

import fetchInstagramData from '../api/instagram/fetch-instagram-data.js'
import { listStoredMedia, storeRemoteMedia } from '../services/media/media-service.js'

describe('syncInstagramData', () => {
  let documentStore: DocumentStore
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    configureLogger(logger)
    pMapDefault.mockImplementation(async (items: unknown[], mapper: (item: unknown) => Promise<unknown>) => {
      const out: unknown[] = []
      for (const item of items) {
        out.push(await mapper(item))
      }
      return out
    })
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('uses an empty media list when the API omits the media envelope', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      username: 'solo',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncInstagramData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(storeRemoteMedia).not.toHaveBeenCalled()
  })

  it('queues carousel children when the parent has no URLs but children do', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [
          {
            id: 'parent-no-url',
            media_type: 'CAROUSEL_ALBUM',
            children: {
              data: [
                {
                  id: 'child1',
                  media_url: 'https://example.com/only-child.jpg',
                },
              ],
            },
          },
        ],
      },
      username: 'u',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncInstagramData(documentStore)

    expect(storeRemoteMedia).toHaveBeenCalled()
  })

  it('skips carousel children that have neither thumbnail nor media URL', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [
          {
            id: 'parent1',
            media_type: 'CAROUSEL_ALBUM',
            media_url: 'https://example.com/parent.jpg',
            children: {
              data: [
                {
                  id: 'child-skip',
                  media_url: undefined,
                  thumbnail_url: undefined,
                },
              ],
            },
          },
        ],
      },
      username: 'u',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncInstagramData(documentStore)

    expect(storeRemoteMedia).toHaveBeenCalledTimes(1)
  })

  it('should successfully sync Instagram data and save to the document store', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [
          {
            id: 'media1',
            media_type: 'IMAGE',
            media_url: 'https://example.com/image1.jpg',
            thumbnail_url: 'https://example.com/thumb1.jpg',
          },
          {
            id: 'media2',
            media_type: 'CAROUSEL_ALBUM',
            media_url: 'https://example.com/image2.jpg',
            children: {
              data: [
                {
                  id: 'child1',
                  media_url: 'https://example.com/child1.jpg',
                  thumbnail_url: 'https://example.com/child1_thumb.jpg',
                },
              ],
            },
          },
        ],
      },
      followers_count: 1000,
      follows_count: 120,
      media_count: 50,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncInstagramData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.data.media).toHaveLength(2)
    expect(result.data.meta.synced).toEqual(expect.any(String))

    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      1,
      'users/chrisvogt/instagram/last-response',
      expect.objectContaining({
        fetchedAt: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      2,
      'users/chrisvogt/instagram/widget-content',
      expect.objectContaining({
        meta: {
          synced: expect.any(String),
        },
        profile: {
          followsCount: 120,
          followersCount: 1000,
          mediaCount: 50,
          username: 'testuser',
        },
      })
    )
  })


  it('omits token-bearing paging URLs from last-response', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [],
        paging: {
          next: 'https://graph.instagram.com/v25.0/123/media?access_token=secret-token&fields=id',
        },
      },
      followers_count: 1,
      media_count: 0,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncInstagramData(documentStore)

    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      1,
      'users/chrisvogt/instagram/last-response',
      expect.objectContaining({
        media: { data: [] },
        fetchedAt: expect.any(String),
      }),
    )
    const lastResponsePayload = vi.mocked(documentStore.setDocument).mock.calls[0][1] as {
      media?: { paging?: unknown }
    }
    expect(lastResponsePayload.media?.paging).toBeUndefined()
  })

  it('redacts access tokens from API error messages', async () => {
    vi.mocked(fetchInstagramData).mockRejectedValue(
      new Error(
        'Request failed with status code 400: GET https://graph.instagram.com/me?access_token=secret-token',
      ),
    )

    const result = await syncInstagramData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Request failed with status code 400: GET https://graph.instagram.com/me?access_token=[REDACTED]',
    })
    expect(logger.error).toHaveBeenCalledWith('Failed to sync Instagram data.', {
      error: 'Request failed with status code 400: GET https://graph.instagram.com/me?access_token=[REDACTED]',
    })
  })

  it('stores profile-only last-response when media is absent', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      followers_count: 10,
      follows_count: 5,
      media_count: 0,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncInstagramData(documentStore)

    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      1,
      'users/chrisvogt/instagram/last-response',
      expect.objectContaining({
        media: undefined,
        username: 'testuser',
        fetchedAt: expect.any(String),
      }),
    )
  })

  it('should handle API errors gracefully', async () => {
    vi.mocked(fetchInstagramData).mockRejectedValue(new Error('Instagram API Error'))

    const result = await syncInstagramData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Instagram API Error',
    })
  })

  it('should handle document store save errors', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: { data: [] },
      followers_count: 1000,
      media_count: 50,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    vi.mocked(documentStore.setDocument).mockRejectedValue(new Error('DocumentStore Error'))

    const result = await syncInstagramData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'DocumentStore Error',
    })
  })

  it('should filter out invalid media types', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [
          { id: 'media1', media_type: 'IMAGE', media_url: 'https://example.com/image1.jpg' },
          { id: 'media2', media_type: 'VIDEO', media_url: 'https://example.com/video1.mp4' },
          { id: 'media3', media_type: 'INVALID_TYPE', media_url: 'https://example.com/invalid.jpg' },
        ],
      },
      followers_count: 1000,
      media_count: 50,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncInstagramData(documentStore)

    expect(result.data.media).toHaveLength(2)
  })

  it('should continue when media uploads fail', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [
          { id: 'media1', media_type: 'IMAGE', media_url: 'https://example.com/image1.jpg' },
        ],
      },
      followers_count: 1000,
      media_count: 50,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    vi.mocked(storeRemoteMedia).mockRejectedValueOnce(new Error('Upload failed'))

    const result = await syncInstagramData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedCount).toBe(0)
  })

  it('should continue writing Instagram data to canonical collections', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: { data: [] },
      followers_count: 1000,
      media_count: 50,
      username: 'testuser',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncInstagramData(documentStore, {
      userId: 'chrisvogt',
    })

    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      1,
      'users/chrisvogt/instagram/last-response',
      expect.any(Object)
    )
    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      2,
      'users/chrisvogt/instagram/widget-content',
      expect.any(Object)
    )
  })

  it('processes carousel children that only expose media_url', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [
          {
            id: 'carousel1',
            media_type: 'CAROUSEL_ALBUM',
            media_url: 'https://example.com/parent.jpg',
            children: {
              data: [{ id: 'c1', media_url: 'https://example.com/child_only.jpg' }],
            },
          },
        ],
      },
      followers_count: 1,
      media_count: 1,
      username: 'u',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncInstagramData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedCount).toBe(2)
  })

  it('recovers with zero uploads when instagram media pMap throws', async () => {
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: {
        data: [{ id: 'm1', media_type: 'IMAGE', media_url: 'https://example.com/i.jpg' }],
      },
      username: 'u',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    pMapDefault.mockRejectedValueOnce(new Error('instagram pmap'))

    const result = await syncInstagramData(documentStore)

    expect(logger.error).toHaveBeenCalledWith(
      'Something went wrong downloading media files',
      expect.any(Error),
    )
    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedCount).toBe(0)
  })

  it('invokes onProgress when provided', async () => {
    const onProgress = vi.fn()
    vi.mocked(fetchInstagramData).mockResolvedValue({
      media: { data: [] },
      username: 'u',
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncInstagramData(documentStore, { onProgress })

    expect(onProgress.mock.calls.map((c) => c[0].phase)).toEqual([
      'instagram.api',
      'instagram.persist',
    ])
  })

  it('returns FAILURE with string error when fetch rejects non-Error', async () => {
    vi.mocked(fetchInstagramData).mockRejectedValue('offline')

    const result = await syncInstagramData(documentStore)

    expect(result).toEqual({ result: 'FAILURE', error: 'offline' })
  })

  it('should fail clearly when the Instagram fetcher rejects', async () => {
    vi.mocked(fetchInstagramData).mockRejectedValue(new Error('Missing INSTAGRAM_USER_ID environment variable.'))
    const result = await syncInstagramData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Missing INSTAGRAM_USER_ID environment variable.',
    })
  })
})
