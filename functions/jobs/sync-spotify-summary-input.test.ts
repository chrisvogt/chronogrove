import { describe, expect, it } from 'vitest'

import { toSpotifySummaryInput } from './sync-spotify-data.js'
import type { SpotifyWidgetDocument } from '../types/widget-content.js'

describe('toSpotifySummaryInput', () => {
  it('defaults metrics to an empty array and slices playlists to 50', () => {
    const longDesc = `x${'a'.repeat(250)}`
    const playlists = Array.from({ length: 52 }, (_, i) => ({
      description: i === 0 ? longDesc : undefined,
      name: `P${i}`,
      public: i % 2 === 0,
      tracks: { total: i },
    }))

    const doc = {
      collections: {
        playlists,
        topTracks: [
          { artists: ['A'], name: 'One' },
          { artists: 'bad' as unknown as string[], name: 'Two' },
          { name: '' },
        ],
      },
      metrics: undefined,
      profile: {
        displayName: 'Me',
        followersCount: 1,
        id: 12345,
        profileURL: 'https://open.spotify.com/user/me',
      },
    } as SpotifyWidgetDocument

    const input = toSpotifySummaryInput(doc)
    expect(input.metrics).toEqual([])
    expect(input.playlists).toHaveLength(50)
    expect(input.playlists[0].description?.endsWith('…')).toBe(true)
    expect(input.playlists[0].description?.length).toBeLessThanOrEqual(240)
    expect(input.playlists[1].trackCount).toBe(1)
    expect(input.profile.id).toBeUndefined()
    expect(input.topTracks).toEqual([
      { artists: ['A'], name: 'One' },
      { artists: [], name: 'Two' },
    ])
  })

  it('uses fallback playlist title and omits trackCount when missing', () => {
    const doc: SpotifyWidgetDocument = {
      collections: {
        playlists: [
          {
            description: 'Short',
            name: 123 as unknown as string,
            public: true,
          },
        ],
        topTracks: [{ name: 'Only' }],
      },
      profile: {},
    } as SpotifyWidgetDocument
    const input = toSpotifySummaryInput(doc)
    expect(input.playlists[0].name).toBe('Playlist')
    expect(input.playlists[0].trackCount).toBeUndefined()
    expect(input.profile.displayName).toBeUndefined()
    expect(input.profile.profileURL).toBeUndefined()
  })
})
