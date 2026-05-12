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

  it('does not truncate description at exactly 240 chars, but does at 241', () => {
    const d240 = 'y'.repeat(240)
    const d241 = `z${'y'.repeat(240)}`
    const doc = {
      collections: {
        playlists: [
          { description: d240, name: 'A', tracks: { total: 1 } },
          { description: d241, name: 'B', tracks: { total: 2 } },
        ],
      },
    } as SpotifyWidgetDocument
    const input = toSpotifySummaryInput(doc)
    expect(input.playlists[0].description).toBe(d240)
    expect(input.playlists[0].description?.endsWith('…')).toBe(false)
    expect(input.playlists[1].description).toBe(`${d241.slice(0, 239)}…`)
  })

  it('passes through non-string description and preserves undefined public and tracks', () => {
    const doc: SpotifyWidgetDocument = {
      collections: {
        playlists: [
          {
            description: 99 as unknown as string,
            name: 'P',
            public: undefined,
            tracks: undefined,
          },
          { name: 'Q', tracks: {} },
        ],
      },
      profile: {},
    } as SpotifyWidgetDocument
    const input = toSpotifySummaryInput(doc)
    expect(input.playlists[0].description).toBe(99)
    expect(input.playlists[0].public).toBeUndefined()
    expect(input.playlists[0].trackCount).toBeUndefined()
    expect(input.playlists[1].trackCount).toBeUndefined()
  })

  it('uses empty playlists when collections or playlists are absent', () => {
    const noCollections = { profile: { displayName: 'solo' } } as SpotifyWidgetDocument
    expect(toSpotifySummaryInput(noCollections).playlists).toEqual([])

    const emptyCollections = {
      collections: {},
      profile: {},
    } as SpotifyWidgetDocument
    expect(toSpotifySummaryInput(emptyCollections).playlists).toEqual([])
  })
})
