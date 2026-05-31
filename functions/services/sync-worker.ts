/**
 * Runs queued sync jobs by dispatching to the provider-specific sync modules and
 * recording completion or failure back to the sync job queue.
 */
import syncDiscogsData from '../jobs/sync-discogs-data.js'
import syncFlickrData from '../jobs/sync-flickr-data.js'
import syncGoodreadsData from '../jobs/sync-goodreads-data.js'
import syncInstagramData from '../jobs/sync-instagram-data.js'
import syncSpotifyData from '../jobs/sync-spotify-data.js'
import syncSteamData from '../jobs/sync-steam-data.js'
import type { DocumentStore } from '../ports/document-store.js'
import type { SyncJobQueue } from '../ports/sync-job-queue.js'
import { safeErrorMessageFromUnknown } from '../utils/redact-secrets.js'
import { getLogger } from './logger.js'
import type {
  QueuedSyncJob,
  SyncJobSummary,
  SyncProgressReporter,
} from '../types/sync-pipeline.js'
import type { SyncProviderId } from '../types/widget-content.js'

interface SyncExecutionResult {
  data?: unknown
  discogsAuthMode?: 'env' | 'oauth'
  error?: unknown
  flickrAuthMode?: 'env' | 'oauth'
  metrics?: Record<string, number>
  result: 'FAILURE' | 'SUCCESS'
}

const queueMetricsFromResult = (
  result: SyncExecutionResult,
  provider: SyncProviderId
): Record<string, number> => {
  if (result.result !== 'SUCCESS' || provider === 'steam') {
    return {}
  }

  const explicit = result.metrics
  if (
    explicit !== undefined &&
    explicit !== null &&
    typeof explicit === 'object' &&
    !Array.isArray(explicit) &&
    Object.keys(explicit).length > 0
  ) {
    return explicit
  }

  return {}
}

const buildSummary = (
  result: SyncExecutionResult,
  durationMs: number,
  provider: SyncProviderId
): SyncJobSummary => {
  const metrics = queueMetricsFromResult(result, provider)
  return {
    durationMs,
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
    result: result.result,
  }
}

const jobExecOpts = (job: QueuedSyncJob, onProgress?: SyncProgressReporter) => {
  const opts = onProgress
    ? { userId: job.userId, onProgress }
    : { userId: job.userId }
  if (job.integrationLookupUserId) {
    return { ...opts, integrationLookupUserId: job.integrationLookupUserId }
  }
  return opts
}

const runSyncJob = async (
  job: QueuedSyncJob,
  documentStore: DocumentStore,
  onProgress?: SyncProgressReporter
): Promise<SyncExecutionResult> => {
  const opts = jobExecOpts(job, onProgress)
  switch (job.provider) {
  case 'discogs':
    return syncDiscogsData(documentStore, opts) as Promise<SyncExecutionResult>
  case 'flickr':
    return syncFlickrData(documentStore, opts) as Promise<SyncExecutionResult>
  case 'goodreads':
    return syncGoodreadsData(documentStore, opts) as Promise<SyncExecutionResult>
  case 'instagram':
    return syncInstagramData(documentStore, opts) as Promise<SyncExecutionResult>
  case 'spotify':
    return syncSpotifyData(documentStore, opts) as Promise<SyncExecutionResult>
  case 'steam':
    return syncSteamData(documentStore, opts) as Promise<SyncExecutionResult>
  default:
    return {
      error: `Sync is not implemented for provider: ${job.provider}`,
      result: 'FAILURE',
    }
  }
}

export interface SyncWorkerResult {
  jobId?: string
  /** Present after a successful Discogs sync (manual or scheduled). */
  discogsAuthMode?: 'env' | 'oauth'
  /** Present after a successful Flickr sync (manual or scheduled). */
  flickrAuthMode?: 'env' | 'oauth'
  result: 'FAILURE' | 'NOOP' | 'SUCCESS'
}

export const processSyncJob = async ({
  documentStore,
  job,
  syncJobQueue,
  onProgress,
}: {
  documentStore: DocumentStore
  job: QueuedSyncJob
  syncJobQueue: SyncJobQueue
  onProgress?: SyncProgressReporter
}): Promise<SyncWorkerResult> => {
  const logger = getLogger()
  const startedAt = Date.now()
  try {
    const result = await runSyncJob(job, documentStore, onProgress)
    const durationMs = Date.now() - startedAt
    const summary = buildSummary(result, durationMs, job.provider)

    if (result.result === 'SUCCESS') {
      await syncJobQueue.completeJob(job.jobId, summary)
      logger.info('Sync job completed', {
        durationMs,
        jobId: job.jobId,
        provider: job.provider,
        userId: job.userId,
      })
      const flickrAuthMode = result.flickrAuthMode
      const discogsAuthMode = result.discogsAuthMode
      return {
        jobId: job.jobId,
        result: 'SUCCESS',
        ...(discogsAuthMode ? { discogsAuthMode } : {}),
        ...(flickrAuthMode ? { flickrAuthMode } : {}),
      }
    }

    await syncJobQueue.failJob(job.jobId, result.error, summary)
    logger.error('Sync job failed', {
      durationMs,
      error: safeErrorMessageFromUnknown(result.error),
      jobId: job.jobId,
      provider: job.provider,
      userId: job.userId,
    })
    return {
      jobId: job.jobId,
      result: 'FAILURE',
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const summary: SyncJobSummary = {
      durationMs,
      result: 'FAILURE',
    }
    await syncJobQueue.failJob(job.jobId, error, summary)
    logger.error('Sync job threw unexpectedly', {
      durationMs,
      error: safeErrorMessageFromUnknown(error),
      jobId: job.jobId,
      provider: job.provider,
      userId: job.userId,
    })
    return {
      jobId: job.jobId,
      result: 'FAILURE',
    }
  }
}

export const runNextSyncJob = async ({
  documentStore,
  syncJobQueue,
}: {
  documentStore: DocumentStore
  syncJobQueue: SyncJobQueue
}): Promise<SyncWorkerResult> => {
  const job = await syncJobQueue.claimNextJob()

  if (!job) {
    return {
      result: 'NOOP',
    }
  }

  return processSyncJob({
    documentStore,
    job,
    syncJobQueue,
  })
}
