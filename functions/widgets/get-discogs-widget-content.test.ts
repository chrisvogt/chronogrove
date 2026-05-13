import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentStore } from '../ports/document-store.js'
import getDiscogsWidgetContent from './get-discogs-widget-content.js'

describe('getDiscogsWidgetContent', () => {
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
        releases: [
          {
            id: 28461454,
            title: 'The Rise & Fall Of A Midwest Princess',
            artist: 'Chappell Roan',
            year: 2023,
          },
        ],
      },
      metrics: {
        'LPs Owned': 150,
      },
      profile: {
        profileURL: 'https://www.discogs.com/user/chrisvogt/collection',
      },
    })

    const result = await getDiscogsWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      collections: {
        releases: [
          {
            id: 28461454,
            title: 'The Rise & Fall Of A Midwest Princess',
            artist: 'Chappell Roan',
            year: 2023,
          },
        ],
      },
      metrics: {
        'LPs Owned': 150,
      },
      profile: {
        profileURL: 'https://www.discogs.com/user/chrisvogt/collection',
      },
      meta: {
        synced: new Date('2022-01-01T00:00:00.000Z'),
      },
    })

    expect(documentStore.getDocument).toHaveBeenCalledWith('users/chrisvogt/discogs/widget-content')
  })

  it('should handle missing data gracefully', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(null)

    const result = await getDiscogsWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      meta: {},
    })
  })

  it('should handle missing meta data', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      collections: {
        releases: [],
      },
    })

    const result = await getDiscogsWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      collections: {
        releases: [],
      },
      meta: {},
    })
  })

  it('should handle missing meta.synced data', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {},
      collections: {
        releases: [],
      },
    })

    const result = await getDiscogsWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      collections: {
        releases: [],
      },
      meta: {},
    })
  })
})
