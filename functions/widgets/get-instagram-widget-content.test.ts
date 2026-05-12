import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentStore } from '../ports/document-store.js'
import getInstagramWidgetContent from './get-instagram-widget-content.js'

describe('getInstagramWidgetContent', () => {
  let documentStore: DocumentStore

  beforeEach(() => {
    documentStore = {
      getDocument: vi.fn(),
      setDocument: vi.fn(),
    }
  })

  it('should return properly formatted widget content for chrisvogt user', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0,
        },
      },
      media: [
        {
          id: '123',
          images: { thumbnail: { url: 'https://example.com/image.jpg' } },
        },
      ],
      profile: {
        biography: 'Test bio',
        followersCount: 1000,
        followsCount: 500,
        mediaCount: 50,
        username: 'testuser',
      },
    })

    const result = await getInstagramWidgetContent(documentStore, 'chrisvogt')

    expect(result).toEqual({
      collections: {
        media: [
          {
            id: '123',
            images: { thumbnail: { url: 'https://example.com/image.jpg' } },
          },
        ],
      },
      meta: {
        synced: new Date('2022-01-01T00:00:00.000Z'),
      },
      metrics: [
        {
          displayName: 'Followers',
          id: 'followers-count',
          value: 1000,
        },
        {
          displayName: 'Following',
          id: 'follows-count',
          value: 500,
        },
        {
          displayName: 'Posts',
          id: 'media-count',
          value: 50,
        },
      ],
      provider: {
        displayName: 'Instagram',
        id: 'instagram',
      },
      profile: {
        biography: 'Test bio',
        displayName: 'testuser',
        profileURL: 'https://www.instagram.com/testuser',
      },
    })

    expect(documentStore.getDocument).toHaveBeenCalledWith('users/chrisvogt/instagram/widget-content')
  })

  it('should return properly formatted widget content for chronogrove user', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0,
        },
      },
      media: [
        {
          id: '456',
          images: { thumbnail: { url: 'https://example.com/chronogrove.jpg' } },
        },
      ],
      profile: {
        biography: 'Chronogrove bio',
        followersCount: 500,
        followsCount: 125,
        mediaCount: 25,
        username: 'chronogrove',
      },
    })

    const result = await getInstagramWidgetContent(documentStore, 'chronogrove')

    expect(result.profile).toEqual({
      biography: 'Chronogrove bio',
      displayName: 'chronogrove',
      profileURL: 'https://www.instagram.com/chronogrove',
    })

    expect(documentStore.getDocument).toHaveBeenCalledWith('users/chronogrove/instagram/widget-content')
  })

  it('should handle missing profile data with defaults', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0,
        },
      },
      media: [],
    })

    const result = await getInstagramWidgetContent(documentStore, 'chrisvogt')

    expect(result.profile).toEqual({
      biography: '',
      displayName: '',
      profileURL: 'https://www.instagram.com/',
    })

    expect(result.metrics).toEqual([
      {
        displayName: 'Followers',
        id: 'followers-count',
        value: 0,
      },
      {
        displayName: 'Following',
        id: 'follows-count',
        value: 0,
      },
      {
        displayName: 'Posts',
        id: 'media-count',
        value: 0,
      },
    ])
  })

  it('should handle partial profile data with defaults', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue({
      meta: {
        synced: {
          _seconds: 1640995200,
          _nanoseconds: 0,
        },
      },
      media: [],
      profile: {
        username: 'partialuser',
      },
    })

    const result = await getInstagramWidgetContent(documentStore, 'chrisvogt')

    expect(result.profile).toEqual({
      biography: '',
      displayName: 'partialuser',
      profileURL: 'https://www.instagram.com/partialuser',
    })
  })

  it('should throw error when data retrieval returns nothing', async () => {
    vi.mocked(documentStore.getDocument).mockResolvedValue(null)

    await expect(getInstagramWidgetContent(documentStore, 'chrisvogt')).rejects.toThrow(
      'Failed to get a response.'
    )
  })

  it('should throw error when document store rejects', async () => {
    vi.mocked(documentStore.getDocument).mockRejectedValue(new Error('Database error'))

    await expect(getInstagramWidgetContent(documentStore, 'chrisvogt')).rejects.toThrow(
      'Database error'
    )
  })

  it('should rethrow non-Error failures from the document store', async () => {
    vi.mocked(documentStore.getDocument).mockRejectedValue('Database error')

    await expect(getInstagramWidgetContent(documentStore, 'chrisvogt')).rejects.toBe(
      'Database error'
    )
  })
})
