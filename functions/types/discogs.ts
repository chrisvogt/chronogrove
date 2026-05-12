/**
 * Discogs collection + enhanced release shapes used in sync and widget transforms.
 */

/** Nested `basic_information` on a collection release item. */
export interface DiscogsBasicInformation {
  id?: number
  master_id?: number
  master_url?: string
  resource_url?: string
  thumb?: string
  cover_image?: string
  title?: string
  year?: number
  formats?: unknown[]
  labels?: unknown[]
  artists?: unknown[]
  genres?: unknown[]
  styles?: unknown[]
}

/**
 * Filtered release resource attached after batch fetch (subset of Discogs release JSON).
 * Kept loose at the leaf level; the sync path only needs presence + logging.
 */
export type DiscogsFilteredResource = Record<string, unknown>

/** One release row from the user collection folder API, before resource enrichment. */
export interface DiscogsCollectionReleaseItem {
  id: number
  instance_id?: number
  date_added?: string
  rating?: number
  folder_id?: number
  notes?: unknown[]
  basic_information?: DiscogsBasicInformation
}

/** Collection item after optional `resource` merge from `fetchReleasesBatch`. */
export interface DiscogsEnhancedRelease extends DiscogsCollectionReleaseItem {
  resource?: DiscogsFilteredResource | null
}

export interface DiscogsPagination {
  page: number
  pages: number
  per_page: number
  items: number
  urls?: Record<string, unknown>
}

/** Result shape from `fetchDiscogsReleases` (aggregated pages). */
export interface DiscogsCollectionResponse {
  pagination: DiscogsPagination
  releases: DiscogsCollectionReleaseItem[]
}

/** Output of `transformDiscogsRelease` for widget `collections.releases`. */
export interface DiscogsTransformedRelease {
  id: number
  instanceId?: number
  dateAdded?: string
  rating?: number
  folderId?: number
  notes?: unknown[]
  basicInformation: {
    id?: number
    masterId?: number
    masterUrl?: string
    resourceUrl?: string
    thumb?: string
    coverImage?: string
    cdnThumbUrl?: string | null
    cdnCoverUrl?: string | null
    title?: string
    year?: number
    formats?: unknown[]
    labels?: unknown[]
    artists?: unknown[]
    genres?: unknown[]
    styles?: unknown[]
  }
  resource?: DiscogsFilteredResource | null
}

/** Item queued for media download in Discogs sync. */
export interface DiscogsMediaDownloadTask {
  destinationPath: string
  id: string
  mediaURL: string
}

/** One release row compacted for the Discogs AI summary prompt. */
export interface DiscogsSummaryCompactRelease {
  artists: string[]
  dateAdded?: string
  formats: string[]
  genres: string[]
  styles: string[]
  title?: string
  year?: number
}

/** Payload for Discogs “AI collection summary”. */
export interface DiscogsSummaryInput {
  collectionTotal: number
  decadeCounts: Record<string, number>
  genreCounts: Record<string, number>
  profileURL?: string
  recentReleases: DiscogsSummaryCompactRelease[]
  styleCounts: Record<string, number>
}
