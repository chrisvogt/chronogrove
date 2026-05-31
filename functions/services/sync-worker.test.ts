import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentStore } from '../ports/document-store.js'
import type { SyncJobQueue } from '../ports/sync-job-queue.js'
import { configureLogger, getLogger } from './logger.js'
import { processSyncJob, runNextSyncJob } from './sync-worker.js'

vi.mock('../jobs/sync-discogs-data.js', () => ({
  default: vi.fn(),
}))

vi.mock('../jobs/sync-flickr-data.js', () => ({
  default: vi.fn(),
}))

vi.mock('../jobs/sync-goodreads-data.js', () => ({
  default: vi.fn(),
}))

vi.mock('../jobs/sync-instagram-data.js', () => ({
  default: vi.fn(),
}))

vi.mock('../jobs/sync-spotify-data.js', () => ({
  default: vi.fn(),
}))

vi.mock('../jobs/sync-steam-data.js', () => ({
  default: vi.fn(),
}))

import syncDiscogsData from '../jobs/sync-discogs-data.js'
import syncFlickrData from '../jobs/sync-flickr-data.js'
import syncGoodreadsData from '../jobs/sync-goodreads-data.js'
import syncInstagramData from '../jobs/sync-instagram-data.js'
import syncSpotifyData from '../jobs/sync-spotify-data.js'
import syncSteamData from '../jobs/sync-steam-data.js'

describe('runNextSyncJob', () => {
  let documentStore: DocumentStore
  let syncJobQueue: SyncJobQueue

  beforeEach(() => {
    vi.clearAllMocks()
    configureLogger({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    }
    syncJobQueue = {
      claimJob: vi.fn(),
      claimNextJob: vi.fn(),
      completeJob: vi.fn(),
      enqueue: vi.fn(),
      failJob: vi.fn(),
      getJob: vi.fn(),
    }
  })

  it('returns NOOP when no queued job is available', async () => {
    vi.mocked(syncJobQueue.claimNextJob).mockResolvedValue(null)

    await expect(runNextSyncJob({ documentStore, syncJobQueue })).resolves.toEqual({
      result: 'NOOP',
    })
  })

  it('runs the Steam sync and completes the queue job', async () => {
    vi.mocked(syncJobQueue.claimNextJob).mockResolvedValue({
      runCount: 1,
      enqueuedAt: '2026-03-21T02:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      mode: 'sync',
      provider: 'steam',
      status: 'processing',
      updatedAt: '2026-03-21T02:00:00.000Z',
      userId: 'chrisvogt',
    })
    vi.mocked(syncSteamData).mockResolvedValue({
      data: {
        collections: {
          ownedGames: [{ id: 1 }, { id: 2 }],
          recentlyPlayedGames: [{ id: 3 }],
        },
      },
      result: 'SUCCESS',
    })

    await expect(runNextSyncJob({ documentStore, syncJobQueue })).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      result: 'SUCCESS',
    })
    expect(syncSteamData).toHaveBeenCalledWith(documentStore, {
      userId: 'chrisvogt',
    })
    expect(syncJobQueue.completeJob).toHaveBeenCalledWith(
      'sync-chrisvogt-steam',
      expect.objectContaining({
        result: 'SUCCESS',
      })
    )
    const completedSummary = vi.mocked(syncJobQueue.completeJob).mock.calls[0][1]
    expect(completedSummary).not.toHaveProperty('metrics')
  })

  it('completes Steam jobs without queue metrics when sync omits metrics', async () => {
    vi.mocked(syncJobQueue.claimNextJob).mockResolvedValue({
      runCount: 1,
      enqueuedAt: '2026-03-21T02:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      mode: 'sync',
      provider: 'steam',
      status: 'processing',
      updatedAt: '2026-03-21T02:00:00.000Z',
      userId: 'chrisvogt',
    })
    vi.mocked(syncSteamData).mockResolvedValue({
      result: 'SUCCESS',
    })

    await expect(runNextSyncJob({ documentStore, syncJobQueue })).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      result: 'SUCCESS',
    })

    expect(syncJobQueue.completeJob).toHaveBeenCalledTimes(1)
    const completedSummary = vi.mocked(syncJobQueue.completeJob).mock.calls[0][1]
    expect(completedSummary).not.toHaveProperty('metrics')
    expect(completedSummary.result).toBe('SUCCESS')
  })

  it('does not throw when Steam returns SUCCESS with undefined data', async () => {
    vi.mocked(syncSteamData).mockResolvedValue({
      data: undefined,
      result: 'SUCCESS',
    })

    await expect(processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-steam',
        mode: 'sync',
        provider: 'steam',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      result: 'SUCCESS',
    })

    const completedSummary = vi.mocked(syncJobQueue.completeJob).mock.calls[0][1]
    expect(completedSummary).not.toHaveProperty('metrics')
  })

  it('includes explicit metrics on the job summary for non-Steam SUCCESS', async () => {
    vi.mocked(syncJobQueue.claimNextJob).mockResolvedValue({
      runCount: 1,
      enqueuedAt: '2026-03-21T02:00:00.000Z',
      jobId: 'sync-chrisvogt-spotify',
      mode: 'sync',
      provider: 'spotify',
      status: 'processing',
      updatedAt: '2026-03-21T02:00:00.000Z',
      userId: 'chrisvogt',
    })
    vi.mocked(syncSpotifyData).mockResolvedValue({
      result: 'SUCCESS',
      metrics: { playlistsSynced: 3 },
    })

    await expect(runNextSyncJob({ documentStore, syncJobQueue })).resolves.toEqual({
      jobId: 'sync-chrisvogt-spotify',
      result: 'SUCCESS',
    })

    expect(syncJobQueue.completeJob).toHaveBeenCalledWith(
      'sync-chrisvogt-spotify',
      expect.objectContaining({
        result: 'SUCCESS',
        metrics: { playlistsSynced: 3 },
      }),
    )
  })

  it('does not put queue metrics on the job summary for Steam even if the job returns metrics', async () => {
    vi.mocked(syncSteamData).mockResolvedValue({
      data: {
        collections: {
          ownedGames: [{ id: 1 }],
        },
      },
      metrics: {
        ownedGamesCount: 1,
        recentlyPlayedGamesCount: 0,
      },
      result: 'SUCCESS',
    })

    await processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-steam',
        mode: 'sync',
        provider: 'steam',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })

    const completedSummary = vi.mocked(syncJobQueue.completeJob).mock.calls[0][1]
    expect(completedSummary).not.toHaveProperty('metrics')
    expect(completedSummary.result).toBe('SUCCESS')
  })

  it('marks the job failed when the sync job returns FAILURE', async () => {
    vi.mocked(syncJobQueue.claimNextJob).mockResolvedValue({
      runCount: 1,
      enqueuedAt: '2026-03-21T02:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      mode: 'sync',
      provider: 'steam',
      status: 'processing',
      updatedAt: '2026-03-21T02:00:00.000Z',
      userId: 'chrisvogt',
    })
    vi.mocked(syncSteamData).mockResolvedValue({
      error: 'Steam unavailable',
      result: 'FAILURE',
    })

    await expect(runNextSyncJob({ documentStore, syncJobQueue })).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      result: 'FAILURE',
    })
    expect(syncJobQueue.failJob).toHaveBeenCalledWith(
      'sync-chrisvogt-steam',
      'Steam unavailable',
      expect.objectContaining({
        result: 'FAILURE',
      })
    )
  })

  it('redacts secrets from logged errors when the sync job returns FAILURE', async () => {
    const tokenError =
      'Request failed: GET https://api.steampowered.com/?key=steam-secret&steamid=1'
    vi.mocked(syncSteamData).mockResolvedValue({
      error: tokenError,
      result: 'FAILURE',
    })

    await processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-steam',
        mode: 'sync',
        provider: 'steam',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })

    expect(getLogger().error).toHaveBeenCalledWith(
      'Sync job failed',
      expect.objectContaining({
        error: 'Request failed: GET https://api.steampowered.com/?key=[REDACTED]&steamid=1',
      }),
    )
  })

  it('processes an already claimed sync job directly', async () => {
    vi.mocked(syncSteamData).mockResolvedValue({
      data: {
        collections: {
          ownedGames: [],
          recentlyPlayedGames: [],
        },
      },
      result: 'SUCCESS',
    })

    await expect(processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-steam',
        mode: 'sync',
        provider: 'steam',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      result: 'SUCCESS',
    })
  })

  it.each([
    ['discogs', syncDiscogsData],
    ['flickr', syncFlickrData],
    ['goodreads', syncGoodreadsData],
    ['instagram', syncInstagramData],
    ['spotify', syncSpotifyData],
  ] as const)('dispatches %s jobs through the matching sync job', async (provider, jobModule) => {
    vi.mocked(jobModule).mockResolvedValueOnce({
      result: 'SUCCESS',
    })

    await expect(processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: `sync-chrisvogt-${provider}`,
        mode: 'sync',
        provider,
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })).resolves.toEqual({
      jobId: `sync-chrisvogt-${provider}`,
      result: 'SUCCESS',
    })
    expect(jobModule).toHaveBeenCalledWith(documentStore, {
      userId: 'chrisvogt',
    })
  })

  it('passes onProgress into provider jobs when processSyncJob receives it', async () => {
    const onProgress = vi.fn()
    vi.mocked(syncFlickrData).mockResolvedValue({ result: 'SUCCESS' })

    await processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-flickr',
        mode: 'sync',
        provider: 'flickr',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
      onProgress,
    })

    expect(syncFlickrData).toHaveBeenCalledWith(documentStore, {
      userId: 'chrisvogt',
      onProgress,
    })
  })

  it('passes integrationLookupUserId into Flickr jobs without onProgress', async () => {
    vi.mocked(syncFlickrData).mockResolvedValue({ flickrAuthMode: 'oauth', result: 'SUCCESS' })

    await processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-flickr',
        integrationLookupUserId: 'firebase-integration-uid',
        mode: 'sync',
        provider: 'flickr',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })

    expect(syncFlickrData).toHaveBeenCalledWith(documentStore, {
      integrationLookupUserId: 'firebase-integration-uid',
      userId: 'chrisvogt',
    })
  })

  it('returns flickrAuthMode on successful Flickr sync', async () => {
    vi.mocked(syncFlickrData).mockResolvedValue({
      flickrAuthMode: 'env',
      result: 'SUCCESS',
    })

    await expect(processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-flickr',
        mode: 'sync',
        provider: 'flickr',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })).resolves.toEqual({
      flickrAuthMode: 'env',
      jobId: 'sync-chrisvogt-flickr',
      result: 'SUCCESS',
    })
  })

  it('fails with a helpful error when the provider is not implemented', async () => {
    await expect(processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-letterboxd',
        mode: 'sync',
        provider: 'letterboxd' as never,
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })).resolves.toEqual({
      jobId: 'sync-chrisvogt-letterboxd',
      result: 'FAILURE',
    })

    expect(syncJobQueue.failJob).toHaveBeenCalledWith(
      'sync-chrisvogt-letterboxd',
      'Sync is not implemented for provider: letterboxd',
      expect.objectContaining({
        result: 'FAILURE',
      })
    )
  })

  it('fails the job when the sync handler throws unexpectedly', async () => {
    vi.mocked(syncSteamData).mockRejectedValueOnce(
      new Error('GET https://api.steampowered.com/?key=steam-secret'),
    )

    await expect(processSyncJob({
      documentStore,
      job: {
        runCount: 1,
        enqueuedAt: '2026-03-21T02:00:00.000Z',
        jobId: 'sync-chrisvogt-steam',
        mode: 'sync',
        provider: 'steam',
        status: 'processing',
        updatedAt: '2026-03-21T02:00:00.000Z',
        userId: 'chrisvogt',
      },
      syncJobQueue,
    })).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      result: 'FAILURE',
    })

    expect(syncJobQueue.failJob).toHaveBeenCalledWith(
      'sync-chrisvogt-steam',
      expect.objectContaining({
        message: 'GET https://api.steampowered.com/?key=steam-secret',
      }),
      expect.objectContaining({
        result: 'FAILURE',
      })
    )
    expect(getLogger().error).toHaveBeenCalledWith(
      'Sync job threw unexpectedly',
      expect.objectContaining({
        error: 'GET https://api.steampowered.com/?key=[REDACTED]',
      }),
    )
  })
})
