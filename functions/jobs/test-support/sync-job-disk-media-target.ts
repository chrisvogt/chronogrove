import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Temp disk media root for Vitest (`disk` backend mocks); unique per call. */
export function syncJobDiskMediaTarget(providerSlug: string): string {
  return join(tmpdir(), `cg-sync-${providerSlug}-${randomUUID()}`)
}
