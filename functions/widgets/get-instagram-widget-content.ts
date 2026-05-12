import type { DocumentStore } from '../ports/document-store.js'
import { getDefaultWidgetUserId } from '../config/backend-paths.js'
import type {
  InstagramWidgetContent,
  InstagramWidgetDocument,
} from '../types/widget-content.js'
import { toDateOrDefault, toUserWidgetContentPath } from './widget-document-store.js'

const getInstagramWidgetContent = async (
  documentStore: DocumentStore,
  userId: string = getDefaultWidgetUserId(),
): Promise<InstagramWidgetContent> => {
  const instagramWidgetContentPath = toUserWidgetContentPath(userId, 'instagram')
  const data =
    await documentStore.getDocument<InstagramWidgetDocument>(instagramWidgetContentPath)

  if (!data) {
    throw new Error('Failed to get a response.')
  }

  const {
    meta = {},
    media,
    profile: {
      biography = '',
      followersCount = 0,
      followsCount = 0,
      mediaCount = 0,
      username = '',
    } = {},
  } = data

  return {
    collections: {
      media,
    },
    meta: {
      synced: toDateOrDefault(meta.synced),
    },
    metrics: [
      {
        displayName: 'Followers',
        id: 'followers-count',
        value: followersCount,
      },
      {
        displayName: 'Following',
        id: 'follows-count',
        value: followsCount,
      },
      {
        displayName: 'Posts',
        id: 'media-count',
        value: mediaCount,
      },
    ],
    provider: {
      displayName: 'Instagram',
      id: 'instagram',
    },
    profile: {
      biography,
      displayName: username,
      profileURL: `https://www.instagram.com/${username}`,
    },
  }
}

export default getInstagramWidgetContent
