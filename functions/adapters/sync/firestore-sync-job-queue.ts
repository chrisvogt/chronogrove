/**
 * Firestore-backed implementation of the sync job queue. It stores queue state
 * in the `sync_jobs` collection and is responsible for enqueue, claim,
 * completion, and failure transitions.
 */
import admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { QueryDocumentSnapshot } from '@google-cloud/firestore'

import type { SyncJobQueue } from '../../ports/sync-job-queue.js'
import type {
  EnqueueSyncJobResult,
  QueuedSyncJob,
  QueuedSyncJobDescriptor,
  SyncJobSummary,
} from '../../types/sync-pipeline.js'
import { toStoredDateTime } from '../../utils/time.js'

const SYNC_JOBS_COLLECTION = 'sync_jobs'

const toSyncJobId = ({ mode, provider, userId }: QueuedSyncJobDescriptor) =>
  `${mode}-${userId}-${provider}`

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

export class FirestoreSyncJobQueue implements SyncJobQueue {
  async getJob(jobId: string): Promise<QueuedSyncJob | null> {
    const snapshot = await admin.firestore().collection(SYNC_JOBS_COLLECTION).doc(jobId).get()
    if (!snapshot.exists) {
      return null
    }

    return snapshot.data() as QueuedSyncJob
  }

  async enqueue(job: QueuedSyncJobDescriptor): Promise<EnqueueSyncJobResult> {
    const firestore = admin.firestore()
    const jobId = toSyncJobId(job)
    const jobRef = firestore.collection(SYNC_JOBS_COLLECTION).doc(jobId)
    const now = toStoredDateTime()

    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef)
      const existing = snapshot.exists ? (snapshot.data() as Partial<QueuedSyncJob>) : null

      if (existing?.status === 'queued' || existing?.status === 'processing') {
        return {
          jobId,
          status: 'skipped',
        }
      }

      transaction.set(
        jobRef,
        {
          ...job,
          runCount: existing?.runCount ?? 0,
          enqueuedAt: now,
          error: FieldValue.delete(),
          jobId,
          status: 'queued',
          ...(existing?.summary !== undefined
            ? { summary: existing.summary }
            : { summary: FieldValue.delete() }),
          updatedAt: now,
        },
        { merge: true }
      )

      return {
        jobId,
        status: 'enqueued',
      }
    })
  }

  async claimNextJob(): Promise<QueuedSyncJob | null> {
    const firestore = admin.firestore()
    const queuedSnapshot = await firestore
      .collection(SYNC_JOBS_COLLECTION)
      .where('status', '==', 'queued')
      .limit(1)
      .get()

    const candidate = queuedSnapshot.docs.at(0)
    if (!candidate) {
      return null
    }

    return this.claimJob(candidate.id)
  }

  async claimJob(jobId: string): Promise<QueuedSyncJob | null> {
    const firestore = admin.firestore()
    const jobRef = firestore.collection(SYNC_JOBS_COLLECTION).doc(jobId)

    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef)
      if (!snapshot.exists) {
        return null
      }

      const currentJob = snapshot.data() as QueuedSyncJob
      if (currentJob.status !== 'queued') {
        return null
      }

      const now = toStoredDateTime()
      const claimedJob: QueuedSyncJob = {
        ...currentJob,
        runCount: (currentJob.runCount ?? 0) + 1,
        lastStartedAt: now,
        status: 'processing',
        updatedAt: now,
      }

      transaction.set(jobRef, claimedJob)
      return claimedJob
    })
  }

  async completeJob(jobId: string, summary: SyncJobSummary): Promise<void> {
    const now = toStoredDateTime()
    await admin.firestore().collection(SYNC_JOBS_COLLECTION).doc(jobId).set(
      {
        completedAt: now,
        error: FieldValue.delete(),
        status: 'completed',
        summary,
        updatedAt: now,
      },
      { merge: true }
    )
  }

  async failJob(jobId: string, error: unknown, summary: SyncJobSummary): Promise<void> {
    const now = toStoredDateTime()
    await admin.firestore().collection(SYNC_JOBS_COLLECTION).doc(jobId).set(
      {
        completedAt: now,
        error: toErrorMessage(error),
        status: 'failed',
        summary,
        updatedAt: now,
      },
      { merge: true }
    )
  }
}

export const getQueuedSyncJobFromSnapshot = (
  snapshot: QueryDocumentSnapshot
): QueuedSyncJob => snapshot.data() as QueuedSyncJob

export { SYNC_JOBS_COLLECTION, toSyncJobId }
