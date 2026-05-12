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

vi.mock('p-map', () => ({
  default: pMapDefault,
}))

import syncDiscogsData from './sync-discogs-data.js'
import type { DocumentStore } from '../ports/document-store.js'
import { configureLogger } from '../services/logger.js'

vi.mock('../api/discogs/fetch-releases.js', () => ({
  default: vi.fn(),
}))

vi.mock('../api/discogs/fetch-releases-batch.js', () => ({
  default: vi.fn(async (releases) => releases),
}))

vi.mock('../services/media/media-service.js', () => ({
  describeMediaStore: vi.fn(() => ({ backend: 'disk', target: '/tmp/media' })),
  listStoredMedia: vi.fn(),
  storeRemoteMedia: vi.fn(async (item) => ({
    fileName: item.destinationPath || 'chrisvogt/discogs/test.jpg',
  })),
  toPublicMediaUrl: vi.fn((path) => `https://cdn.example.com/${path}`),
}))

vi.mock('../transformers/transform-discogs-release.js', () => ({
  default: vi.fn((release) => {
    const bi = release.basic_information
    return {
      basicInformation: {
        artists: Array.isArray(bi?.artists) ? bi.artists : [{ name: 'Artist' }],
        formats: Array.isArray(bi?.formats) ? bi.formats : [{ name: 'Vinyl' }],
        genres: Array.isArray(bi?.genres) ? bi.genres : ['Rock'],
        styles: Array.isArray(bi?.styles) ? bi.styles : [],
        title: typeof bi?.title === 'string' ? bi.title : 'Test',
        year: typeof bi?.year === 'number' ? bi.year : 2020,
      },
      dateAdded: typeof release.date_added === 'string' ? release.date_added : undefined,
      id: release.id,
      transformed: true,
    }
  }),
}))

vi.mock('../transformers/to-discogs-destination-path.js', () => ({
  default: vi.fn((imageURL, releaseId, imageType) => `chrisvogt/discogs/${releaseId}_${imageType}.jpg`),
}))

vi.mock('../services/discogs-integration-credentials.js', () => ({
  loadDiscogsAuthForUser: vi.fn().mockResolvedValue(null),
}))

vi.mock('../api/ai-summary/generate-discogs-summary.js', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../api/ai-summary/generate-discogs-summary.js')>()
  return {
    ...mod,
    default: vi.fn().mockResolvedValue('<p>Mock Discogs AI summary.</p>'),
  }
})

import generateDiscogsSummary from '../api/ai-summary/generate-discogs-summary.js'
import fetchDiscogsReleases from '../api/discogs/fetch-releases.js'
import fetchReleasesBatch from '../api/discogs/fetch-releases-batch.js'
import { listStoredMedia, storeRemoteMedia } from '../services/media/media-service.js'

describe('syncDiscogsData', () => {
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

  it('should successfully sync Discogs data and save to the document store', async () => {
    const mockDiscogsResponse = {
      pagination: { items: 2, page: 1, pages: 1, per_page: 2, urls: {} },
      releases: [
        {
          id: 1,
          basic_information: {
            thumb: 'https://example.com/thumb1.jpg',
            cover_image: 'https://example.com/cover1.jpg',
          },
        },
        {
          id: 2,
          basic_information: {
            thumb: 'https://example.com/thumb2.jpg',
            cover_image: 'https://example.com/cover2.jpg',
          },
        },
      ],
    }

    vi.mocked(fetchDiscogsReleases).mockResolvedValue(mockDiscogsResponse)
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncDiscogsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.discogsAuthMode).toBe('env')
    expect(result.data.metrics['LPs Owned']).toBe(2)
    expect(result.data.meta.synced).toEqual(expect.any(String))

    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      1,
      'users/chrisvogt/discogs/last-response',
      expect.objectContaining({
        fetchedAt: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      2,
      'users/chrisvogt/discogs/widget-content',
      expect.objectContaining({
        aiSummary: '<p>Mock Discogs AI summary.</p>',
        meta: {
          synced: expect.any(String),
        },
      })
    )
    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      3,
      'users/chrisvogt/discogs/last-response_ai-summary',
      expect.objectContaining({
        generatedAt: expect.any(String),
        summary: '<p>Mock Discogs AI summary.</p>',
      })
    )
  })

  it('continues when AI summary generation fails', async () => {
    vi.mocked(generateDiscogsSummary).mockRejectedValueOnce(new Error('AI unavailable'))
    const mockDiscogsResponse = {
      pagination: { items: 2, page: 1, pages: 1, per_page: 2, urls: {} },
      releases: [
        {
          id: 1,
          basic_information: {
            thumb: 'https://example.com/thumb1.jpg',
            cover_image: 'https://example.com/cover1.jpg',
          },
        },
        {
          id: 2,
          basic_information: {
            thumb: 'https://example.com/thumb2.jpg',
            cover_image: 'https://example.com/cover2.jpg',
          },
        },
      ],
    }

    vi.mocked(fetchDiscogsReleases).mockResolvedValue(mockDiscogsResponse)
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncDiscogsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to generate Discogs AI summary.',
      expect.any(Error),
    )
    const widgetPayload = vi.mocked(documentStore.setDocument).mock.calls.find(
      (c) => c[0] === 'users/chrisvogt/discogs/widget-content',
    )?.[1] as { aiSummary?: string }
    expect(widgetPayload.aiSummary).toBeUndefined()
    expect(
      vi.mocked(documentStore.setDocument).mock.calls.some(
        (c) => c[0] === 'users/chrisvogt/discogs/last-response_ai-summary',
      ),
    ).toBe(false)
  })

  it('should handle API errors gracefully', async () => {
    vi.mocked(fetchDiscogsReleases).mockRejectedValue(new Error('Discogs API Error'))

    const result = await syncDiscogsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Discogs API Error',
    })
    expect(documentStore.setDocument).not.toHaveBeenCalled()
  })

  it('should handle document store save errors', async () => {
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 0, page: 1, pages: 1, per_page: 0, urls: {} },
      releases: [],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    vi.mocked(documentStore.setDocument).mockRejectedValue(new Error('DocumentStore Error'))

    const result = await syncDiscogsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'DocumentStore Error',
    })
  })

  it('should handle existing media files', async () => {
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 28461454,
          basic_information: {
            thumb: 'https://example.com/thumb.jpg',
            cover_image: 'https://example.com/cover.jpg',
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([
      'chrisvogt/discogs/28461454_thumb.jpg',
      'chrisvogt/discogs/28461454_cover.jpg',
    ])

    const result = await syncDiscogsData(documentStore)

    expect(result.totalUploadedCount).toBe(0)
  })

  it('should continue when media uploads fail', async () => {
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 9,
          basic_information: {
            thumb: 'https://example.com/thumb.jpg',
            cover_image: null,
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    vi.mocked(storeRemoteMedia).mockRejectedValueOnce(new Error('Upload failed'))

    const result = await syncDiscogsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedCount).toBe(0)
  })

  it('invokes onProgress across discogs phases', async () => {
    const onProgress = vi.fn()
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 1,
          basic_information: {
            thumb: 'https://example.com/thumb.jpg',
            cover_image: 'https://example.com/cover.jpg',
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore, { onProgress })

    expect(onProgress.mock.calls.map((c) => c[0].phase)).toEqual([
      'discogs.auth',
      'discogs.collection',
      'discogs.save_raw',
      'discogs.ai',
      'discogs.save_widget',
      'discogs.artwork',
      'discogs.artwork',
    ])
  })

  it('recovers with zero uploads when artwork pMap throws', async () => {
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 77,
          basic_information: {
            thumb: 'https://example.com/thumb.jpg',
            cover_image: null,
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    pMapDefault.mockRejectedValueOnce(new Error('p-map failed'))

    const result = await syncDiscogsData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedCount).toBe(0)
  })

  it('returns FAILURE when the Discogs API rejects with a non-Error value', async () => {
    vi.mocked(fetchDiscogsReleases).mockRejectedValue('rate limited')

    const result = await syncDiscogsData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'rate limited',
    })
  })

  it('skips title map entries when an enhanced release row has no id', async () => {
    vi.mocked(fetchReleasesBatch).mockImplementationOnce(async (releases: unknown) => [
      ...(releases as object[]),
      { basic_information: { title: 'No id row' } },
    ])
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 1,
          basic_information: {
            thumb: 'https://example.com/thumb.jpg',
            cover_image: null,
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncDiscogsData(documentStore)

    expect(result.result).toBe('SUCCESS')
  })

  it('marks snapshots that exceed the Firestore size limit in logs', async () => {
    const spy = vi.spyOn(Buffer, 'byteLength').mockReturnValue(2_000_000)
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 1,
          basic_information: {
            thumb: 'https://example.com/thumb.jpg',
            cover_image: null,
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore)

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Document size before saving'),
      expect.objectContaining({
        exceedsLimit: true,
        sizeReduction: 'Filtered resource data to reduce size',
      }),
    )
    spy.mockRestore()
  })

  it('uses release id fallback when the title map has no entry for a media key', async () => {
    const origGet = Map.prototype.get
    const spy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (this: Map<string, string>, key: string) {
      if (key === '555') {
        return undefined
      }
      return origGet.call(this, key)
    })
    const onProgress = vi.fn()
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 555,
          basic_information: {
            title: 'Real title',
            thumb: 'https://example.com/thumb.jpg',
            cover_image: null,
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore, { onProgress })

    const artworkMsg = onProgress.mock.calls.find((c) => c[0].phase === 'discogs.artwork')?.[0]
      .message as string
    expect(artworkMsg).toContain('release 555')
    spy.mockRestore()
  })

  it('uses cover-image wording for cover-only artwork downloads', async () => {
    const onProgress = vi.fn()
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 400,
          basic_information: {
            title: 'Cover only',
            thumb: null,
            cover_image: 'https://example.com/cover.jpg',
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore, { onProgress })

    const artworkMsg = onProgress.mock.calls.find((c) => c[0].phase === 'discogs.artwork')?.[0]
      .message as string
    expect(artworkMsg).toContain('cover image')
  })

  it('truncates very long album titles in artwork progress messages', async () => {
    const onProgress = vi.fn()
    const longTitle = 'Z'.repeat(90)
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 301,
          basic_information: {
            title: longTitle,
            thumb: 'https://example.com/thumb.jpg',
            cover_image: null,
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore, { onProgress })

    const artworkMsg = onProgress.mock.calls.find((c) => c[0].phase === 'discogs.artwork')?.[0]
      .message as string
    expect(artworkMsg).toContain('…')
    expect(artworkMsg.length).toBeLessThan(longTitle.length + 50)
  })

  it('uses fallback album titles when basic_information.title is empty', async () => {
    const onProgress = vi.fn()
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 1, page: 1, pages: 1, per_page: 1, urls: {} },
      releases: [
        {
          id: 88,
          basic_information: {
            title: '',
            thumb: 'https://example.com/t.jpg',
            cover_image: 'https://example.com/c.jpg',
          },
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore, { onProgress })

    const artworkMessages = onProgress.mock.calls
      .filter((c) => c[0].phase === 'discogs.artwork')
      .map((c) => c[0].message as string)
    expect(artworkMessages.some((m) => m.includes('Release 88'))).toBe(true)
  })

  it('should continue writing Discogs data to canonical collections', async () => {
    vi.mocked(fetchDiscogsReleases).mockResolvedValue({
      pagination: { items: 0, page: 1, pages: 1, per_page: 0, urls: {} },
      releases: [],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncDiscogsData(documentStore, {
      userId: 'chrisvogt',
    })

    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      1,
      'users/chrisvogt/discogs/last-response',
      expect.any(Object)
    )
    expect(documentStore.setDocument).toHaveBeenNthCalledWith(
      2,
      'users/chrisvogt/discogs/widget-content',
      expect.any(Object)
    )
  })
})
