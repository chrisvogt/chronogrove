import type {
  GoogleBooksVolumeSubset,
} from './google-books.js'

export type GoodreadsNilObject = { nil?: string; _: string | undefined }

export type GoodreadsPossiblyNilString = string | GoodreadsNilObject | null | undefined

export interface GoodreadsActor {
  imageURL?: string
  link?: string
  name?: string
}

export interface GoodreadsAuthorSummary {
  averageRating?: string
  goodreadsID?: string
  imageURL?: string
  hasImageURL?: boolean
  smallImageURL?: string
  hasSmallImageURL?: boolean
  ratingsCount?: string
  textReviewCount?: string
  // Some upstream Goodreads XML shapes also include these fields (used by the sync fallback search).
  name?: string
  displayName?: string
  sortName?: string
}

export interface GoodreadsReviewBook {
  author?: GoodreadsAuthorSummary
  goodreadsID?: string
  link?: string
  title?: string
  isbn?: GoodreadsPossiblyNilString
  isbn13?: GoodreadsPossiblyNilString
}

export interface GoodreadsUserStatusBook {
  author: {
    about?: string
    displayName?: string
    name?: string
    sortName?: string
  }
  format?: string
  goodreadsID?: string
  isbn?: GoodreadsPossiblyNilString
  isbn13?: GoodreadsPossiblyNilString
  pageCount?: number
  publicationYear?: number
  publisher?: string
  sortTitle?: string
  title?: string
}

export interface GoodreadsReviewUpdate {
  actionText?: string
  actor?: GoodreadsActor
  book?: GoodreadsReviewBook
  link?: string
  rating?: number
  type: string
  updated?: string
}

export interface GoodreadsUserStatusUpdate {
  actionText?: string
  book?: GoodreadsUserStatusBook
  created?: string
  imageURL?: string
  link?: string
  page?: number
  percent?: number
  type: string
  updated?: string
  userID?: string
}

export type GoodreadsUpdate = GoodreadsReviewUpdate | GoodreadsUserStatusUpdate

export interface GoodreadsProfile {
  name?: string
  username?: string
  link?: string
  imageURL?: string
  smallImageURL?: string
  website?: string
  joined?: string
  interests?: string
  favoriteBooks?: string
  friendsCount?: string
  readCount: number
  profileURL?: string
}

export interface GoodreadsRecentlyReadBookFromGoogle {
  book: GoogleBooksVolumeSubset
  rating?: string | null
  goodreadsDescription?: string
  isbn?: string | null
  /** Goodreads `read_at` text from the read shelf review list (for ordering). */
  readAt?: string | null
}

export interface GoodreadsRecentlyReadBook {
  authors?: string[]
  categories: string[]
  cdnMediaURL: string
  mediaDestinationPath: string
  description?: string
  id: string
  infoLink: string
  isbn?: string | null
  pageCount?: number
  previewLink?: string
  rating?: string | null
  /** Goodreads `read_at` from the shelf review; used for most-recent-first ordering. */
  readAt?: string
  smallThumbnail: string
  subtitle?: string
  thumbnail: string
  title?: string
}

export interface GoodreadsReviewListRawReview {
  read_at?: unknown
  book?: unknown
  rating?: unknown
  [key: string]: unknown
}

export interface GoodreadsReviewListBookSource {
  isbn: string
  rating: string
  /** Goodreads `read_at` for this review (required for rows we keep). */
  readAt: string
  goodreadsDescription?: string
  title?: string
  authorName?: string
}

export interface GoodreadsWidgetCollections {
  recentlyReadBooks?: GoodreadsRecentlyReadBook[]
  updates?: GoodreadsUpdate[] | null
}

/**
 * Minimal book row from Goodreads XML only (no Google Books enrichment).
 * Used as context for the Goodreads AI summary across the full read shelf.
 */
export interface GoodreadsAiReadShelfEntry {
  authors: string[]
  /** When present, preferred finish/read date from Goodreads; else date added to shelf */
  finishedOrAddedDate?: string | null
  isbn?: string | null
  rating?: string | null
  title?: string
}

