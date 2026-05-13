import type { DocumentStore } from '../ports/document-store.js'
import { getDefaultWidgetUserId } from '../config/backend-paths.js'
import type {
  GoodreadsWidgetContent,
  GoodreadsWidgetDocument,
} from '../types/widget-content.js'
import { toDateOrDefault, toUserWidgetContentPath } from './widget-document-store.js'

const getGoodreadsWidgetContent = async (
  documentStore: DocumentStore,
  userId: string = getDefaultWidgetUserId(),
): Promise<GoodreadsWidgetContent> => {
  const goodreadsWidgetContentPath = toUserWidgetContentPath(userId, 'goodreads')
  const data =
    await documentStore.getDocument<GoodreadsWidgetDocument>(goodreadsWidgetContentPath)

  if (!data) {
    return {
      meta: { synced: new Date(0) },
      recentBooks: [],
      summary: null,
    }
  }

  const { meta = {}, ...responseData } = data

  const transformedMeta = {
    ...meta,
    synced: toDateOrDefault(meta.synced),
  }

  return {
    ...responseData,
    meta: transformedMeta,
  }
}

export default getGoodreadsWidgetContent
