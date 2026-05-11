import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, promises as fsPromises } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { Readable } from 'stream'

vi.mock('https', () => ({
  default: { get: vi.fn() },
  get: vi.fn(),
}))

import { LocalDiskMediaStore } from './local-disk-media-store.js'

describe('LocalDiskMediaStore', () => {
  let rootDirectory: string
  let adapter: LocalDiskMediaStore
  let mockHttpsGet

  beforeEach(async () => {
    vi.clearAllMocks()
    rootDirectory = mkdtempSync(path.join(tmpdir(), 'metrics-media-'))
    adapter = new LocalDiskMediaStore(rootDirectory)

    const https = await import('https')
    https.default.get.mockImplementation(https.get)
    mockHttpsGet = https.get
  })

  afterEach(() => {
    rmSync(rootDirectory, { force: true, recursive: true })
    vi.restoreAllMocks()
  })

  it('returns an empty list when the root directory has no files', async () => {
    await expect(adapter.listFiles()).resolves.toEqual([])
  })

  it('writes downloaded media to disk and lists it', async () => {
    mockHttpsGet.mockImplementation((_url, callback) => {
      const response = new Readable({
        read() {
          this.push('hello world')
          this.push(null)
        },
      })
      callback(response)
      return { on: vi.fn() }
    })

    await expect(
      adapter.fetchAndStore({
        destinationPath: 'nested/test.txt',
        id: 'media123',
        mediaURL: 'https://example.com/test.txt',
      })
    ).resolves.toEqual({
      id: 'media123',
      fileName: 'nested/test.txt',
    })

    const absolutePath = path.join(rootDirectory, 'nested/test.txt')
    expect(existsSync(absolutePath)).toBe(true)
    expect(readFileSync(absolutePath, 'utf8')).toBe('hello world')
    await expect(adapter.listFiles()).resolves.toEqual(['nested/test.txt'])
  })

  it('describes the configured backend', () => {
    expect(adapter.describe()).toEqual({
      backend: 'disk',
      target: rootDirectory,
    })
  })

  it('resolves absolute paths inside the root directory', () => {
    expect(adapter.resolveAbsolutePath('../nested/test.txt')).toBe(
      path.join(rootDirectory, 'nested/test.txt')
    )
  })

  it('returns an empty list when the root directory does not exist (ENOENT)', async () => {
    const nonExistentRoot = path.join(tmpdir(), `metrics-media-does-not-exist-${Date.now()}`)
    const missingAdapter = new LocalDiskMediaStore(nonExistentRoot)

    await expect(missingAdapter.listFiles()).resolves.toEqual([])
  })

  it('rethrows errors when the root directory exists but is not a directory', async () => {
    const filePath = path.join(rootDirectory, 'not-a-directory')
    writeFileSync(filePath, 'nope')

    const fileAsRootAdapter = new LocalDiskMediaStore(filePath)
    await expect(fileAsRootAdapter.listFiles()).rejects.toBeInstanceOf(Error)
  })

  it('rejects when mediaURL is missing', async () => {
    await expect(
      adapter.fetchAndStore({
        destinationPath: 'nested/test.txt',
        id: 'media123',
        mediaURL: undefined,
      }),
    ).rejects.toThrow('Missing media to download for media123.')
  })

  it('rejects when the download fails (https.get error)', async () => {
    mockHttpsGet.mockImplementation((_url, _callback) => {
      return {
        on: (_event: string, cb: (err: Error) => void) => {
          cb(new Error('download boom'))
          return this
        },
      }
    })

    await expect(
      adapter.fetchAndStore({
        destinationPath: 'nested/test.txt',
        id: 'media123',
        mediaURL: 'https://example.com/test.txt',
      }),
    ).rejects.toThrow('Failed to download media for media123: download boom')
  })

  it('rejects when the destination path is a directory (write stream error)', async () => {
    // Create a directory where the file is supposed to go to force a writeStream error (EISDIR).
    const absoluteDestinationPath = path.join(rootDirectory, 'nested/test.txt')
    mkdirSync(path.dirname(absoluteDestinationPath), { recursive: true })
    mkdirSync(absoluteDestinationPath)

    mockHttpsGet.mockImplementation((_url, callback) => {
      const response = new Readable({
        read() {
          this.push('hello world')
          this.push(null)
        },
      })
      callback(response)
      return { on: vi.fn().mockReturnThis() }
    })

    await expect(
      adapter.fetchAndStore({
        destinationPath: 'nested/test.txt',
        id: 'media123',
        mediaURL: 'https://example.com/test.txt',
      }),
    ).rejects.toThrow(/Failed to upload nested\/test\.txt: /)
  })

  it('wraps non-Error mkdir failures via rejectAsError', async () => {
    const mkdirSpy = vi.spyOn(fsPromises, 'mkdir').mockRejectedValueOnce('disk full')

    await expect(
      adapter.fetchAndStore({
        destinationPath: 'nested/mkdir-fail.txt',
        id: 'media-mkdir',
        mediaURL: 'https://example.com/x.bin',
      }),
    ).rejects.toThrow('disk full')

    mkdirSpy.mockRestore()
  })

  it('rejects when mkdir fails because rootDirectory is not a directory', async () => {
    const filePath = path.join(rootDirectory, 'root-is-file')
    writeFileSync(filePath, 'not a dir')
    const fileRootAdapter = new LocalDiskMediaStore(filePath)

    await expect(
      fileRootAdapter.fetchAndStore({
        destinationPath: 'nested/test.txt',
        id: 'media123',
        mediaURL: 'https://example.com/test.txt',
      }),
    ).rejects.toBeInstanceOf(Error)

    // Should fail before it even tries to download.
    expect(mockHttpsGet).not.toHaveBeenCalled()
  })
})
