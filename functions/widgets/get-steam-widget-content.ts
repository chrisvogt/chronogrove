import type { DocumentStore } from '../ports/document-store.js'
import { getDefaultWidgetUserId } from '../config/backend-paths.js'
import type {
  SteamWidgetContent,
  SteamWidgetDocument,
} from '../types/widget-content.js'
import { toDateOrDefault, toUserWidgetContentPath } from './widget-document-store.js'

const getSteamWidgetContent = async (
  documentStore: DocumentStore,
  userId: string = getDefaultWidgetUserId(),
): Promise<SteamWidgetContent> => {
  const steamWidgetContentPath = toUserWidgetContentPath(userId, 'steam')
  const data = await documentStore.getDocument<SteamWidgetDocument>(steamWidgetContentPath)

  if (!data) {
    return { meta: { synced: new Date(0) } }
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

export default getSteamWidgetContent
