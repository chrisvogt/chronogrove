import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/backend-paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/backend-paths.js')>()
  return {
    ...actual,
    getDefaultWidgetUserId: vi.fn(() => 'default-user'),
  }
})

describe('getSpotifyWidgetContent default boundary wiring', () => {
  const documentStore = {
    getDocument: vi.fn(),
    setDocument: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the injected DocumentStore and default widget user id when no user id is provided', async () => {
    const { default: getSpotifyWidgetContent } = await import('./get-spotify-widget-content.js')

    documentStore.getDocument.mockResolvedValue({
      collections: { topTracks: [] },
      meta: {},
    })

    await expect(getSpotifyWidgetContent(documentStore)).resolves.toEqual({
      collections: { topTracks: [] },
      meta: {
        synced: new Date(0),
      },
    })

    expect(documentStore.getDocument).toHaveBeenCalledWith(
      'users/default-user/spotify/widget-content'
    )
  })
})
