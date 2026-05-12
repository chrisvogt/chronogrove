import type { DocumentStore } from '../ports/document-store.js'
import { getDefaultWidgetUserId } from '../config/backend-paths.js'
import type {
  SpotifyWidgetContent,
  SpotifyWidgetDocument,
} from '../types/widget-content.js'
import { toDateOrDefault, toUserWidgetContentPath } from './widget-document-store.js'

const getSpotifyWidgetContent = async (
  documentStore: DocumentStore,
  userId: string = getDefaultWidgetUserId(),
): Promise<SpotifyWidgetContent> => {
  const spotifyWidgetContentPath = toUserWidgetContentPath(userId, 'spotify')
  const data =
    await documentStore.getDocument<SpotifyWidgetDocument>(spotifyWidgetContentPath)

  if (!data) {
    throw new Error('No Spotify data found in DocumentStore')
  }

  const { meta = {}, ...responseData } = data

  return {
    ...responseData,
    meta: {
      ...meta,
      synced: toDateOrDefault(meta.synced),
    },
  }
}

export default getSpotifyWidgetContent
