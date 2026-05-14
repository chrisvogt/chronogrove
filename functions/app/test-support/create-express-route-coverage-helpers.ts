import type { Application } from 'express'
import { vi } from 'vitest'

type StackEntry = {
  route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: Function }> }
}

export function findProtectedRouteMiddleware(
  app: Application,
  method: 'get' | 'delete',
  routePath: string
): Function {
  const layer = app.router.stack.find(
    (entry: StackEntry) => entry.route?.path === routePath && entry.route?.methods?.[method]
  )

  if (!layer?.route?.stack || layer.route.stack.length < 3) {
    throw new Error(`Protected route middleware not found: ${method.toUpperCase()} ${routePath}`)
  }

  // rateLimit → authenticateUser → requireVerifiedEmail → route handler
  return layer.route.stack[layer.route.stack.length - 3].handle
}

type MockRes = {
  json: (...args: never[]) => unknown
  send: (...args: never[]) => unknown
  status: (...args: never[]) => unknown
}

export function createMockExpressResponse(): MockRes {
  const response: MockRes = {
    json: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
  }
  vi.mocked(response.status).mockReturnValue(response)
  return response
}
