import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockToStoredDateTime = vi.hoisted(() => vi.fn(() => '2026-03-21T12:34:56.000Z'))

const fieldValueDeleteSentinel = vi.hoisted(() => ({}))

const {
  mockCollection,
  mockDoc,
  mockDocGet,
  mockDocSet,
  mockFirestore,
  mockLimit,
  mockQueryGet,
  mockRunTransaction,
  mockTransactionGet,
  mockTransactionSet,
  mockWhere,
} = vi.hoisted(() => {
  const mockDocGet = vi.fn()
  const mockDocSet = vi.fn()
  const mockDoc = vi.fn((jobId: string) => ({
    get: mockDocGet,
    id: jobId,
    set: mockDocSet,
  }))
  const mockQueryGet = vi.fn()
  const mockLimit = vi.fn(() => ({
    get: mockQueryGet,
  }))
  const mockWhere = vi.fn(() => ({
    limit: mockLimit,
  }))
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
    where: mockWhere,
  }))
  const mockTransactionGet = vi.fn()
  const mockTransactionSet = vi.fn()
  const mockRunTransaction = vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback({
      get: mockTransactionGet,
      set: mockTransactionSet,
    })
  )
  const mockFirestore = vi.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  }))

  return {
    mockCollection,
    mockDoc,
    mockDocGet,
    mockDocSet,
    mockFirestore,
    mockLimit,
    mockQueryGet,
    mockRunTransaction,
    mockTransactionGet,
    mockTransactionSet,
    mockWhere,
  }
})

vi.mock('firebase-admin', () => ({
  default: {
    firestore: mockFirestore,
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: () => fieldValueDeleteSentinel,
  },
}))

vi.mock('../../utils/time.js', () => ({
  toStoredDateTime: mockToStoredDateTime,
}))

import {
  FirestoreSyncJobQueue,
  SYNC_JOBS_COLLECTION,
  getQueuedSyncJobFromSnapshot,
  toSyncJobId,
} from './firestore-sync-job-queue.js'

describe('FirestoreSyncJobQueue', () => {
  const baseJob = {
    mode: 'sync' as const,
    provider: 'steam' as const,
    userId: 'chrisvogt',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockToStoredDateTime.mockReturnValue('2026-03-21T12:34:56.000Z')
    mockRunTransaction.mockImplementation(async (callback) =>
      callback({
        get: mockTransactionGet,
        set: mockTransactionSet,
      })
    )
  })

  it('builds stable queue job ids', () => {
    expect(toSyncJobId(baseJob)).toBe('sync-chrisvogt-steam')
  })

  it('returns null when getJob cannot find the job', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockDocGet.mockResolvedValue({
      exists: false,
    })

    await expect(queue.getJob('sync-chrisvogt-steam')).resolves.toBeNull()

    expect(mockCollection).toHaveBeenCalledWith(SYNC_JOBS_COLLECTION)
    expect(mockDoc).toHaveBeenCalledWith('sync-chrisvogt-steam')
  })

  it('returns the stored job when getJob finds a snapshot', async () => {
    const queue = new FirestoreSyncJobQueue()
    const storedJob = {
      ...baseJob,
      enqueuedAt: '2026-03-21T12:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      runCount: 2,
      status: 'queued' as const,
      updatedAt: '2026-03-21T12:00:00.000Z',
    }
    mockDocGet.mockResolvedValue({
      data: () => storedJob,
      exists: true,
    })

    await expect(queue.getJob('sync-chrisvogt-steam')).resolves.toEqual(storedJob)
  })

  it('skips enqueue when the existing job is already queued', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockTransactionGet.mockResolvedValue({
      data: () => ({
        status: 'queued',
      }),
      exists: true,
    })

    await expect(queue.enqueue(baseJob)).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      status: 'skipped',
    })

    expect(mockTransactionSet).not.toHaveBeenCalled()
  })

  it('skips enqueue when the existing job is already processing', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockTransactionGet.mockResolvedValue({
      data: () => ({
        status: 'processing',
      }),
      exists: true,
    })

    await expect(queue.enqueue(baseJob)).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      status: 'skipped',
    })
  })

  it('enqueues a job and preserves reusable fields from a previous run', async () => {
    const queue = new FirestoreSyncJobQueue()
    const summary = {
      durationMs: 1234,
      result: 'SUCCESS' as const,
    }
    mockTransactionGet.mockResolvedValue({
      data: () => ({
        runCount: 7,
        status: 'completed',
        summary,
      }),
      exists: true,
    })

    await expect(queue.enqueue(baseJob)).resolves.toEqual({
      jobId: 'sync-chrisvogt-steam',
      status: 'enqueued',
    })

    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sync-chrisvogt-steam',
      }),
      {
        ...baseJob,
        enqueuedAt: '2026-03-21T12:34:56.000Z',
        error: fieldValueDeleteSentinel,
        jobId: 'sync-chrisvogt-steam',
        runCount: 7,
        status: 'queued',
        summary,
        updatedAt: '2026-03-21T12:34:56.000Z',
      },
      { merge: true }
    )
  })

  it('starts a new queued record when there is no prior job', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockTransactionGet.mockResolvedValue({
      exists: false,
    })

    await queue.enqueue(baseJob)

    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sync-chrisvogt-steam',
      }),
      {
        ...baseJob,
        enqueuedAt: '2026-03-21T12:34:56.000Z',
        error: fieldValueDeleteSentinel,
        jobId: 'sync-chrisvogt-steam',
        runCount: 0,
        status: 'queued',
        summary: fieldValueDeleteSentinel,
        updatedAt: '2026-03-21T12:34:56.000Z',
      },
      { merge: true }
    )
  })

  it('returns null when there is no queued job to claim', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockQueryGet.mockResolvedValue({
      docs: [],
    })

    await expect(queue.claimNextJob()).resolves.toBeNull()

    expect(mockWhere).toHaveBeenCalledWith('status', '==', 'queued')
    expect(mockLimit).toHaveBeenCalledWith(1)
  })

  it('claims the first queued job by id', async () => {
    const queue = new FirestoreSyncJobQueue()
    const claimedJob = {
      ...baseJob,
      enqueuedAt: '2026-03-21T12:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      runCount: 1,
      status: 'processing' as const,
      updatedAt: '2026-03-21T12:34:56.000Z',
    }
    mockQueryGet.mockResolvedValue({
      docs: [{ id: 'sync-chrisvogt-steam' }],
    })
    const claimJobSpy = vi.spyOn(queue, 'claimJob').mockResolvedValue(claimedJob)

    await expect(queue.claimNextJob()).resolves.toEqual(claimedJob)
    expect(claimJobSpy).toHaveBeenCalledWith('sync-chrisvogt-steam')
  })

  it('returns null when claimJob cannot find the record', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockTransactionGet.mockResolvedValue({
      exists: false,
    })

    await expect(queue.claimJob('sync-chrisvogt-steam')).resolves.toBeNull()
  })

  it('returns null when claimJob sees a non-queued record', async () => {
    const queue = new FirestoreSyncJobQueue()
    mockTransactionGet.mockResolvedValue({
      data: () => ({
        ...baseJob,
        jobId: 'sync-chrisvogt-steam',
        runCount: 2,
        status: 'processing',
      }),
      exists: true,
    })

    await expect(queue.claimJob('sync-chrisvogt-steam')).resolves.toBeNull()
    expect(mockTransactionSet).not.toHaveBeenCalled()
  })

  it('claims a queued job and increments the run count', async () => {
    const queue = new FirestoreSyncJobQueue()
    const queuedJob = {
      ...baseJob,
      enqueuedAt: '2026-03-21T12:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      runCount: 2,
      status: 'queued' as const,
      updatedAt: '2026-03-21T12:00:00.000Z',
    }
    mockTransactionGet.mockResolvedValue({
      data: () => queuedJob,
      exists: true,
    })

    await expect(queue.claimJob('sync-chrisvogt-steam')).resolves.toEqual({
      ...queuedJob,
      lastStartedAt: '2026-03-21T12:34:56.000Z',
      runCount: 3,
      status: 'processing',
      updatedAt: '2026-03-21T12:34:56.000Z',
    })

    expect(mockTransactionSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'sync-chrisvogt-steam' }), {
      ...queuedJob,
      lastStartedAt: '2026-03-21T12:34:56.000Z',
      runCount: 3,
      status: 'processing',
      updatedAt: '2026-03-21T12:34:56.000Z',
    })
  })

  it('treats missing run count as zero when claiming', async () => {
    const queue = new FirestoreSyncJobQueue()
    const queuedJob = {
      ...baseJob,
      enqueuedAt: '2026-03-21T12:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      status: 'queued' as const,
      updatedAt: '2026-03-21T12:00:00.000Z',
    }
    mockTransactionGet.mockResolvedValue({
      data: () => ({ ...queuedJob, runCount: undefined }),
      exists: true,
    })

    await expect(queue.claimJob('sync-chrisvogt-steam')).resolves.toEqual({
      ...queuedJob,
      lastStartedAt: '2026-03-21T12:34:56.000Z',
      runCount: 1,
      status: 'processing',
      updatedAt: '2026-03-21T12:34:56.000Z',
    })
  })

  it('completes a job with the supplied summary', async () => {
    const queue = new FirestoreSyncJobQueue()
    const summary = {
      durationMs: 2500,
      metrics: {
        processedCount: 4,
      },
      result: 'SUCCESS' as const,
    }

    await queue.completeJob('sync-chrisvogt-steam', summary)

    expect(mockDocSet).toHaveBeenCalledWith(
      {
        completedAt: '2026-03-21T12:34:56.000Z',
        error: fieldValueDeleteSentinel,
        status: 'completed',
        summary,
        updatedAt: '2026-03-21T12:34:56.000Z',
      },
      { merge: true }
    )
  })

  it('stores Error instances as their message when failing a job', async () => {
    const queue = new FirestoreSyncJobQueue()
    const summary = {
      durationMs: 2500,
      result: 'FAILURE' as const,
    }

    await queue.failJob('sync-chrisvogt-steam', new Error('Steam unavailable'), summary)

    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Steam unavailable',
        status: 'failed',
      }),
      { merge: true }
    )
  })

  it('falls back to message-like objects and strings when failing a job', async () => {
    const queue = new FirestoreSyncJobQueue()
    const summary = {
      durationMs: 2500,
      result: 'FAILURE' as const,
    }

    await queue.failJob(
      'sync-chrisvogt-steam',
      { message: 'Structured failure' },
      summary
    )
    await queue.failJob('sync-chrisvogt-steam', 'plain failure', summary)

    expect(mockDocSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        error: 'Structured failure',
      }),
      { merge: true }
    )
    expect(mockDocSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        error: 'plain failure',
      }),
      { merge: true }
    )
  })

  it('stringifies non-message objects and uses Unknown error when stringify throws', async () => {
    const queue = new FirestoreSyncJobQueue()
    const summary = { durationMs: 1, result: 'FAILURE' as const }

    mockDocSet.mockClear()
    await queue.failJob('sync-chrisvogt-steam', { code: 'x', status: 418 }, summary)
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ error: '{"code":"x","status":418}' }),
      { merge: true },
    )

    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    mockDocSet.mockClear()
    await queue.failJob('sync-chrisvogt-steam', circular, summary)
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unknown error' }),
      { merge: true },
    )
  })

  it('maps queue snapshots back to stored jobs', () => {
    const storedJob = {
      ...baseJob,
      enqueuedAt: '2026-03-21T12:00:00.000Z',
      jobId: 'sync-chrisvogt-steam',
      runCount: 1,
      status: 'queued' as const,
      updatedAt: '2026-03-21T12:00:00.000Z',
    }

    expect(
      getQueuedSyncJobFromSnapshot({
        data: () => storedJob,
      } as never)
    ).toEqual(storedJob)
  })
})
