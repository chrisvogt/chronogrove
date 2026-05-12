import type { WidgetMetricValue } from './widget-content.js'

/** Payload for Spotify “AI listening summary” (subset of persisted widget data). */
export interface SpotifySummaryInput {
  metrics: WidgetMetricValue[]
  playlists: {
    description?: string
    name: string
    public?: boolean
    trackCount?: number
  }[]
  profile: {
    displayName?: string
    followersCount?: number
    id?: string
    profileURL?: string
  }
  topTracks: {
    artists: string[]
    name: string
  }[]
}
