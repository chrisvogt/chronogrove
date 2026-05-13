/**
 * Instagram Graph API fragments used in sync, media download, and widget transforms.
 */

export interface InstagramGraphChild {
  id: string
  alt_text?: string
  media_url?: string
  thumbnail_url?: string
}

export interface InstagramGraphMediaItem {
  id: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  alt_text?: string
  caption?: string
  comments_count?: number
  like_count?: number
  permalink?: string
  shortcode?: string
  timestamp?: string
  username?: string
  children?: { data?: InstagramGraphChild[] }
}

/** Graph `/{user-id}/media` list payload (merged under `media` on our API wrapper). */
export interface InstagramMediaListResponse {
  data?: InstagramGraphMediaItem[]
  paging?: { cursors?: { after?: string; before?: string }; next?: string; previous?: string }
}

/** Combined profile + media list from `fetchInstagramData`. */
export interface InstagramApiResponse {
  id?: string
  user_id?: string
  username?: string
  account_type?: string
  profile_picture_url?: string
  followers_count?: number
  follows_count?: number
  media_count?: number
  media?: InstagramMediaListResponse
}

/** Queued download row for Instagram sync (mirrors Discogs media tasks). */
export interface InstagramMediaDownloadItem {
  destinationPath: string
  id: string
  mediaURL: string
}

/** Output of `transformInstagramMedia` for widget documents. */
export interface InstagramTransformedMedia {
  altText?: string
  caption?: string
  cdnMediaURL?: string
  children?: Array<
    InstagramGraphChild & {
      cdnMediaURL?: string
    }
  >
  commentsCounts?: number
  id: string
  likeCount?: number
  mediaType?: string
  mediaURL?: string
  permalink?: string
  shortcode?: string
  thumbnailURL?: string
  timestamp?: string
  username?: string
}
