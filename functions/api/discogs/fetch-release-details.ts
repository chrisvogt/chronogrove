import { logger } from 'firebase-functions'

import { getDiscogsConfig } from '../../config/backend-config.js'
import { chronogroveHttpUserAgent } from '../../config/chronogrove-http-user-agent.js'
import type { ResolvedDiscogsApiAuth } from '../../services/discogs-integration-credentials.js'
import { discogsOAuthGotGet } from '../../services/discogs-oauth1a.js'

function buildReleaseFetchUrl(
  resourceUrl: string,
  apiKey: string | undefined,
  oauth?: ResolvedDiscogsApiAuth
): string {
  if (oauth || resourceUrl.includes('token=')) {
    return resourceUrl
  }
  if (!apiKey) {
    throw new Error('Missing required environment variable: DISCOGS_API_KEY')
  }
  const separator = resourceUrl.includes('?') ? '&' : '?'
  return `${resourceUrl}${separator}token=${apiKey}`
}

type FetchAttemptResult =
  | { outcome: 'success'; data: unknown }
  | { outcome: 'failed' }
  | { outcome: 'rate_limited'; waitMs: number }

async function fetchReleaseOnce(
  oauth: ResolvedDiscogsApiAuth | undefined,
  resourceUrl: string,
  urlWithAuth: string,
  releaseId: string,
  attempt: number,
  maxRetries: number
): Promise<FetchAttemptResult> {
  if (oauth) {
    const { body } = await discogsOAuthGotGet(resourceUrl, {
      consumerKey: oauth.consumerKey,
      consumerSecret: oauth.consumerSecret,
      oauthToken: oauth.oauthToken,
      oauthTokenSecret: oauth.oauthTokenSecret,
    })
    const resourceData = JSON.parse(body)
    logger.debug(`Successfully fetched release resource for ${releaseId}`)
    return { outcome: 'success', data: resourceData }
  }

  const response = await fetch(urlWithAuth, {
    headers: {
      'User-Agent': chronogroveHttpUserAgent,
    },
  })

  if (response.status === 429) {
    const waitTime = Math.pow(2, attempt) * 3000
    logger.warn(`Rate limited for release ${releaseId}, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`)

    if (attempt < maxRetries) {
      return { outcome: 'rate_limited', waitMs: waitTime }
    }

    logger.error(`Max retries reached for release ${releaseId} due to rate limiting`)
    return { outcome: 'failed' }
  }

  if (!response.ok) {
    logger.warn(`Failed to fetch release resource for ${releaseId}: ${response.status} ${response.statusText}`)
    return { outcome: 'failed' }
  }

  const resourceData = await response.json()
  logger.debug(`Successfully fetched release resource for ${releaseId}`)

  return { outcome: 'success', data: resourceData }
}

/**
 * Fetches detailed release resource data from Discogs API with retry logic
 * @param resourceUrl - The resource_url to fetch
 * @param releaseId - The release ID for logging purposes
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param oauth - Optional OAuth 1.0a signing (otherwise uses DISCOGS_API_KEY token query param)
 */
const fetchReleaseDetails = async (
  resourceUrl: string,
  releaseId: string,
  maxRetries = 3,
  oauth?: ResolvedDiscogsApiAuth
) => {
  const { apiKey } = getDiscogsConfig()

  if (!oauth && !apiKey) {
    throw new Error('Missing required environment variable: DISCOGS_API_KEY')
  }

  const urlWithAuth = buildReleaseFetchUrl(resourceUrl, apiKey, oauth)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(
        `Fetching release resource for ${releaseId} (attempt ${attempt}/${maxRetries})${oauth ? ' (OAuth)' : ''}`
      )

      const result = await fetchReleaseOnce(oauth, resourceUrl, urlWithAuth, releaseId, attempt, maxRetries)

      if (result.outcome === 'success') {
        return result.data
      }

      if (result.outcome === 'rate_limited') {
        await new Promise((resolve) => setTimeout(resolve, result.waitMs))
        continue
      }

      return null
    } catch (error) {
      logger.error(`Error fetching release resource for ${releaseId} (attempt ${attempt}/${maxRetries}):`, error)

      if (attempt === maxRetries) {
        return null
      }

      const waitTime = Math.pow(2, attempt) * 1000
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }

  return null
}

export default fetchReleaseDetails
