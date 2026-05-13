import { createWriteStream, promises as fs } from 'fs'
import https from 'https'
import path from 'path'

import type { MediaDescriptor, MediaStore, StoredMedia } from '../../ports/media-store.js'

async function listFilesRecursive(rootDirectory: string, currentDirectory = ''): Promise<string[]> {
  const absoluteDirectory = currentDirectory
    ? path.join(rootDirectory, currentDirectory)
    : rootDirectory

  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const relativePath = currentDirectory
      ? path.posix.join(currentDirectory, entry.name)
      : entry.name

    if (entry.isDirectory()) {
      return listFilesRecursive(rootDirectory, relativePath)
    }

    return [relativePath]
  }))

  return nestedFiles.flat()
}

function stringifyUnknown(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message
  }
  if (typeof reason === 'string') {
    return reason
  }
  try {
    return JSON.stringify(reason)
  } catch {
    return '[object]'
  }
}

function rejectAsError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(stringifyUnknown(reason))
}

function subscribeWriteStreamFinish(
  writeStream: ReturnType<typeof createWriteStream>,
  destinationPath: string,
  resolve: () => void,
  reject: (e: Error) => void,
): void {
  writeStream.on('finish', () => {
    writeStream.close((closeErr) => {
      if (closeErr) {
        reject(new Error(`Failed to upload ${destinationPath}: ${closeErr.message}`))
        return
      }
      resolve()
    })
  })
  writeStream.on('error', (err) => {
    reject(new Error(`Failed to upload ${destinationPath}: ${err.message}`))
  })
}

async function downloadHttpsToFile(
  mediaURL: string,
  absoluteDestinationPath: string,
  destinationPath: string,
  id: string
): Promise<void> {
  await fs.mkdir(path.dirname(absoluteDestinationPath), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    https
      .get(mediaURL, (res) => {
        const writeStream = createWriteStream(absoluteDestinationPath)
        res.pipe(writeStream)
        subscribeWriteStreamFinish(writeStream, destinationPath, resolve, reject)
      })
      .on('error', (err) => {
        reject(new Error(`Failed to download media for ${id}: ${err.message}`))
      })
  })
}

export class LocalDiskMediaStore implements MediaStore {
  constructor(private readonly rootDirectory: string) {}

  async listFiles(): Promise<string[]> {
    try {
      return await listFilesRecursive(this.rootDirectory)
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return []
      }

      throw error
    }
  }

  async fetchAndStore({ destinationPath, mediaURL, id }: MediaDescriptor): Promise<StoredMedia> {
    if (!mediaURL) {
      throw new Error(`Missing media to download for ${id}.`)
    }

    const absoluteDestinationPath = this.resolveAbsolutePath(destinationPath)

    try {
      await downloadHttpsToFile(mediaURL, absoluteDestinationPath, destinationPath, id)
    } catch (error) {
      throw rejectAsError(error)
    }

    return {
      id,
      fileName: destinationPath,
    }
  }

  describe() {
    return {
      backend: 'disk',
      target: this.rootDirectory,
    }
  }

  resolveAbsolutePath(relativePath: string) {
    const normalizedPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
    return path.join(this.rootDirectory, normalizedPath)
  }
}

export { stringifyUnknown, rejectAsError }
