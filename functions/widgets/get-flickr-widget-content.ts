import type { DocumentStore } from '../ports/document-store.js'
import { getDefaultWidgetUserId } from '../config/backend-paths.js'
import { getLogger } from '../services/logger.js'
import type {
  FlickrWidgetContent,
  FlickrWidgetDocument,
} from '../types/widget-content.js'
import { toDateOrDefault, toUserWidgetContentPath } from './widget-document-store.js'

const getFlickrWidgetContent = async (
  documentStore: DocumentStore,
  userId: string = getDefaultWidgetUserId(),
): Promise<FlickrWidgetContent> => {
  const logger = getLogger()
  try {
    const flickrWidgetContentPath = toUserWidgetContentPath(userId, 'flickr')
    const widgetContent =
      await documentStore.getDocument<FlickrWidgetDocument>(flickrWidgetContentPath)

    if (!widgetContent) {
      throw new Error('No Flickr data found in DocumentStore')
    }

    const meta = widgetContent.meta as Record<string, unknown> | null | undefined
    if (meta != null && typeof meta === 'object' && meta.synced != null) {
      return {
        ...widgetContent,
        meta: {
          ...meta,
          synced: toDateOrDefault(meta.synced),
        },
      } as typeof widgetContent
    }

    return widgetContent
  } catch (error) {
    logger.error('Error getting Flickr widget content:', error)
    throw error
  }
}

export default getFlickrWidgetContent
