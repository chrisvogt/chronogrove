import pMap from 'p-map'
import type { DocumentStore } from '../ports/document-store.js'
import {
  describeMediaStore,
  listStoredMedia,
  storeRemoteMedia,
} from '../services/media/media-service.js'

import fetchDiscogsReleases from '../api/discogs/fetch-releases.js'
import fetchReleasesBatch from '../api/discogs/fetch-releases-batch.js'
import { getDiscogsConfig } from '../config/backend-config.js'
import { getLogger } from '../services/logger.js'
import { loadDiscogsAuthForUser } from '../services/discogs-integration-credentials.js'
import toDiscogsDestinationPath from '../transformers/to-discogs-destination-path.js'
import transformDiscogsRelease from '../transformers/transform-discogs-release.js'
import generateDiscogsSummary, { buildDiscogsSummaryInput } from '../api/ai-summary/generate-discogs-summary.js'
import { toStoredDateTime } from '../utils/time.js'
import { getDefaultWidgetUserId, toProviderCollectionPath } from '../config/backend-paths.js'
import type {
  DiscogsEnhancedRelease,
  DiscogsMediaDownloadTask,
} from '../types/discogs.js'
import type { DiscogsWidgetDocument } from '../types/widget-content.js'
import type { SyncJobExecutionOptions } from '../types/sync-pipeline.js'

const truncateLabel = (s: string, max = 64): string =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s

/*

Sync Discogs Data

The goal of this job is to store recent release data and artwork from a Discogs
collection into GCP Storage and Firebase.

* concurrent

- [x] Fetch all Discogs releases.
- [x] Fetch all saved media.

* sync

- [x] Store the raw Discogs response data.
- [x] Store the transformed Discogs releases.
- [x] Download each media file.
  - [x] Only download NEW media files
- [x] Upload each media file

*/

// Reducer to handle media filtering and transformation
const getMediaReducer = (storedMediaFileNames: string[] = []) =>
  (acc: DiscogsMediaDownloadTask[], release: DiscogsEnhancedRelease) => {
    const { id, basic_information: basicInfo } = release
    const thumb = basicInfo?.thumb
    const coverImage = basicInfo?.cover_image

    // Process thumb image
    if (thumb) {
      const thumbDestinationPath = toDiscogsDestinationPath(thumb, id, 'thumb')
      const isThumbAlreadyDownloaded = storedMediaFileNames.includes(thumbDestinationPath)
    
      if (!isThumbAlreadyDownloaded) {
        acc.push({
          destinationPath: thumbDestinationPath,
          id: `${id}_thumb`,
          mediaURL: thumb
        })
      }
    }

    // Process cover image
    if (coverImage) {
      const coverDestinationPath = toDiscogsDestinationPath(coverImage, id, 'cover')
      const isCoverAlreadyDownloaded = storedMediaFileNames.includes(coverDestinationPath)
    
      if (!isCoverAlreadyDownloaded) {
        acc.push({
          destinationPath: coverDestinationPath,
          id: `${id}_cover`,
          mediaURL: coverImage
        })
      }
    }

    return acc
  }

function logDiscogsFirestorePayloadSize(
  logger: ReturnType<typeof getLogger>,
  documentToSave: Record<string, unknown>,
  enhancedReleases: DiscogsEnhancedRelease[],
): void {
  const documentSizeBytes = Buffer.byteLength(JSON.stringify(documentToSave), 'utf8')
  const documentSizeKB = Math.round(documentSizeBytes / 1024)
  const documentSizeMB = Math.round((documentSizeBytes / (1024 * 1024)) * 100) / 100

  logger.info(
    `Document size before saving: ${documentSizeBytes} bytes (${documentSizeKB} KB, ${documentSizeMB} MB)`,
    {
      totalReleases: enhancedReleases.length,
      releasesWithResource: enhancedReleases.filter((r) => r.resource).length,
      releasesWithoutResource: enhancedReleases.filter((r) => !r.resource).length,
      firestoreLimit: 1048576,
      exceedsLimit: documentSizeBytes > 1048576,
      sizeReduction:
        documentSizeBytes > 1048576 ? 'Filtered resource data to reduce size' : 'No filtering needed',
    },
  )
}

const syncDiscogsData = async (
  documentStore: DocumentStore,
  options: SyncJobExecutionOptions = {}
) => {
  const logger = getLogger()
  const { onProgress } = options
  const storageUserId = options.userId ?? getDefaultWidgetUserId()
  const integrationLookupUserId = options.integrationLookupUserId ?? storageUserId

  try {
    const discogsCollectionPath = toProviderCollectionPath('discogs', storageUserId)
    const oauth = await loadDiscogsAuthForUser(documentStore, integrationLookupUserId)
    const discogsAuthMode = oauth ? 'oauth' : 'env'

    onProgress?.({
      phase: 'discogs.auth',
      message:
        discogsAuthMode === 'oauth'
          ? 'Using your connected Discogs account (OAuth).'
          : 'Using server Discogs API credentials (legacy).',
    })

    onProgress?.({
      phase: 'discogs.collection',
      message: 'Fetching your Discogs collection.',
    })
    const discogsResponse = await fetchDiscogsReleases({ oauth: oauth ?? undefined })

    const { releases, pagination } = discogsResponse

    logger.info(`Starting Discogs sync for ${releases.length} releases`)

    // Estimate completion time
    const estimatedTimeSeconds = Math.ceil(releases.length / 2) // With concurrency=2
    logger.info(`Estimated completion time: ~${estimatedTimeSeconds} seconds (with 1s delays)`)

    // Per-release progress is reported from fetchReleasesBatch
    const enhancedReleases = await fetchReleasesBatch(releases, {
      concurrency: 2, // Small concurrency to balance speed vs rate limits
      delayMs: 1000, // 1 second delay between requests to respect rate limits
      onProgress,
      stopOnError: false,
      oauth: oauth ?? undefined,
    })

    const storedMediaFileNames = await listStoredMedia()

    const mediaReducer = getMediaReducer(storedMediaFileNames)
    const mediaToDownload = enhancedReleases.reduce(mediaReducer, [])

    // Calculate document size before saving to Firestore
    const documentToSave = {
      ...discogsResponse,
      releases: enhancedReleases, // Store enhanced releases
      fetchedAt: toStoredDateTime(),
    }
    
    logDiscogsFirestorePayloadSize(logger, documentToSave, enhancedReleases)

    onProgress?.({
      phase: 'discogs.save_raw',
      message: 'Saving raw Discogs collection snapshot to storage.',
    })
    // Save the raw Discogs response data (with enhanced releases)
    await documentStore.setDocument(`${discogsCollectionPath}/last-response`, documentToSave)

    const transformedReleases = enhancedReleases.map(transformDiscogsRelease)

    const profileUsername = oauth?.discogsUsername ?? getDiscogsConfig().username ?? ''

    const updatedWidgetContent: DiscogsWidgetDocument = {
      collections: {
        releases: transformedReleases
      },
      metrics: {
        'LPs Owned': pagination.items
      },
      profile: {
        profileURL: `https://www.discogs.com/user/${profileUsername}/collection`
      },
      meta: {
        synced: toStoredDateTime(),
      }
    }

    let aiSummary: string | null = null
    if (transformedReleases.length > 0) {
      try {
        onProgress?.({
          phase: 'discogs.ai',
          message: 'Generating Discogs collection summary (AI).',
        })
        const summaryInput = buildDiscogsSummaryInput(
          transformedReleases,
          pagination.items,
          updatedWidgetContent.profile?.profileURL,
        )
        const hasTextSignal =
          summaryInput.recentReleases.length > 0 ||
          Object.keys(summaryInput.genreCounts).length > 0 ||
          Object.keys(summaryInput.styleCounts).length > 0 ||
          Object.keys(summaryInput.decadeCounts).length > 0
        if (hasTextSignal) {
          aiSummary = await generateDiscogsSummary(summaryInput)
          updatedWidgetContent.aiSummary = aiSummary
        }
      } catch (error: unknown) {
        logger.error('Failed to generate Discogs AI summary.', error)
      }
    }

    onProgress?.({
      phase: 'discogs.save_widget',
      message: 'Saving Discogs widget document.',
    })
    const saveWidgetContent = async () =>
      await documentStore.setDocument(`${discogsCollectionPath}/widget-content`, updatedWidgetContent)

    const saveAISummary = async () => {
      if (aiSummary) {
        await documentStore.setDocument(`${discogsCollectionPath}/last-response_ai-summary`, {
          generatedAt: toStoredDateTime(),
          summary: aiSummary,
        })
      }
    }

    await saveWidgetContent()
    await saveAISummary()

    const titleByReleaseId = new Map<string, string>()
    for (const raw of enhancedReleases) {
      const rid = raw.id != null ? String(raw.id) : ''
      if (!rid) continue
      const t = raw.basic_information?.title
      titleByReleaseId.set(
        rid,
        typeof t === 'string' && t.trim().length > 0 ? t.trim() : `Release ${rid}`,
      )
    }

    const mediaToDownloadTyped: DiscogsMediaDownloadTask[] = mediaToDownload
    if (!mediaToDownloadTyped.length) {
      return {
        data: updatedWidgetContent,
        discogsAuthMode,
        ok: true,
        result: 'SUCCESS',
        totalUploadedCount: 0,
      }
    }

    let result: { fileName?: string }[]
    try {
      result = await pMap(
        mediaToDownloadTyped,
        async (item) => {
          const releaseKey = String(item.id).replace(/_thumb$|_cover$/, '')
          const album = truncateLabel(titleByReleaseId.get(releaseKey) ?? `release ${releaseKey}`)
          const isThumb = String(item.id).endsWith('_thumb')
          onProgress?.({
            phase: 'discogs.artwork',
            message: isThumb
              ? `Downloading vinyl thumbnail for “${album}”.`
              : `Downloading vinyl cover image for “${album}”.`,
          })
          return storeRemoteMedia(item)
        },
        {
          concurrency: 10,
          stopOnError: false,
        }
      )
    } catch (error) {
      logger.error('Something went wrong downloading media files', error)
      result = []
    }

    logger.info('Discogs sync finished successfully.', {
      mediaStore: describeMediaStore(),
      totalUploadedCount: result.length,
      uploadedFiles: result.map(({ fileName }) => fileName),
    })

    return {
      data: updatedWidgetContent,
      discogsAuthMode,
      mediaStore: describeMediaStore(),
      result: 'SUCCESS',
      totalUploadedCount: result.length,
      uploadedFiles: result.map(({ fileName }) => fileName),
    }
  } catch (error: unknown) {
    logger.error('Failed to sync Discogs data.', error)
    return {
      result: 'FAILURE',
      error: error instanceof Error ? error.message : error,
    }
  }
}

export default syncDiscogsData 
