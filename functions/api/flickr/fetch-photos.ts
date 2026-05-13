import { logger } from 'firebase-functions'
import got from 'got'

import { getFlickrConfig } from '../../config/backend-config.js'
import type { FlickrPhoto, FlickrPhotosResponse } from '../../types/flickr.js'
import type { ResolvedFlickrApiAuth } from '../../services/flickr-integration-credentials.js'
import {
  FLICKR_HTTP_TIMEOUT_MS,
  flickrSignQuery,
  sortedQueryFromParams,
} from '../../services/flickr-oauth1a.js'

const FLICKR_API_BASE_URL = 'https://www.flickr.com/services/rest'

export interface FetchPhotosOptions {
  oauth?: ResolvedFlickrApiAuth
}

/**
 * Fetch recent photos from Flickr (unsigned API key or OAuth 1.0a).
 * @see {@link https://www.flickr.com/services/api/flickr.people.getPhotos.html}
 */
const fetchPhotos = async (options: FetchPhotosOptions = {}): Promise<FlickrPhotosResponse> => {
  const { oauth } = options

  if (oauth) {
    return fetchPhotosOAuth(oauth)
  }

  const { apiKey, userId } = getFlickrConfig()

  if (!apiKey || !userId) {
    throw new Error('Missing required Flickr configuration (FLICKR_API_KEY or FLICKR_USER_ID)')
  }

  try {
    const { body } = await got(FLICKR_API_BASE_URL, {
      responseType: 'json',
      timeout: { request: FLICKR_HTTP_TIMEOUT_MS },
      searchParams: {
        method: 'flickr.people.getPhotos',
        api_key: apiKey,
        user_id: userId,
        format: 'json',
        nojsoncallback: 1,
        per_page: 12,
        extras: 'date_taken,description,owner_name,url_q,url_m,url_l',
        privacy_filter: 1,
      },
    })

    return normalizePhotosResponse(body, userId)
  } catch (error) {
    logger.error('Error fetching Flickr photos:', error)
    throw error
  }
}

async function fetchPhotosOAuth(auth: ResolvedFlickrApiAuth): Promise<FlickrPhotosResponse> {
  const { consumerKey, consumerSecret, userNsid, oauthToken, oauthTokenSecret } = auth
  const baseParams: Record<string, string> = {
    method: 'flickr.people.getPhotos',
    format: 'json',
    nojsoncallback: '1',
    user_id: userNsid,
    per_page: '12',
    extras: 'date_taken,description,owner_name,url_q,url_m,url_l',
    privacy_filter: '1',
    oauth_consumer_key: consumerKey,
    oauth_token: oauthToken,
  }

  const signed = flickrSignQuery(
    'GET',
    FLICKR_API_BASE_URL,
    baseParams,
    consumerSecret,
    oauthTokenSecret
  )
  const qs = sortedQueryFromParams(signed)

  try {
    const { body } = await got(`${FLICKR_API_BASE_URL}?${qs}`, {
      responseType: 'json',
      timeout: { request: FLICKR_HTTP_TIMEOUT_MS },
    })
    return normalizePhotosResponse(body, userNsid)
  } catch (error) {
    logger.error('Error fetching Flickr photos (OAuth):', error)
    throw error
  }
}

function flickrFieldString(value: unknown): string | undefined {
  if (value == null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return undefined
}

function normalizePhotosResponse(
  body: unknown,
  canonicalUserId: string
): FlickrPhotosResponse {
  const res = body as {
    photos?: { photo?: Record<string, unknown>[]; total?: number; page?: number; pages?: number }
    stat?: string
    message?: string
  }
  if (res?.stat === 'fail') {
    throw new Error(`Flickr API error: ${res.message ?? 'unknown'}`)
  }
  if (!res?.photos?.photo) {
    throw new Error('Invalid response from Flickr API')
  }

  const photos: FlickrPhoto[] = res.photos.photo.map((photo) => {
    const desc = photo.description as { _content?: string } | undefined
    const idStr = flickrFieldString(photo.id)
    return {
      id: idStr,
      title: flickrFieldString(photo.title),
      description: desc?._content ?? '',
      dateTaken: flickrFieldString(photo.datetaken),
      ownerName: flickrFieldString(photo.ownername),
      thumbnailUrl: flickrFieldString(photo.url_q),
      mediumUrl: flickrFieldString(photo.url_m),
      largeUrl: flickrFieldString(photo.url_l),
      link: `https://www.flickr.com/photos/${canonicalUserId}/${idStr ?? ''}`,
    }
  })

  return {
    photos,
    total: res.photos.total,
    page: res.photos.page,
    pages: res.photos.pages,
  }
}

export default fetchPhotos
