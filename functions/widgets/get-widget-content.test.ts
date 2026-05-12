import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWidgetContent, validWidgetIds } from './get-widget-content.js'
import type { DocumentStore } from '../ports/document-store.js'

// Mock all widget content functions
vi.mock('./get-discogs-widget-content.js', () => ({
  default: vi.fn()
}))

vi.mock('./get-github-widget-content.js', () => ({
  default: vi.fn()
}))

vi.mock('./get-goodreads-widget-content.js', () => ({
  default: vi.fn()
}))

vi.mock('./get-instagram-widget-content.js', () => ({
  default: vi.fn()
}))

vi.mock('./get-spotify-widget-content.js', () => ({
  default: vi.fn()
}))

vi.mock('./get-steam-widget-content.js', () => ({
  default: vi.fn()
}))

vi.mock('./get-flickr-widget-content.js', () => ({
  default: vi.fn()
}))

import getDiscogsWidgetContent from './get-discogs-widget-content.js'
import getGitHubWidgetContent from './get-github-widget-content.js'
import getGoodreadsWidgetContent from './get-goodreads-widget-content.js'
import getInstagramWidgetContent from './get-instagram-widget-content.js'
import getSpotifyWidgetContent from './get-spotify-widget-content.js'
import getSteamWidgetContent from './get-steam-widget-content.js'
import getFlickrWidgetContent from './get-flickr-widget-content.js'

describe('getWidgetContent', () => {
  let documentStore: DocumentStore

  beforeEach(() => {
    vi.clearAllMocks()
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    }
  })

  it('should return valid widget IDs', () => {
    expect(validWidgetIds).toEqual([
      'discogs',
      'github', 
      'goodreads',
      'instagram',
      'spotify',
      'steam',
      'flickr'
    ])
  })

  it('should call discogs widget content function', async () => {
    const mockContent = { collections: { releases: [] } }
    getDiscogsWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('discogs', 'user123', documentStore)

    expect(getDiscogsWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should call github widget content function', async () => {
    const mockContent = { repositories: [] }
    getGitHubWidgetContent.mockResolvedValue({ payload: mockContent, authMode: 'env' })

    const result = await getWidgetContent('github', 'user123', documentStore)

    expect(getGitHubWidgetContent).toHaveBeenCalledWith('user123', documentStore, undefined)
    expect(result).toEqual({ payload: mockContent, meta: { githubAuthMode: 'env' } })
  })

  it('passes integrationLookupUserId to github widget loader', async () => {
    const mockContent = { repositories: [] }
    getGitHubWidgetContent.mockResolvedValue({ payload: mockContent, authMode: 'oauth' })

    const result = await getWidgetContent('github', 'user123', documentStore, {
      integrationLookupUserId: 'firebase-uid-9',
    })

    expect(getGitHubWidgetContent).toHaveBeenCalledWith('user123', documentStore, 'firebase-uid-9')
    expect(result).toEqual({ payload: mockContent, meta: { githubAuthMode: 'oauth' } })
  })

  it('should call goodreads widget content function', async () => {
    const mockContent = { collections: { recentlyReadBooks: [] } }
    getGoodreadsWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('goodreads', 'user123', documentStore)

    expect(getGoodreadsWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should call instagram widget content function', async () => {
    const mockContent = { collections: { media: [] } }
    getInstagramWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('instagram', 'user123', documentStore)

    expect(getInstagramWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should call spotify widget content function', async () => {
    const mockContent = { collections: { topTracks: [] } }
    getSpotifyWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('spotify', 'user123', documentStore)

    expect(getSpotifyWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should call steam widget content function', async () => {
    const mockContent = { collections: { recentlyPlayedGames: [] } }
    getSteamWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('steam', 'user123', documentStore)

    expect(getSteamWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should call flickr widget content function', async () => {
    const mockContent = { collections: { photos: [] } }
    getFlickrWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('flickr', 'user123', documentStore)

    expect(getFlickrWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should pass the document store to goodreads widget content when provided', async () => {
    const mockContent = { collections: { recentlyReadBooks: [] } }
    getGoodreadsWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('goodreads', 'user123', documentStore)

    expect(getGoodreadsWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should pass the document store to discogs widget content when provided', async () => {
    const mockContent = { collections: { releases: [] } }
    getDiscogsWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('discogs', 'user123', documentStore)

    expect(getDiscogsWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should pass the document store to instagram widget content when provided', async () => {
    const mockContent = { collections: { media: [] } }
    getInstagramWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('instagram', 'user123', documentStore)

    expect(getInstagramWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should pass the document store to spotify widget content when provided', async () => {
    const mockContent = { collections: { topTracks: [] } }
    getSpotifyWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('spotify', 'user123', documentStore)

    expect(getSpotifyWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should pass the document store to steam widget content when provided', async () => {
    const mockContent = { collections: { recentlyPlayedGames: [] } }
    getSteamWidgetContent.mockResolvedValue(mockContent)

    const result = await getWidgetContent('steam', 'user123', documentStore)

    expect(getSteamWidgetContent).toHaveBeenCalledWith(documentStore, 'user123')
    expect(result).toEqual({ payload: mockContent })
  })

  it('should throw error for unrecognized widget type', async () => {
    await expect(getWidgetContent('invalid', 'user123', documentStore)).rejects.toThrow(
      'Unrecognized widget type: invalid'
    )
  })
}) 
