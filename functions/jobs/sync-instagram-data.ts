import pMap from 'p-map'
import type { DocumentStore } from '../ports/document-store.js'
import {
  describeMediaStore,
  listStoredMedia,
  storeRemoteMedia,
} from '../services/media/media-service.js'

import fetchInstagramData from '../api/instagram/fetch-instagram-data.js'
import { getLogger } from '../services/logger.js'
import toIGDestinationPath from '../transformers/to-ig-destination-path.js'
import transformInstagramMedia from '../transformers/transform-instagram-media.js'
import { toStoredDateTime } from '../utils/time.js'
import { getDefaultWidgetUserId, toProviderCollectionPath } from '../config/backend-paths.js'
import type {
  InstagramApiResponse,
  InstagramGraphChild,
  InstagramGraphMediaItem,
  InstagramMediaDownloadItem,
} from '../types/instagram.js'
import type { InstagramWidgetDocument } from '../types/widget-content.js'
import type { SyncJobExecutionOptions } from '../types/sync-pipeline.js'

/*

Sync Instagram Data

The goal of this job is to store recent media data and artwork from an Instagram
feed into GCP Storage and Firebase.

* concurrent

- [x] Fetch all Instagram posts.
- [x] Fetch all saved media.

* sync

- [x] Store the raw Instagram response data.
- [ ] Store the transformed Instagram media.
  - [x] Filter out all except IMAGE and CAROUSEL posts.
- [x] Download each media file.
  - [x] Only download NEW media files
- [x] Upload each media file
- [ ] -Delete all unrecognized files (format: `${id}.jpg`) from GCP.- (do this in another job)

* notes

Valid media URL path beginnings:

- https://video.cdninstagram.com
- https://scontent.cdninstagram.com

*/

const validMediaTypes = ['CAROUSEL_ALBUM', 'IMAGE', 'VIDEO']

// Reducer to handle media filtering and transformation
const getMediaReducer = (storedMediaFileNames: string[] = []) =>
  (acc: InstagramMediaDownloadItem[], mediaItem: InstagramGraphMediaItem) => {
    const { id, media_type: mediaType, media_url: mediaURL, thumbnail_url: thumbnailURL, children } = mediaItem
    const resolvedUrl = thumbnailURL || mediaURL
    const destinationPath = resolvedUrl ? toIGDestinationPath(resolvedUrl, id) : ''
    const isAlreadyDownloaded = resolvedUrl
      ? storedMediaFileNames.includes(destinationPath)
      : true
    const isValidMediaType =
      mediaType != null && validMediaTypes.includes(mediaType)

    if (isValidMediaType && !isAlreadyDownloaded && resolvedUrl) {
      // Push the main media item
      acc.push({
        destinationPath,
        id,
        mediaURL: resolvedUrl,
      })
    }

    // If the media item has children, process them recursively
    if (mediaType === 'CAROUSEL_ALBUM' && children?.data) {
      const childMedia = children.data.map((child: InstagramGraphChild) => {
        const childUrl = child.thumbnail_url || child.media_url
        if (!childUrl) {
          return null
        }
        return {
          destinationPath: toIGDestinationPath(childUrl, child.id),
          id: child.id,
          mediaURL: childUrl,
        }
      }).filter((row): row is InstagramMediaDownloadItem => row != null)
      // Filter children for already downloaded media
      childMedia
        .filter(({ destinationPath }) => !storedMediaFileNames.includes(destinationPath))
        .forEach(validChild => acc.push(validChild))
    }

    return acc
  }

const syncInstagramData = async (
  documentStore: DocumentStore,
  { userId = getDefaultWidgetUserId(), onProgress }: SyncJobExecutionOptions = {}
) => {
  const logger = getLogger()
  try {
    const instagramCollectionPath = toProviderCollectionPath('instagram', userId)
    onProgress?.({
      phase: 'instagram.api',
      message: 'Fetching Instagram media.',
    })
    const instagramResponse: InstagramApiResponse = await fetchInstagramData()

    const rawMedia: InstagramGraphMediaItem[] = instagramResponse.media?.data ?? []

    const storedMediaFileNames = await listStoredMedia()

    const mediaReducer = getMediaReducer(storedMediaFileNames)
    const mediaToDownload = rawMedia.reduce(
      (acc, mediaItem) => mediaReducer(acc, mediaItem),
      [] as InstagramMediaDownloadItem[],
    )

    onProgress?.({
      phase: 'instagram.persist',
      message: 'Reticulating splines.',
    })
    // Save the raw Instagram response data
    await documentStore.setDocument(`${instagramCollectionPath}/last-response`, {
      ...instagramResponse,
      fetchedAt: toStoredDateTime(),
    })

    const filteredMedia = rawMedia.filter((item) =>
      item.media_type != null && validMediaTypes.includes(item.media_type),
    )

    const updatedWidgetContent: InstagramWidgetDocument = {
      media: filteredMedia.map(transformInstagramMedia),
      meta: {
        synced: toStoredDateTime(),
      },
      profile: {
        followersCount: instagramResponse.followers_count,
        followsCount: instagramResponse.follows_count,
        mediaCount: instagramResponse.media_count,
        username: instagramResponse.username,
      },
    }

    // Save the widget content
    await documentStore.setDocument(`${instagramCollectionPath}/widget-content`, updatedWidgetContent)

    if (mediaToDownload.length === 0) {
      return {
        data: updatedWidgetContent,
        ok: true,
        result: 'SUCCESS',
        totalUploadedCount: 0,
      }
    }

    let result: { fileName?: string }[]
    try {
      onProgress?.({
        phase: 'instagram.media',
        message: 'Downloading Instagram images.',
      })
      result = await pMap(
        mediaToDownload,
        storeRemoteMedia,
        {
          concurrency: 10,
          stopOnError: false,
        }
      )
    } catch (error) {
      logger.error('Something went wrong downloading media files', error)
      result = []
    }

    logger.info('Instagram sync finished successfully.', {
      mediaStore: describeMediaStore(),
      totalUploadedCount: result.length,
      uploadedFiles: result.map(({ fileName }) => fileName),
    })

    return {
      mediaStore: describeMediaStore(),
      result: 'SUCCESS',
      totalUploadedCount: result.length,
      uploadedFiles: result.map(({ fileName }) => fileName),
      data: updatedWidgetContent,
    }
  } catch (error: unknown) {
    logger.error('Failed to sync Instagram data.', error)
    return {
      result: 'FAILURE',
      error: error instanceof Error ? error.message : error,
    }
  }
}

export default syncInstagramData
