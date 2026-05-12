import type { DocumentStore } from '../ports/document-store.js'
import { getDefaultWidgetUserId } from '../config/backend-paths.js'
import type {
  DiscogsWidgetContent,
  DiscogsWidgetDocument,
} from '../types/widget-content.js'
import { toDateOrDefault, toUserWidgetContentPath } from './widget-document-store.js'

const getDiscogsWidgetContent = async (
  documentStore: DocumentStore,
  userId: string = getDefaultWidgetUserId(),
): Promise<DiscogsWidgetContent> => {
  const discogsWidgetContentPath = toUserWidgetContentPath(userId, 'discogs')
  const data =
    await documentStore.getDocument<DiscogsWidgetDocument>(discogsWidgetContentPath)

  if (!data) {
    return {
      meta: {},
    }
  }

  const { meta = {}, ...responseData } = data

  return {
    ...responseData,
    meta: meta.synced ? { synced: toDateOrDefault(meta.synced) } : {},
  }
}

export default getDiscogsWidgetContent
