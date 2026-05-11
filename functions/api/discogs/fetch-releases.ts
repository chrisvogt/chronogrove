import { logger } from 'firebase-functions'

import { getDiscogsConfig } from '../../config/backend-config.js'
import { chronogroveHttpUserAgent } from '../../config/chronogrove-http-user-agent.js'
import type { ResolvedDiscogsApiAuth } from '../../services/discogs-integration-credentials.js'
import { discogsOAuthGotGet } from '../../services/discogs-oauth1a.js'
import type { DiscogsCollectionReleaseItem, DiscogsCollectionResponse } from '../../types/discogs.js'

export interface FetchDiscogsReleasesOptions {
  oauth?: ResolvedDiscogsApiAuth
}

const fetchDiscogsReleases = async (
  options: FetchDiscogsReleasesOptions = {}
): Promise<DiscogsCollectionResponse> => {
  const { oauth } = options

  if (oauth) {
    return fetchDiscogsReleasesOAuth(oauth)
  }

  const { apiKey, username } = getDiscogsConfig()

  if (!apiKey || !username) {
    throw new Error('Missing required environment variables: DISCOGS_API_KEY or DISCOGS_USERNAME')
  }

  try {
    let allReleases: DiscogsCollectionReleaseItem[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const url = `https://api.discogs.com/users/${username}/collection/folders/0/releases?token=${apiKey}&page=${page}&per_page=50`

      logger.info(`Fetching Discogs releases page ${page}`)

      const response = await fetch(url, {
        headers: {
          'User-Agent': chronogroveHttpUserAgent,
        },
      })

      if (!response.ok) {
        throw new Error(`Discogs API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as {
        releases: DiscogsCollectionReleaseItem[]
        pagination: { page: number; pages: number }
      }

      allReleases = allReleases.concat(data.releases)

      hasMore = data.pagination.page < data.pagination.pages
      page++
    }

    return {
      pagination: {
        page: 1,
        pages: 1,
        per_page: allReleases.length,
        items: allReleases.length,
        urls: {},
      },
      releases: allReleases,
    }
  } catch (error) {
    logger.error('Failed to fetch Discogs releases', error)
    throw error
  }
}

async function fetchDiscogsReleasesOAuth(oauth: ResolvedDiscogsApiAuth): Promise<DiscogsCollectionResponse> {
  const { discogsUsername, consumerKey, consumerSecret, oauthToken, oauthTokenSecret } = oauth
  let allReleases: DiscogsCollectionReleaseItem[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `https://api.discogs.com/users/${encodeURIComponent(
      discogsUsername
    )}/collection/folders/0/releases?page=${page}&per_page=50`

    logger.info(`Fetching Discogs releases page ${page} (OAuth)`)

    const signing = { consumerKey, consumerSecret, oauthToken, oauthTokenSecret }
    const { body } = await discogsOAuthGotGet(url, signing)
    const data = JSON.parse(body) as {
      releases: DiscogsCollectionReleaseItem[]
      pagination: { page: number; pages: number }
    }

    allReleases = allReleases.concat(data.releases)

    hasMore = data.pagination.page < data.pagination.pages
    page++
  }

  return {
    pagination: {
      page: 1,
      pages: 1,
      per_page: allReleases.length,
      items: allReleases.length,
      urls: {},
    },
    releases: allReleases,
  }
}

export default fetchDiscogsReleases
