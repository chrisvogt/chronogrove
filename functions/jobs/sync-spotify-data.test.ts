import { beforeEach, describe, expect, it, vi } from 'vitest'

import syncSpotifyData from './sync-spotify-data.js'
import type { DocumentStore } from '../ports/document-store.js'
import { configureLogger } from '../services/logger.js'

vi.mock('../config/backend-config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/backend-config.js')>()
  return {
    ...actual,
    getSpotifyConfig: vi.fn(() => ({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'http://localhost/callback',
      refreshToken: 'refresh-token',
    })),
  }
})

vi.mock('../api/spotify/get-access-token.js', () => ({
  default: vi.fn(),
}))

vi.mock('../api/spotify/get-playlists.js', () => ({
  default: vi.fn(),
}))

vi.mock('../api/spotify/get-top-tracks.js', () => ({
  default: vi.fn(),
}))

vi.mock('../api/spotify/get-user-profile.js', () => ({
  default: vi.fn(),
}))

vi.mock('../services/media/media-service.js', () => ({
  describeMediaStore: vi.fn(() => ({ backend: 'disk', target: '/tmp/media' })),
  listStoredMedia: vi.fn(),
  storeRemoteMedia: vi.fn(async (item) => ({ fileName: item.destinationPath })),
  toPublicMediaUrl: vi.fn((path) => `https://cdn.example.com/${path}`),
}))

vi.mock('../transformers/track-to-collection-item.js', () => ({
  default: vi.fn((track) => ({ id: track.id, displayName: track.name })),
}))

vi.mock('../api/ai-summary/generate-spotify-summary.js', () => ({
  default: vi.fn().mockResolvedValue('<p>Mock Spotify AI summary.</p>'),
}))

import generateSpotifySummary from '../api/ai-summary/generate-spotify-summary.js'
import getSpotifyAccessToken from '../api/spotify/get-access-token.js'
import getSpotifyPlaylists from '../api/spotify/get-playlists.js'
import getSpotifyTopTracks from '../api/spotify/get-top-tracks.js'
import getSpotifyUserProfile from '../api/spotify/get-user-profile.js'
import { listStoredMedia } from '../services/media/media-service.js'

describe('syncSpotifyData', () => {
  let documentStore: DocumentStore
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    configureLogger(logger)
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('should successfully sync Spotify data to the document store', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([{ id: 'track1', name: 'Track 1' }])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'playlist1',
          name: 'Playlist 1',
          images: [{ url: 'https://mosaic.scdn.co/300/hash123', height: 300, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncSpotifyData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.tracksSyncedCount).toBe(1)
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/spotify/last-response_playlists',
      expect.objectContaining({
        response: expect.any(Object),
        fetchedAt: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/spotify/last-response_top-tracks',
      expect.objectContaining({
        response: [{ id: 'track1', name: 'Track 1' }],
        fetchedAt: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/spotify/last-response_user-profile',
      expect.objectContaining({
        response: expect.any(Object),
        fetchedAt: expect.any(String),
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/spotify/widget-content',
      expect.objectContaining({
        aiSummary: '<p>Mock Spotify AI summary.</p>',
        meta: {
          synced: expect.any(String),
          totalUploadedMediaCount: 1,
        },
      })
    )
    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/spotify/last-response_ai-summary',
      expect.objectContaining({
        generatedAt: expect.any(String),
        summary: '<p>Mock Spotify AI summary.</p>',
      })
    )
  })

  it('continues when AI summary generation fails', async () => {
    vi.mocked(generateSpotifySummary).mockRejectedValueOnce(new Error('AI unavailable'))
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([{ id: 'track1', name: 'Track 1' }])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'playlist1',
          name: 'Playlist 1',
          images: [{ url: 'https://mosaic.scdn.co/300/hash123', height: 300, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncSpotifyData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to generate Spotify AI summary.',
      expect.any(Error),
    )
    const widgetPayload = vi.mocked(documentStore.setDocument).mock.calls.find(
      (c) => c[0] === 'users/chrisvogt/spotify/widget-content',
    )?.[1] as { aiSummary?: string }
    expect(widgetPayload.aiSummary).toBeUndefined()
    expect(
      vi.mocked(documentStore.setDocument).mock.calls.some(
        (c) => c[0] === 'users/chrisvogt/spotify/last-response_ai-summary',
      ),
    ).toBe(false)
  })

  it('should not re-download playlist covers already in storage', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'playlist1',
          name: 'Playlist 1',
          images: [{ url: 'https://mosaic.scdn.co/300/hash123', height: 300, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue(['chrisvogt/spotify/playlists/hash123.jpg'])

    const result = await syncSpotifyData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedMediaCount).toBe(0)
  })

  it('should skip playlists without a 300px mosaic image when building download list', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 2,
      items: [
        {
          id: 'playlist1',
          name: 'Has cover',
          images: [{ url: 'https://mosaic.scdn.co/300/hash123', height: 300, width: 300 }],
        },
        {
          id: 'playlist2',
          name: 'Only thumb',
          images: [{ url: 'https://i.scdn.co/image/small', height: 60, width: 60 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncSpotifyData(documentStore)

    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedMediaCount).toBe(1)
  })

  it('should fail when no access token is available', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: '' })

    const result = await syncSpotifyData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: 'Need a valid access token to call Spotify API.',
    })
    expect(documentStore.setDocument).not.toHaveBeenCalled()
  })

  it('should fail when the document store rejects', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({ total: 0, items: [] })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    vi.mocked(documentStore.setDocument).mockRejectedValue(new Error('DocumentStore Error'))

    const result = await syncSpotifyData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: new Error('DocumentStore Error'),
    })
  })

  it('should fail when fetching top tracks fails', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockRejectedValue(new Error('Top tracks failed'))

    const result = await syncSpotifyData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: new Error('Top tracks failed'),
    })
  })

  it('should fail when fetching playlists fails', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockRejectedValue(new Error('Playlists failed'))

    const result = await syncSpotifyData(documentStore)

    expect(result).toEqual({
      result: 'FAILURE',
      error: new Error('Playlists failed'),
    })
  })

  it('should fail when fetching user profile fails', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockRejectedValue(new Error('profile unavailable'))

    const result = await syncSpotifyData(documentStore)

    expect(logger.error).toHaveBeenCalledWith('Failed to fetch Spotify user profile.', expect.any(Error))
    expect(result).toEqual({
      result: 'FAILURE',
      error: new Error('profile unavailable'),
    })
  })

  it('should invoke onProgress for each major phase on success', async () => {
    const onProgress = vi.fn()
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([{ id: 'track1', name: 'Track 1' }])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'playlist1',
          name: 'Playlist 1',
          images: [{ url: 'https://mosaic.scdn.co/300/hash123', height: 300, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncSpotifyData(documentStore, { onProgress })

    expect(onProgress.mock.calls.map((c) => c[0].phase)).toEqual([
      'spotify.token',
      'spotify.profile',
      'spotify.top_tracks',
      'spotify.playlists',
      'spotify.covers',
      'spotify.ai',
      'spotify.persist',
    ])
  })

  it('should log and still finish when playlist cover download fails', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'playlist1',
          name: 'Playlist 1',
          images: [{ url: 'https://mosaic.scdn.co/300/hash123', height: 300, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])
    const { storeRemoteMedia } = await import('../services/media/media-service.js')
    vi.mocked(storeRemoteMedia).mockRejectedValueOnce(new Error('upload failed'))

    const result = await syncSpotifyData(documentStore)

    expect(logger.error).toHaveBeenCalledWith(
      'Something went wrong downloading Spotify playlist media files.',
      expect.any(Error),
    )
    expect(result.result).toBe('SUCCESS')
  })

  it('should continue writing Spotify data to canonical collections', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test User',
      external_urls: { spotify: 'https://open.spotify.com/user/test' },
      followers: { total: 100 },
      id: 'user123',
      images: [{ url: 'https://example.com/avatar.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({ total: 0, items: [] })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncSpotifyData(documentStore, {
      userId: 'chrisvogt',
    })

    expect(documentStore.setDocument).toHaveBeenCalledWith(
      'users/chrisvogt/spotify/widget-content',
      expect.any(Object)
    )
  })

  it('omits followers metric and spotify.covers when there is no 300px art and zero followers', async () => {
    const onProgress = vi.fn()
    vi.mocked(generateSpotifySummary).mockResolvedValue('<p>AI</p>')
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'No Followers',
      external_urls: { spotify: 'https://open.spotify.com/user/x' },
      followers: { total: 0 },
      id: 'user123',
      images: [{ url: '' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([{ id: 't1', name: 'Track' }])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'p1',
          name: 'No mosaic',
          images: [{ url: 'https://i.scdn.co/image/x', height: 64, width: 64 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncSpotifyData(documentStore, { onProgress })

    expect(result.result).toBe('SUCCESS')
    const widget = (
      vi.mocked(documentStore.setDocument).mock.calls.find(
        (c) => c[0] === 'users/chrisvogt/spotify/widget-content',
      )?.[1] as { metrics?: { id: string }[]; profile: { avatarURL?: unknown } }
    )
    expect(widget.metrics?.some((m) => m.id === 'followers-count')).toBe(false)
    expect(widget.profile.avatarURL).toBeUndefined()
    expect(onProgress.mock.calls.map((c) => c[0].phase)).toEqual([
      'spotify.token',
      'spotify.profile',
      'spotify.top_tracks',
      'spotify.playlists',
      'spotify.ai',
      'spotify.persist',
    ])
  })

  it('selects mosaic art when width is 300 but height is not', async () => {
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test',
      external_urls: {},
      followers: { total: 1 },
      id: 'id',
      images: [{ url: 'https://example.com/a.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'pl1',
          name: 'Wide tile',
          images: [{ url: 'https://mosaic.scdn.co/300/abc', height: 200, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    const result = await syncSpotifyData(documentStore)
    expect(result.result).toBe('SUCCESS')
    expect(result.totalUploadedMediaCount).toBe(1)
  })

  it('forwards truncated playlist descriptions into the AI summary input', async () => {
    const spy = vi.fn().mockResolvedValue('<p>ok</p>')
    vi.mocked(generateSpotifySummary).mockImplementation(spy)
    const longDesc = `z${'b'.repeat(260)}`
    vi.mocked(getSpotifyAccessToken).mockResolvedValue({ accessToken: 'spotify-token' })
    vi.mocked(getSpotifyUserProfile).mockResolvedValue({
      display_name: 'Test',
      external_urls: {},
      followers: { total: 1 },
      id: 'id',
      images: [{ url: 'https://example.com/a.jpg' }],
    })
    vi.mocked(getSpotifyTopTracks).mockResolvedValue([{ id: 't1', name: 'N' }])
    vi.mocked(getSpotifyPlaylists).mockResolvedValue({
      total: 1,
      items: [
        {
          description: longDesc,
          id: 'pl1',
          name: 'P',
          images: [{ url: 'https://mosaic.scdn.co/300/h', height: 300, width: 300 }],
        },
      ],
    })
    vi.mocked(listStoredMedia).mockResolvedValue([])

    await syncSpotifyData(documentStore)

    const arg = spy.mock.calls[0]?.[0]
    expect(arg?.playlists[0].description?.endsWith('…')).toBe(true)
    expect(arg?.playlists[0].description?.length).toBeLessThanOrEqual(240)
  })
})
