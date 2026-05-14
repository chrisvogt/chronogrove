import type { Application } from 'express'

type StackEntry = {
  route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: Function }> }
}

export function findExpressRouteHandler(
  app: Application,
  method: 'get' | 'put' | 'delete' | 'post' | 'patch',
  routePath: string
): Function {
  const layer = app.router.stack.find(
    (entry: StackEntry) => entry.route?.path === routePath && entry.route?.methods?.[method]
  )
  if (!layer?.route?.stack?.length) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`)
  }
  return layer.route.stack[layer.route.stack.length - 1].handle
}
