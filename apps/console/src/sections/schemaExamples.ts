/**
 * Illustrative response bodies for the API schema page (aligned with Cloud Functions handlers).
 * Nested objects match real sync / transform shapes; values are mocked for documentation.
 */

const discogsReleaseItem = {
  id: 28461454,
  instanceId: 2045415075,
  dateAdded: '2025-07-27T23:34:53-07:00',
  rating: 0,
  folderId: 1,
  notes: [{ field_id: 1, value: 'Mint (M)' }],
  basicInformation: {
    id: 28461454,
    masterId: 3255691,
    masterUrl: 'https://api.discogs.com/masters/3255691',
    resourceUrl: 'https://api.discogs.com/releases/28461454',
    thumb: 'https://i.discogs.com/example-thumb.jpeg',
    coverImage: 'https://i.discogs.com/example-cover.jpeg',
    cdnThumbUrl: '/api/media/example/discogs/28461454_thumb.jpeg',
    cdnCoverUrl: '/api/media/example/discogs/28461454_cover.jpeg',
    title: 'The Rise & Fall Of A Midwest Princess',
    year: 2023,
    formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'] }],
    labels: [
      {
        name: 'Amusement Records (3)',
        catno: 'B0038014-01',
        entity_type: '1',
        entity_type_name: 'Label',
        id: 3589090,
        resource_url: 'https://api.discogs.com/labels/3589090',
      },
    ],
    artists: [
      {
        name: 'Chappell Roan',
        anv: '',
        join: '',
        role: '',
        tracks: '',
        id: 6360106,
        resource_url: 'https://api.discogs.com/artists/6360106',
      },
    ],
    genres: ['Pop'],
    styles: ['Indie Pop'],
  },
}

const flickrPhotoItem = {
  id: '53809231721',
  title: 'Golden hour skyline',
  description: 'Shot on a6500',
  dateTaken: '2025-03-15 18:42:10',
  ownerName: 'Example Photographer',
  thumbnailUrl: 'https://live.staticflickr.com/example_q.jpg',
  mediumUrl: 'https://live.staticflickr.com/example_m.jpg',
  largeUrl: 'https://live.staticflickr.com/example_l.jpg',
  link: 'https://www.flickr.com/photos/example/53809231721',
}

const goodreadsBookItem = {
  id: 'gr-book-1',
  title: 'Project Hail Mary',
  subtitle: '',
  authors: ['Andy Weir'],
  categories: ['Fiction', 'Science Fiction'],
  cdnMediaURL: '/api/media/example/goodreads/hail-mary-cover.jpg',
  mediaDestinationPath: 'goodreads/example/hail-mary-cover.jpg',
  description: 'A lone astronaut races to save the solar system.',
  infoLink: 'https://books.google.com/books?id=example',
  previewLink: 'http://books.google.com/books?id=example&printsec=frontcover',
  isbn: '9780593135204',
  pageCount: 496,
  rating: '5',
  readAt: '2025-03-15',
  smallThumbnail: 'http://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=5',
  thumbnail: 'http://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=1',
}

export const widgetResponseExamples = {
  discogs: {
    ok: true,
    payload: {
      aiSummary:
        'Mostly Japanese pressings from the 1970s–1980s; I still chase clean copies of fusion and city-pop titles.',
      meta: { synced: '2025-03-27T12:00:00.000Z' },
      metrics: { 'LPs Owned': 120 },
      profile: {
        profileURL: 'https://www.discogs.com/user/example/collection',
      },
      collections: {
        releases: [discogsReleaseItem],
      },
    },
  },
  flickr: {
    ok: true,
    payload: {
      meta: { synced: '2025-03-27T12:00:00.000Z' },
      metrics: [
        { displayName: 'Photos', id: 'photos-count', value: 240 },
        { displayName: 'Albums', id: 'albums', value: 12 },
      ],
      profile: {
        displayName: 'example-photographer',
        profileURL: 'https://www.flickr.com/photos/example-photographer/',
      },
      collections: {
        photos: [flickrPhotoItem, { ...flickrPhotoItem, id: '53809231722', title: 'Night market' }],
      },
    },
  },
  github: {
    ok: true,
    payload: {
      user: {
        login: 'example',
        name: 'Example User',
        createdAt: '2018-04-22T04:00:00Z',
        bio: 'Building metrics and playlists.',
        followers: { totalCount: 128 },
        following: { totalCount: 64 },
        url: 'https://github.com/example',
        avatarUrl: 'https://avatars.githubusercontent.com/u/000?v=4',
        location: 'San Francisco',
        repositories: { totalCount: 42 },
        status: {
          emoji: '🎧',
          message: 'Shipping widgets',
          updatedAt: '2025-03-26T20:00:00Z',
          createdAt: '2025-03-26T19:55:00Z',
          expiresAt: '2025-03-27T01:00:00Z',
        },
        pinnedItems: {
          totalCount: 3,
          nodes: [
            {
              __typename: 'Repository',
              id: 'R_kgDExampleRepo',
              name: 'chronogrove',
              nameWithOwner: 'example/chronogrove',
              description: 'Demo widget data API',
              url: 'https://github.com/example/chronogrove',
              homepageUrl: 'https://chrisvogt.me',
              createdAt: '2024-01-10T00:00:00Z',
              updatedAt: '2025-03-20T00:00:00Z',
              pushedAt: '2025-03-21T00:00:00Z',
              openGraphImageUrl: 'https://opengraph.githubassets.com/example.png',
              hasIssuesEnabled: true,
              hasWikiEnabled: false,
              usesCustomOpenGraphImage: false,
              primaryLanguage: { id: 'TypeScript', name: 'TypeScript', color: '#3178c6' },
              licenseInfo: {
                name: 'MIT License',
                nickname: 'MIT',
                key: 'mit',
                url: 'https://choosealicense.com/licenses/mit/',
              },
            },
            {
              __typename: 'Gist',
              id: 'gist-example-id',
              name: 'snippets.ts',
              url: 'https://gist.github.com/example/abc123',
              updatedAt: '2025-02-01T00:00:00Z',
              pushedAt: '2025-02-01T00:05:00Z',
            },
          ],
        },
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: 1234,
            weeks: [
              {
                contributionDays: [
                  { date: '2025-03-24', contributionCount: 6, color: '#30a14e' },
                  { date: '2025-03-25', contributionCount: 0, color: '#ebedf0' },
                  { date: '2025-03-26', contributionCount: 4, color: '#40c463' },
                ],
              },
            ],
          },
        },
        pullRequests: {
          nodes: [
            {
              id: 'PR_kwDOExample',
              number: 42,
              title: 'Add Spotify playlist mosaic caching',
              url: 'https://github.com/example/chronogrove/pull/42',
              merged: true,
              closed: false,
              createdAt: '2025-03-10T10:00:00Z',
              closedAt: '2025-03-12T15:30:00Z',
              lastEditedAt: '2025-03-12T14:00:00Z',
              repository: {
                id: 'R_kgDExampleRepo',
                name: 'chronogrove',
                url: 'https://github.com/example/chronogrove',
              },
              labels: {
                edges: [
                  { node: { id: 'LA_kwDO_enhancement', name: 'enhancement', color: '84b6eb' } },
                ],
              },
              viewerDidAuthor: true,
            },
          ],
        },
      },
    },
  },
  goodreads: {
    ok: true,
    payload: {
      meta: { synced: '2025-03-27T12:00:00.000Z' },
      profile: {
        name: 'Reader',
        username: 'reader',
        readCount: 281,
        link: 'https://www.goodreads.com/user/show/123-example',
        imageURL: 'https://images.gr-assets.com/users/example-profile.jpg',
        friendsCount: '42',
        favoriteBooks: 'The Left Hand of Darkness',
      },
      summary: 'Currently on a space-opera kick; re-reads old favorites each winter.',
      aiSummary:
        'Mostly science fiction and literary fiction; finishes series quickly when hooked; rates generously on debut novels.',
      collections: {
        recentlyReadBooks: [
          goodreadsBookItem,
          {
            ...goodreadsBookItem,
            id: 'gr-book-2',
            title: 'Sea of Tranquility',
            readAt: '2025-02-01',
          },
        ],
        updates: [
          {
            type: 'review',
            rating: 5,
            actionText: 'rated a book',
            updated: '2025-03-20T18:00:00.000Z',
            link: 'https://www.goodreads.com/review/show/000',
            book: {
              title: 'Project Hail Mary',
              goodreadsID: '000',
              link: 'https://www.goodreads.com/book/show/000',
              author: {
                name: 'Andy Weir',
                imageURL: 'https://images.gr-assets.com/authors/example.jpg',
              },
            },
            actor: {
              name: 'Reader',
              link: 'https://www.goodreads.com/user/show/123-example',
            },
          },
          {
            type: 'userstatus',
            actionText: 'is currently reading',
            updated: '2025-03-22T09:00:00.000Z',
            link: 'https://www.goodreads.com/user_status/000',
            page: 142,
            percent: 28,
            created: '2025-03-22T09:00:00.000Z',
            book: {
              title: 'Sea of Tranquility',
              goodreadsID: '111',
              format: 'Paperback',
              pageCount: 520,
              publicationYear: 2022,
              publisher: 'Knopf',
              sortTitle: 'sea of tranquility',
              author: {
                name: 'Emily St. John Mandel',
                displayName: 'Emily St. John Mandel',
                sortName: 'Mandel, Emily St. John',
              },
            },
          },
        ],
      },
    },
  },
  instagram: {
    ok: true,
    payload: {
      meta: { synced: '2025-03-27T12:00:00.000Z' },
      metrics: [
        { displayName: 'Followers', id: 'followers-count', value: 1280 },
        { displayName: 'Following', id: 'follows-count', value: 341 },
        { displayName: 'Posts', id: 'media-count', value: 87 },
      ],
      profile: {
        biography: 'Photos · travel · coffee',
        displayName: 'example',
        profileURL: 'https://www.instagram.com/example',
      },
      provider: { displayName: 'Instagram', id: 'instagram' },
      collections: {
        media: [
          {
            id: '18085701234567890',
            altText: 'Sunset over the bay',
            caption: 'Finally spring.',
            likeCount: 412,
            commentsCounts: 9,
            mediaType: 'IMAGE',
            mediaURL: 'https://scontent.cdninstagram.com/example/main.jpg',
            thumbnailURL: 'https://scontent.cdninstagram.com/example/thumb.jpg',
            cdnMediaURL: '/api/media/example/instagram/18085701234567890.jpg',
            permalink: 'https://www.instagram.com/p/AbCdEf/',
            shortcode: 'AbCdEf',
            timestamp: '2025-03-25T22:15:00+0000',
            username: 'example',
          },
          {
            id: '18085701234567891',
            mediaType: 'CAROUSEL_ALBUM',
            caption: 'Three from the market.',
            likeCount: 205,
            commentsCounts: 3,
            mediaURL: 'https://scontent.cdninstagram.com/example/carousel_main.jpg',
            thumbnailURL: 'https://scontent.cdninstagram.com/example/carousel_thumb.jpg',
            cdnMediaURL: '/api/media/example/instagram/18085701234567891.jpg',
            permalink: 'https://www.instagram.com/p/XyZaBc/',
            shortcode: 'XyZaBc',
            timestamp: '2025-03-24T16:40:00+0000',
            username: 'example',
            children: [
              {
                id: '18085701234567892',
                media_url: 'https://scontent.cdninstagram.com/example/slide1.jpg',
                thumbnail_url: 'https://scontent.cdninstagram.com/example/slide1_thumb.jpg',
                media_type: 'IMAGE',
                cdnMediaURL: '/api/media/example/instagram/18085701234567892.jpg',
              },
              {
                id: '18085701234567893',
                media_url: 'https://scontent.cdninstagram.com/example/slide2.jpg',
                thumbnail_url: 'https://scontent.cdninstagram.com/example/slide2_thumb.jpg',
                media_type: 'IMAGE',
                cdnMediaURL: '/api/media/example/instagram/18085701234567893.jpg',
              },
            ],
          },
        ],
      },
    },
  },
  spotify: {
    ok: true,
    payload: {
      aiSummary:
        'Lately I lean on curated mood playlists; my top tracks still orbit electronic and indie edges more than pop radio.',
      meta: {
        synced: '2025-03-27T12:00:00.000Z',
        totalUploadedMediaCount: 8,
      },
      metrics: [
        { displayName: 'Followers', id: 'followers-count', value: 42 },
        { displayName: 'Playlists', id: 'playlists-count', value: 14 },
      ],
      profile: {
        id: 'spotifyUserIdExample',
        displayName: 'Example Listener',
        followersCount: 42,
        profileURL: 'https://open.spotify.com/user/example',
        avatarURL: { url: 'https://i.scdn.co/image/ab6775700000ee851234567890abcdef' },
      },
      collections: {
        playlists: [
          {
            id: '37i9dQZF1ExamplePlaylist01',
            name: 'Discover Weekly',
            description: 'Your weekly mixtape of fresh music.',
            public: false,
            collaborative: false,
            uri: 'spotify:playlist:37i9dQZF1ExamplePlaylist01',
            tracks: { total: 30 },
            images: [
              { url: 'https://mosaic.scdn.co/300/ab67616d0000b2730001', height: 300, width: 300 },
            ],
            cdnImageURL: '/api/media/example/spotify/playlists/mosaic-hash-abc.jpg',
          },
          {
            id: '37i9dQZF1ExamplePlaylist02',
            name: 'On Repeat',
            description: 'Songs you can’t stop playing.',
            public: true,
            collaborative: false,
            uri: 'spotify:playlist:37i9dQZF1ExamplePlaylist02',
            tracks: { total: 15 },
            images: [{ url: 'https://i.scdn.co/image/example-playlist-cover', height: 640, width: 640 }],
            cdnImageURL: '/api/media/example/spotify/playlists/mosaic-hash-def.jpg',
          },
        ],
        topTracks: [
          {
            id: '4iV5W9uYEdYATaAJP60UU',
            name: 'Ignition (remix)',
            type: 'track',
            uri: 'spotify:track:4iV5W9uYEdYATaAJP60UU',
            previewURL: 'https://p.scdn.co/mp3-preview/example',
            spotifyURL: 'https://open.spotify.com/track/4iV5W9uYEdYATaAJP60UU',
            artists: ['R. Kelly'],
            albumImages: [
              { url: 'https://i.scdn.co/image/example-album-64', height: 64, width: 64 },
              { url: 'https://i.scdn.co/image/example-album-300', height: 300, width: 300 },
            ],
          },
          {
            id: 'ExampleTrackId02',
            name: 'Midnight City',
            type: 'track',
            uri: 'spotify:track:ExampleTrackId02',
            previewURL: null,
            spotifyURL: 'https://open.spotify.com/track/ExampleTrackId02',
            artists: ['M83'],
            albumImages: [{ url: 'https://i.scdn.co/image/hurry-up-cover', height: 300, width: 300 }],
          },
        ],
      },
    },
  },
  steam: {
    ok: true,
    payload: {
      meta: { synced: '2025-03-27T12:00:00.000Z' },
      metrics: [
        { displayName: 'Owned Games', id: 'owned-games-count', value: 88 },
      ],
      profile: {
        displayName: 'Player1',
        profileURL: 'https://steamcommunity.com/id/example',
        avatarURL: 'https://avatars.steamstatic.com/example_full.jpg',
      },
      collections: {
        ownedGames: [
          {
            displayName: 'Hades',
            id: 1145360,
            playTimeForever: 6120,
            playTime2Weeks: 120,
            images: {
              icon: 'https://media.steampowered.com/steamcommunity/public/images/apps/1145360/hash.jpg',
              capsuleSmall: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/capsule_231x87.jpg',
              capsuleLarge: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/capsule_616x353.jpg',
              header: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg',
              heroCapsule: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/hero_capsule.jpg',
            },
          },
          {
            displayName: 'Baldur\'s Gate 3',
            id: 1086940,
            playTimeForever: 18440,
            playTime2Weeks: 0,
            images: {
              icon: 'https://media.steampowered.com/steamcommunity/public/images/apps/1086940/hash.jpg',
              capsuleSmall: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/capsule_231x87.jpg',
              capsuleLarge: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/capsule_616x353.jpg',
              header: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg',
              heroCapsule: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/hero_capsule.jpg',
            },
          },
        ],
        recentlyPlayedGames: [
          {
            displayName: 'Hades',
            id: 1145360,
            playTimeForever: 6120,
            playTime2Weeks: 145,
            images: {
              icon: 'https://media.steampowered.com/steamcommunity/public/images/apps/1145360/hash.jpg',
              capsuleSmall: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/capsule_231x87.jpg',
              capsuleLarge: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/capsule_616x353.jpg',
              header: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg',
              heroCapsule: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/hero_capsule.jpg',
            },
          },
        ],
      },
      aiSummary:
        'Recently bouncing between roguelikes and long RPG sessions; Hades dominates the last two weeks.',
    },
  },
} as const

/** Returned directly (not wrapped in `{ ok, payload }`). */
export const manualSyncResponseExample = {
  enqueue: { jobId: '01JQSyncExampleJobId0', status: 'enqueued' as const },
  beforeJob: {
    jobId: '01JQSyncExampleJobId0',
    mode: 'sync' as const,
    provider: 'spotify' as const,
    userId: 'default-widget-user',
    status: 'processing' as const,
    runCount: 1,
    enqueuedAt: '2025-03-27T12:00:00.000Z',
    lastStartedAt: '2025-03-27T12:00:01.000Z',
    updatedAt: '2025-03-27T12:00:01.000Z',
  },
  afterJob: {
    jobId: '01JQSyncExampleJobId0',
    mode: 'sync' as const,
    provider: 'spotify' as const,
    userId: 'default-widget-user',
    status: 'completed' as const,
    runCount: 1,
    enqueuedAt: '2025-03-27T12:00:00.000Z',
    lastStartedAt: '2025-03-27T12:00:01.000Z',
    completedAt: '2025-03-27T12:00:05.000Z',
    updatedAt: '2025-03-27T12:00:05.000Z',
    summary: {
      durationMs: 4200,
      result: 'SUCCESS' as const,
      metrics: { tracksSynced: 30, playlistsTouched: 2 },
    },
  },
  worker: { jobId: '01JQSyncExampleJobId0', result: 'SUCCESS' as const },
}

/**
 * Shapes carried on GET /api/widgets/sync/:provider/stream (text/event-stream).
 * Each SSE message is `data: <json>\\n\\n`. Many `progress` frames; ends with `done` or `error`.
 */
export const manualSyncStreamSseExample = {
  contentType: 'text/event-stream; charset=utf-8',
  progress: {
    type: 'progress',
    phase: 'e.g. discogs.release',
    message: 'Human-readable step (UI typically shows only the latest).',
  },
  done: {
    type: 'done',
    result: manualSyncResponseExample,
  },
  error: {
    type: 'error',
    message: 'string',
  },
}

export const authSessionExample = {
  ok: true,
  message: 'Session cookie created successfully',
}

export const authLogoutExample = {
  ok: true,
  message: 'User logged out successfully',
}

export const clientAuthConfigExample = {
  apiKey: 'AIza…',
  authDomain: 'project-id.firebaseapp.com',
  projectId: 'project-id',
}

export const csrfTokenExample = {
  ok: true,
  csrfToken: '<token>',
}
