import { createExpressApp, getSessionAuthError } from './app/create-express-app.js'
import {
  createBackendBootstrap,
  type BackendBootstrap,
} from './bootstrap/create-backend-bootstrap.js'
import createUserJob from './jobs/create-user.js'
import type { RuntimeUserCreationData } from './ports/runtime-platform.js'
import {
  registerFirebaseHttpFunction,
  registerFirebaseScheduledFunction,
  registerFirebaseUserCreationTrigger,
} from './runtime/firebase-functions-runtime.js'
import { getFirebaseRuntimeSecrets } from './runtime/firebase-runtime-config.js'
import { planSyncJobs } from './services/sync-planner.js'
import { runNextSyncJob } from './services/sync-worker.js'

const SYNC_WORKER_SCHEDULE = 'every 15 minutes'
const runtimeSecrets = getFirebaseRuntimeSecrets()

type ExpressApp = ReturnType<typeof createExpressApp>
type ExpressRequest = Parameters<ExpressApp>[0]
type ExpressResponse = Parameters<ExpressApp>[1]

let backendBootstrap: BackendBootstrap | undefined
let expressAppInstance: ExpressApp | undefined

const getBackendBootstrap = (): BackendBootstrap => {
  if (!backendBootstrap) {
    backendBootstrap = createBackendBootstrap()
  }

  return backendBootstrap
}

const getExpressApp = (): ExpressApp => {
  if (!expressAppInstance) {
    const {
      authService,
      documentStore,
      ensureRuntimeConfigApplied,
      getClientAuthConfig,
      logger,
      resolveMediaStore,
      syncJobQueue,
    } = getBackendBootstrap()

    expressAppInstance = createExpressApp({
      authService,
      documentStore,
      ensureRuntimeConfigApplied,
      getClientAuthConfig,
      logger,
      resolveMediaStore,
      syncJobQueue,
    })
  }

  return expressAppInstance
}

export const expressApp = (req: ExpressRequest, res: ExpressResponse): void => {
  getExpressApp()(req, res)
}

export { getSessionAuthError }

export const runSyncPlanner = registerFirebaseScheduledFunction(async () => {
  const { ensureRuntimeConfigApplied, logger, syncJobQueue } = getBackendBootstrap()
  await ensureRuntimeConfigApplied()
  const plannerResult = await planSyncJobs(syncJobQueue)
  logger.info('Sync planner finished', {
    enqueuedCount: plannerResult.enqueuedJobIds.length,
    enqueuedJobIds: plannerResult.enqueuedJobIds,
    providerCount: plannerResult.providerCount,
    skippedCount: plannerResult.skippedJobIds.length,
    skippedJobIds: plannerResult.skippedJobIds,
  })
}, runtimeSecrets)

export const runSyncWorker = registerFirebaseScheduledFunction(async () => {
  const { documentStore, ensureRuntimeConfigApplied, syncJobQueue } = getBackendBootstrap()
  await ensureRuntimeConfigApplied()
  await runNextSyncJob({
    documentStore,
    syncJobQueue,
  })
}, runtimeSecrets, {
  schedule: SYNC_WORKER_SCHEDULE,
})

export const handleUserCreation = registerFirebaseUserCreationTrigger(async (event) => {
  const { documentStore, ensureRuntimeConfigApplied, logger } = getBackendBootstrap()
  await ensureRuntimeConfigApplied()
  const rawUser: RuntimeUserCreationData | undefined = event.data
  const user = rawUser
    ? {
      ...rawUser,
      displayName: rawUser.displayName ?? undefined,
    }
    : undefined
  if (!user) {
    logger.error('handleUserCreation: event.data missing')
    return
  }
  const result = await createUserJob(user, documentStore)
  if (result.result !== 'SUCCESS') {
    logger.error('User creation trigger failed', { uid: user.uid, error: result.error })
  } else {
    logger.info('User creation trigger completed successfully', { uid: user.uid })
  }
}, runtimeSecrets)

export const app = registerFirebaseHttpFunction(async (req, res) => {
  const { ensureRuntimeConfigApplied } = getBackendBootstrap()
  await ensureRuntimeConfigApplied()
  expressApp(req as ExpressRequest, res as ExpressResponse)
}, runtimeSecrets)
