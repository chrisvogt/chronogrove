import { vi } from 'vitest'

type AnyFn = (...args: never[]) => unknown

export type ExpressAppTestAuthService = {
  createSessionCookie: AnyFn
  deleteUser: AnyFn
  getUser: AnyFn
  revokeRefreshTokens: AnyFn
  verifyIdToken: AnyFn
  verifySessionCookie: AnyFn
}

export type ExpressAppTestSyncJobQueue = {
  claimJob: AnyFn
  claimNextJob: AnyFn
  completeJob: AnyFn
  enqueue: AnyFn
  failJob: AnyFn
  getJob: AnyFn
}

export function expressAppTestLogger(): { error: AnyFn; info: AnyFn; warn: AnyFn } {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
}

export function expressAppTestAuthService(): ExpressAppTestAuthService {
  return {
    createSessionCookie: vi.fn(),
    deleteUser: vi.fn(),
    getUser: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    verifyIdToken: vi.fn(),
    verifySessionCookie: vi.fn(),
  }
}

export function expressAppTestSyncJobQueue(): ExpressAppTestSyncJobQueue {
  return {
    claimJob: vi.fn(),
    claimNextJob: vi.fn(),
    completeJob: vi.fn(),
    enqueue: vi.fn(),
    failJob: vi.fn(),
    getJob: vi.fn(),
  }
}
