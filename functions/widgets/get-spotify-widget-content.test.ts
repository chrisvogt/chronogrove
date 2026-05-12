import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentStore } from '../ports/document-store.js'
import getSpotifyWidgetContent from './get-spotify-widget-content.js'

describe('getSpotifyWidgetContent', () => {
  let documentStore: DocumentStore

  beforeEach(() => {
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    }
  })

  it('should return properly formatted widget content', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0,
        },
      },
      collections: {
        playlists: [
          {
            id: 'playlist1',
            name: 'Test Playlist',
            images: [{ url: 'https://example.com/image.jpg' }],
          },
        ],
        topTracks: [
          {
            id: 'track1',
            name: 'Test Track',
            artists: [{ name: 'Test Artist' }],
          },
        ],
      },
      metrics: [
        {
          displayName: 'Followers',
          id: 'followers-count',
          value: 1000,
        },
      ],
      profile: {
        displayName: 'Test User',
        id: 'user123',
        profileURL: 'https://open.spotify.com/user/user123',
      },
    })

    const result = await getSpotifyWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      collections: {
        playlists: [
          {
            id: 'playlist1',
            name: 'Test Playlist',
            images: [{ url: 'https://example.com/image.jpg' }],
          },
        ],
        topTracks: [
          {
            id: 'track1',
            name: 'Test Track',
            artists: [{ name: 'Test Artist' }],
          },
        ],
      },
      metrics: [
        {
          displayName: 'Followers',
          id: 'followers-count',
          value: 1000,
        },
      ],
      profile: {
        displayName: 'Test User',
        id: 'user123',
        profileURL: 'https://open.spotify.com/user/user123',
      },
      meta: {
        synced: new Date('2022-01-01T00:00:00.000Z'),
      },
    })

    expect(documentStore.getDocument).toHaveBeenCalledWith('users/chrisvogt/spotify/widget-content')
  })

  it('should handle missing data gracefully', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0,
        },
      },
    })

    const result = await getSpotifyWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      meta: {
        synced: new Date('2022-01-01T00:00:00.000Z'),
      },
    })
  })

  it('should throw error when data retrieval fails', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(null)

    await expect(getSpotifyWidgetContent(documentStore, 'chrisvogt')).rejects.toThrow(
      'No Spotify data found in DocumentStore'
    )
  })

  it('should throw error when document store rejects', async () => {
    vi.mocked(documentStore.getDocument).mockRejectedValue(new Error('Database error'))

    await expect(getSpotifyWidgetContent(documentStore, 'chrisvogt')).rejects.toThrow(
      'Database error'
    )
  })
})
