import type { DocumentStore } from '../ports/document-store.js'
import type {
  WidgetContentById,
  WidgetContentUnion,
  WidgetId,
} from '../types/widget-content.js'
import { isWidgetId, widgetIds } from '../types/widget-content.js'
import getDiscogsWidgetContent from './get-discogs-widget-content.js'
import getFlickrWidgetContent from './get-flickr-widget-content.js'
import getGitHubWidgetContent, { type GitHubWidgetAuthMode } from './get-github-widget-content.js'
import getGoodreadsWidgetContent from './get-goodreads-widget-content.js'
import getInstagramWidgetContent from './get-instagram-widget-content.js'
import getSpotifyWidgetContent from './get-spotify-widget-content.js'
import getSteamWidgetContent from './get-steam-widget-content.js'

type InjectedWidgetHandler<TWidgetId extends WidgetId> = (
  documentStore: DocumentStore,
  userId: string,
) => Promise<WidgetContentById[TWidgetId]>

export type GetWidgetContentOptions = {
  /**
   * Firebase Auth uid for per-user integration OAuth (GitHub App tokens live under
   * `users/{uid}/integrations/github`). Hostname `userId` still selects env PAT fallback and is unchanged for other widgets.
   */
  integrationLookupUserId?: string
}

const widgetHandlerRegistry: {
  [TWidgetId in Exclude<WidgetId, 'github'>]: InjectedWidgetHandler<TWidgetId>
} = {
  discogs: getDiscogsWidgetContent,
  flickr: getFlickrWidgetContent,
  goodreads: getGoodreadsWidgetContent,
  instagram: getInstagramWidgetContent,
  spotify: getSpotifyWidgetContent,
  steam: getSteamWidgetContent,
}

export const validWidgetIds = widgetIds

export type WidgetFetchResult = {
  payload: WidgetContentUnion
  meta?: {
    githubAuthMode?: GitHubWidgetAuthMode
  }
}

export const getWidgetContent = async (
  widgetId: WidgetId,
  userId: string,
  documentStore: DocumentStore,
  options?: GetWidgetContentOptions
): Promise<WidgetFetchResult> => {
  if (!isWidgetId(widgetId)) {
    throw new Error(`Unrecognized widget type: ${widgetId}`)
  }

  if (widgetId === 'github') {
    const { payload, authMode } = await getGitHubWidgetContent(
      userId,
      documentStore,
      options?.integrationLookupUserId
    )
    return { payload, meta: { githubAuthMode: authMode } }
  }

  const payload = await widgetHandlerRegistry[widgetId](documentStore, userId)
  return { payload }
}
