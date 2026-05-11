import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { Readable, Writable } from 'stream'

const mockHttpsGet = vi.hoisted(() => vi.fn())

vi.mock('https', () => ({
  default: { get: mockHttpsGet },
  get: mockHttpsGet,
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    createWriteStream: vi.fn((_p: string) => {
      const ws = new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        },
      })
      Object.assign(ws, {
        close(cb: (err?: Error) => void) {
          queueMicrotask(() => cb(new Error('close flush failed')))
        },
      })
      return ws as ReturnType<typeof actual.createWriteStream>
    }),
  }
})

describe('LocalDiskMediaStore writeStream.close error path', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const https = await import('https')
    const mod = https as { default: { get: typeof mockHttpsGet }; get: typeof mockHttpsGet }
    mod.default.get.mockImplementation(mod.get)
  })

  it('rejects when close reports an error after the download pipe finishes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'disk-close-'))
    try {
      const { LocalDiskMediaStore } = await import('./local-disk-media-store.js')
      const adapter = new LocalDiskMediaStore(root)

      mockHttpsGet.mockImplementation((_url: string, callback: (res: Readable) => void) => {
        const response = new Readable({
          read() {
            this.push('x')
            this.push(null)
          },
        })
        callback(response)
        return { on: vi.fn() }
      })

      await expect(
        adapter.fetchAndStore({
          destinationPath: 'nested/f.txt',
          id: 'id1',
          mediaURL: 'https://example.com/x.bin',
        }),
      ).rejects.toThrow('Failed to upload nested/f.txt: close flush failed')

      const fs = await import('fs')
      expect(fs.createWriteStream).toHaveBeenCalled()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
