import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'

function stripTrailingPathSeparators(value: string): string {
  let result = value
  while (result.endsWith('/') || result.endsWith('\\')) {
    result = result.slice(0, -1)
  }
  return result
}

/**
 * `join(tmpdir(), component)` without importing `path` / `node:path`.
 * Use when Vitest mocks `path` (which is aliased to `node:path`).
 */
export function tmpdirRelativePath(component: string): string {
  const sep = process.platform === 'win32' ? '\\' : '/'
  const root = stripTrailingPathSeparators(tmpdir())
  return `${root}${sep}${component}`
}

/** Temp disk media root for Vitest (`disk` backend mocks); unique per call. */
export function syncJobDiskMediaTarget(providerSlug: string): string {
  return tmpdirRelativePath(`cg-sync-${providerSlug}-${randomUUID()}`)
}
