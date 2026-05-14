import { vi } from 'vitest'

/** Route-coverage tests set this before loading the app so default mock payloads match assertions. */
export const SYNC_MANUAL_JOB_ID_ENV = 'CG_TEST_SYNC_MANUAL_JOB_ID'

vi.mock('../../jobs/delete-user.js', () => ({
  default: vi.fn(() => Promise.resolve({ result: 'SUCCESS' })),
}))

vi.mock('../../widgets/get-widget-content.js', () => ({
  getWidgetContent: vi.fn(() => Promise.resolve({ ok: true })),
  validWidgetIds: ['spotify'],
}))

vi.mock('../../services/sync-manual.js', () => ({
  runSyncForProvider: vi.fn(() => {
    const id = process.env[SYNC_MANUAL_JOB_ID_ENV] ?? 'j'
    return Promise.resolve({
      afterJob: { jobId: id, status: 'completed' },
      beforeJob: { jobId: id, status: 'queued' },
      enqueue: { jobId: id, status: 'enqueued' },
      worker: { jobId: id, result: 'SUCCESS' },
    })
  }),
}))
