import got from 'got'

import type { SteamPlayerSummary, SteamPlayerSummaryResult } from '../../types/steam.js'

const ENDPOINT =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/'

const getPlayerSummary = async (
  apiKey: string,
  userId: string,
): Promise<SteamPlayerSummaryResult> => {
  const { body } = await got(ENDPOINT, {
    responseType: 'json',
    searchParams: {
      key: apiKey,
      steamids: userId,
    },
  })
  if (body == null || typeof body !== 'object') {
    throw new Error('Invalid response')
  }
  const response = (body as { response?: { players?: SteamPlayerSummary[] } })?.response
  const players = response?.players ?? []
  const player = players[0]
  return player ?? []
}

export default getPlayerSummary
