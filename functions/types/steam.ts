/**
 * Steam Web API and internal widget shapes for sync + AI summary.
 */

/** Single game as returned by GetOwnedGames / GetRecentlyPlayedGames. */
export interface SteamApiGame {
  appid: number
  img_icon_url?: string
  name: string
  playtime_2weeks?: number
  playtime_forever?: number
}

/** Body.response for IPlayerService/GetOwnedGames. */
export interface SteamOwnedGamesResponse {
  game_count?: number
  games?: SteamApiGame[]
}

/** One player object from ISteamUser/GetPlayerSummaries. */
export interface SteamPlayerSummary {
  avatarfull?: string
  personaname?: string
  profileurl?: string
  steamid?: string
}

/** getPlayerSummary returns a player object or an empty array when missing (legacy shape). */
export type SteamPlayerSummaryResult = SteamPlayerSummary | []

export function isSteamPlayerSummary(
  value: SteamPlayerSummaryResult,
): value is SteamPlayerSummary {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface SteamGameImages {
  capsuleLarge: string
  capsuleSmall: string
  icon: string
  header: string
  heroCapsule: string
}

/** Normalized game row stored in widget `collections`. */
export interface SteamTransformedGame {
  displayName: string
  id: number
  images: SteamGameImages
  playTime2Weeks?: number
  playTimeForever?: number
}

export interface SteamWidgetCollections {
  ownedGames: SteamTransformedGame[]
  recentlyPlayedGames: SteamTransformedGame[]
}

export interface SteamWidgetProfile {
  avatarURL?: string
  displayName?: string
  profileURL?: string
}

/** Payload passed to the AI summary step for Steam (subset of persisted widget doc). */
export interface SteamSummaryInput {
  collections: SteamWidgetCollections
  metrics: { displayName: string; id: string; value: number | string }[]
  profile: SteamWidgetProfile
}
