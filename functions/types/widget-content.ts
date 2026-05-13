import type {
  GoodreadsProfile,
  GoodreadsRecentlyReadBook,
  GoodreadsWidgetCollections,
} from './goodreads.js'
import type { DiscogsTransformedRelease } from './discogs.js'
import type { FlickrPhoto } from './flickr.js'
import type { InstagramTransformedMedia } from './instagram.js'
import type { SteamWidgetCollections, SteamWidgetProfile } from './steam.js'

export const widgetIds = [
  'discogs',
  'github',
  'goodreads',
  'instagram',
  'spotify',
  'steam',
  'flickr',
] as const

export type WidgetId = (typeof widgetIds)[number]

export function isWidgetId(value: string): value is WidgetId {
  return (widgetIds as readonly string[]).includes(value)
}

export const syncableWidgetIds = [
  'discogs',
  'goodreads',
  'instagram',
  'spotify',
  'steam',
  'flickr',
] as const

export type SyncProviderId = (typeof syncableWidgetIds)[number]

export function isSyncProviderId(value: string): value is SyncProviderId {
  return (syncableWidgetIds as readonly string[]).includes(value)
}

export interface WidgetMeta<TSynced = unknown> {
  synced?: TSynced
}

export interface WidgetMetricValue {
  displayName: string
  id: string
  value: number | string
}

export interface DiscogsWidgetDocument {
  aiSummary?: string | null
  collections?: {
    releases?: DiscogsTransformedRelease[]
  }
  meta?: WidgetMeta
  metrics?: Record<string, number>
  profile?: {
    profileURL?: string
  }
}

export interface DiscogsWidgetContent
  extends Omit<DiscogsWidgetDocument, 'meta'> {
  meta: WidgetMeta<Date>
}

export interface FlickrWidgetDocument {
  collections?: {
    photos?: FlickrPhoto[]
  }
  meta?: WidgetMeta
  metrics?: WidgetMetricValue[]
  profile?: {
    displayName?: string
    profileURL?: string
  }
}

export type FlickrWidgetContent = FlickrWidgetDocument

export interface GitHubWidgetContent {
  [key: string]: unknown
}

export interface GoodreadsWidgetDocument {
  aiSummary?: string
  collections?: GoodreadsWidgetCollections
  meta?: WidgetMeta
  profile?: GoodreadsProfile
  recentBooks?: GoodreadsRecentlyReadBook[]
  summary?: string | null
}

export interface GoodreadsWidgetContent
  extends Omit<GoodreadsWidgetDocument, 'meta'> {
  meta: WidgetMeta<Date>
}

export interface InstagramWidgetDocument {
  media?: InstagramTransformedMedia[]
  meta?: WidgetMeta
  profile?: {
    biography?: string
    followersCount?: number
    followsCount?: number
    mediaCount?: number
    username?: string
  }
}

export interface InstagramWidgetContent {
  collections: {
    media?: InstagramTransformedMedia[]
  }
  meta: WidgetMeta<Date>
  metrics: WidgetMetricValue[]
  profile: {
    biography: string
    displayName: string
    profileURL: string
  }
  provider: {
    displayName: 'Instagram'
    id: 'instagram'
  }
}

export interface SpotifyWidgetDocument {
  aiSummary?: string | null
  collections?: {
    playlists?: unknown[]
    topTracks?: unknown[]
  }
  meta?: WidgetMeta & { totalUploadedMediaCount?: number }
  metrics?: WidgetMetricValue[]
  profile?: {
    avatarURL?: unknown
    displayName?: string
    followersCount?: number
    id?: string
    profileURL?: string
  }
}

export interface SpotifyWidgetContent
  extends Omit<SpotifyWidgetDocument, 'meta'> {
  meta: WidgetMeta<Date> & { totalUploadedMediaCount?: number }
}

export interface SteamWidgetDocument {
  aiSummary?: string | null
  collections?: SteamWidgetCollections
  meta?: WidgetMeta
  metrics?: WidgetMetricValue[]
  profile?: SteamWidgetProfile
}

export interface SteamWidgetContent extends Omit<SteamWidgetDocument, 'collections' | 'meta'> {
  collections?: SteamWidgetCollections
  meta: WidgetMeta<Date>
}

export type WidgetContentById = {
  discogs: DiscogsWidgetContent
  flickr: FlickrWidgetContent
  github: GitHubWidgetContent
  goodreads: GoodreadsWidgetContent
  instagram: InstagramWidgetContent
  spotify: SpotifyWidgetContent
  steam: SteamWidgetContent
}

export type WidgetContentUnion = WidgetContentById[WidgetId]
