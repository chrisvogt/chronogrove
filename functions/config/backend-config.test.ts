import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('backend config', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.NODE_ENV
    delete process.env.__FUNCTIONS_CONFIG_APPLIED__
    delete process.env.CLIENT_API_KEY
    delete process.env.CLIENT_AUTH_DOMAIN
    delete process.env.CLIENT_PROJECT_ID
    delete process.env.CLOUD_STORAGE_IMAGES_BUCKET
    delete process.env.MEDIA_STORE_BACKEND
    delete process.env.MEDIA_PUBLIC_BASE_URL
    delete process.env.LOCAL_MEDIA_ROOT
    delete process.env.IMAGE_CDN_BASE_URL
    delete process.env.DISCOGS_API_KEY
    delete process.env.DISCOGS_USERNAME
    delete process.env.DISCOGS_CONSUMER_KEY
    delete process.env.DISCOGS_CONSUMER_SECRET
    delete process.env.DISCOGS_OAUTH_CALLBACK_URL
    delete process.env.DISCOGS_OAUTH_REDIRECT_URI
    delete process.env.DISCOGS_OAUTH_SUCCESS_REDIRECT
    delete process.env.FLICKR_API_KEY
    delete process.env.FLICKR_USER_ID
    delete process.env.GITHUB_ACCESS_TOKEN
    delete process.env.GITHUB_USERNAME
    delete process.env.GITHUB_APP_CLIENT_ID
    delete process.env.GITHUB_APP_CLIENT_SECRET
    delete process.env.GITHUB_OAUTH_CLIENT_ID
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET
    delete process.env.GITHUB_OAUTH_CALLBACK_URL
    delete process.env.GITHUB_OAUTH_REDIRECT_URI
    delete process.env.GITHUB_OAUTH_SUCCESS_REDIRECT
    delete process.env.GOODREADS_API_KEY
    delete process.env.GOODREADS_USER_ID
    delete process.env.GOOGLE_BOOKS_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.INSTAGRAM_ACCESS_TOKEN
    delete process.env.INSTAGRAM_USER_ID
    delete process.env.SPOTIFY_CLIENT_ID
    delete process.env.SPOTIFY_CLIENT_SECRET
    delete process.env.SPOTIFY_REDIRECT_URI
    delete process.env.SPOTIFY_REFRESH_TOKEN
    delete process.env.STEAM_API_KEY
    delete process.env.STEAM_USER_ID
    delete process.env.DEFAULT_WIDGET_USER_ID
    delete process.env.WIDGET_USER_ID_BY_HOSTNAME
    delete process.env.ENABLE_FIRESTORE_TENANT_ROUTING
    delete process.env.INTEGRATION_TOKEN_MASTER_KEY
    delete process.env.FLICKR_API_SECRET
    delete process.env.FLICKR_CONSUMER_SECRET
    delete process.env.FLICKR_OAUTH_CALLBACK_URL
    delete process.env.FLICKR_OAUTH_REDIRECT_URI
    delete process.env.FLICKR_OAUTH_SUCCESS_REDIRECT
  })

  it('detects production mode from NODE_ENV', async () => {
    process.env.NODE_ENV = 'production'
    const { isProductionEnvironment } = await import('./backend-config.js')

    expect(isProductionEnvironment()).toBe(true)
  })

  it('loads local dotenv only outside production', async () => {
    const dotenvConfig = vi.fn()
    vi.doMock('dotenv', () => ({ config: dotenvConfig }))

    const { loadLocalDevelopmentEnv } = await import('./backend-config.js')
    loadLocalDevelopmentEnv('/tmp/test.env')

    expect(dotenvConfig).toHaveBeenCalledWith({ path: '/tmp/test.env' })
  })

  it('skips local dotenv loading in production', async () => {
    process.env.NODE_ENV = 'production'
    const dotenvConfig = vi.fn()
    vi.doMock('dotenv', () => ({ config: dotenvConfig }))

    const { loadLocalDevelopmentEnv } = await import('./backend-config.js')
    loadLocalDevelopmentEnv('/tmp/test.env')

    expect(dotenvConfig).not.toHaveBeenCalled()
  })

  it('tracks whether runtime config was already applied', async () => {
    const {
      hasAppliedRuntimeConfig,
      markRuntimeConfigApplied,
    } = await import('./backend-config.js')

    expect(hasAppliedRuntimeConfig()).toBe(false)
    markRuntimeConfigApplied()
    expect(hasAppliedRuntimeConfig()).toBe(true)
  })

  it('returns normalized client auth config values', async () => {
    process.env.CLIENT_API_KEY = 'api-key'
    process.env.CLIENT_AUTH_DOMAIN = 'project.firebaseapp.com'
    process.env.CLIENT_PROJECT_ID = 'project-id'

    const { getClientAuthConfig } = await import('./backend-config.js')

    expect(getClientAuthConfig()).toEqual({
      apiKey: 'api-key',
      authDomain: 'project.firebaseapp.com',
      projectId: 'project-id',
    })
  })

  it('returns normalized provider config values from env', async () => {
    process.env.DISCOGS_API_KEY = 'discogs-key'
    process.env.DISCOGS_USERNAME = 'discogs-user'
    process.env.FLICKR_API_KEY = 'flickr-key'
    process.env.FLICKR_USER_ID = 'flickr-user'
    process.env.GITHUB_ACCESS_TOKEN = 'github-token'
    process.env.GITHUB_USERNAME = 'github-user'
    process.env.GOODREADS_API_KEY = 'goodreads-key'
    process.env.GOODREADS_USER_ID = 'goodreads-user'
    process.env.GOOGLE_BOOKS_API_KEY = 'google-key'
    process.env.ANTHROPIC_API_KEY = 'anthropic-key'
    process.env.INSTAGRAM_ACCESS_TOKEN = 'ig-token'
    process.env.INSTAGRAM_USER_ID = 'ig-user-id'
    process.env.SPOTIFY_CLIENT_ID = 'spotify-id'
    process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret'
    process.env.SPOTIFY_REDIRECT_URI = 'https://example.com/callback'
    process.env.SPOTIFY_REFRESH_TOKEN = 'spotify-refresh'
    process.env.STEAM_API_KEY = 'steam-key'
    process.env.STEAM_USER_ID = 'steam-user'

    const {
      getDiscogsConfig,
      getFlickrConfig,
      getAiSummaryApiKey,
      getGitHubConfig,
      getGoodreadsConfig,
      getGoogleBooksApiKey,
      getInstagramAccessToken,
      getInstagramUserId,
      getSpotifyConfig,
      getSteamConfig,
    } = await import('./backend-config.js')

    expect(getDiscogsConfig()).toEqual({ apiKey: 'discogs-key', username: 'discogs-user' })
    expect(getFlickrConfig()).toEqual({ apiKey: 'flickr-key', userId: 'flickr-user' })
    expect(getGitHubConfig()).toEqual({ accessToken: 'github-token', username: 'github-user' })
    expect(getGoodreadsConfig()).toEqual({ apiKey: 'goodreads-key', userId: 'goodreads-user' })
    expect(getGoogleBooksApiKey()).toBe('google-key')
    expect(getAiSummaryApiKey()).toBe('anthropic-key')
    expect(getInstagramAccessToken()).toBe('ig-token')
    expect(getInstagramUserId()).toBe('ig-user-id')
    expect(getSpotifyConfig()).toEqual({
      clientId: 'spotify-id',
      clientSecret: 'spotify-secret',
      redirectUri: 'https://example.com/callback',
      refreshToken: 'spotify-refresh',
    })
    expect(getSteamConfig()).toEqual({ apiKey: 'steam-key', userId: 'steam-user' })
  })

  it('returns normalized storage config with development defaults', async () => {
    process.env.NODE_ENV = 'development'

    const { getStorageConfig } = await import('./backend-config.js')
    const storageConfig = getStorageConfig()

    expect(storageConfig.mediaStoreBackend).toBe('disk')
    expect(storageConfig.imageCdnBaseUrl).toBeUndefined()
    expect(storageConfig.mediaPublicBaseUrl).toBeUndefined()
    expect(storageConfig.localMediaRoot.endsWith('tmp/media')).toBe(true)
  })

  it('defaults storage backend to gcs in production when unset', async () => {
    process.env.NODE_ENV = 'production'

    const { getStorageConfig } = await import('./backend-config.js')

    expect(getStorageConfig().mediaStoreBackend).toBe('gcs')
  })

  it('returns normalized storage config with explicit overrides', async () => {
    process.env.NODE_ENV = 'production'
    process.env.CLOUD_STORAGE_IMAGES_BUCKET = 'bucket-name'
    process.env.MEDIA_STORE_BACKEND = 'disk'
    process.env.LOCAL_MEDIA_ROOT = '/tmp/media-root'

    const { getStorageConfig } = await import('./backend-config.js')

    expect(getStorageConfig()).toEqual({
      cloudStorageImagesBucket: 'bucket-name',
      imageCdnBaseUrl: undefined,
      localMediaRoot: '/tmp/media-root',
      mediaPublicBaseUrl: undefined,
      mediaStoreBackend: 'disk',
    })
  })

  it('prefers the provider-neutral public media env var when present', async () => {
    process.env.MEDIA_PUBLIC_BASE_URL = '/api/media/'

    const { getStorageConfig } = await import('./backend-config.js')

    expect(getStorageConfig().mediaPublicBaseUrl).toBe('/api/media/')
    expect(getStorageConfig().imageCdnBaseUrl).toBe('/api/media/')
  })

  it('returns normalized backend path config with env overrides', async () => {
    process.env.DEFAULT_WIDGET_USER_ID = 'custom-user'
    process.env.WIDGET_USER_ID_BY_HOSTNAME = JSON.stringify({
      'api.custom.example': 'custom-user',
      'api.secondary.example': 'secondary-user',
    })

    const { getBackendPathConfig } = await import('./backend-config.js')

    expect(getBackendPathConfig()).toEqual({
      defaultWidgetUserId: 'custom-user',
      widgetUserIdByHostname: {
        'api.custom.example': 'custom-user',
        'api.secondary.example': 'secondary-user',
      },
      firestoreTenantRoutingEnabled: false,
    })
  })

  it('returns an empty default hostname mapping when no overrides are provided', async () => {
    const { getBackendPathConfig } = await import('./backend-config.js')

    expect(getBackendPathConfig()).toEqual({
      defaultWidgetUserId: 'chrisvogt',
      widgetUserIdByHostname: {},
      firestoreTenantRoutingEnabled: false,
    })
  })

  it('enables Firestore tenant routing only when env is exactly true', async () => {
    process.env.ENABLE_FIRESTORE_TENANT_ROUTING = 'true'
    const { getBackendPathConfig } = await import('./backend-config.js')
    expect(getBackendPathConfig().firestoreTenantRoutingEnabled).toBe(true)

    vi.resetModules()
    process.env.ENABLE_FIRESTORE_TENANT_ROUTING = '1'
    const { getBackendPathConfig: getConfig2 } = await import('./backend-config.js')
    expect(getConfig2().firestoreTenantRoutingEnabled).toBe(false)
  })

  it('parses hostname mapping config from comma-separated env values', async () => {
    process.env.WIDGET_USER_ID_BY_HOSTNAME =
      'api.custom.example=custom-user, api.secondary.example=secondary-user'

    const { getBackendPathConfig } = await import('./backend-config.js')

    expect(getBackendPathConfig().widgetUserIdByHostname).toEqual({
      'api.custom.example': 'custom-user',
      'api.secondary.example': 'secondary-user',
    })
  })

  it('filters invalid entries from JSON hostname mapping config', async () => {
    process.env.WIDGET_USER_ID_BY_HOSTNAME = JSON.stringify({
      'api.custom.example': 'custom-user',
      '': 'missing-hostname',
      'api.empty-user.example': '',
      'api.invalid-user.example': 123,
    })

    const { getBackendPathConfig } = await import('./backend-config.js')

    expect(getBackendPathConfig().widgetUserIdByHostname).toEqual({
      'api.custom.example': 'custom-user',
    })
  })

  it('ignores JSON hostname mapping values that are not objects', async () => {
    process.env.WIDGET_USER_ID_BY_HOSTNAME = JSON.stringify(['api.custom.example=custom-user'])

    const { getBackendPathConfig } = await import('./backend-config.js')

    expect(getBackendPathConfig().widgetUserIdByHostname).toEqual({})
  })

  it('ignores malformed entries in comma-separated hostname mapping config', async () => {
    process.env.WIDGET_USER_ID_BY_HOSTNAME =
      'api.custom.example=custom-user, invalid-entry, api.empty-user.example=, =missing-hostname'

    const { getBackendPathConfig } = await import('./backend-config.js')

    expect(getBackendPathConfig().widgetUserIdByHostname).toEqual({
      'api.custom.example': 'custom-user',
    })
  })

  it('parses Flickr OAuth config including consumer secret fallbacks', async () => {
    process.env.FLICKR_API_KEY = 'ck'
    process.env.FLICKR_CONSUMER_SECRET = 'legacy-secret'
    process.env.FLICKR_OAUTH_CALLBACK_URL = 'https://cb'
    process.env.FLICKR_OAUTH_SUCCESS_REDIRECT = ' /done '
    const { getFlickrOAuthConfig } = await import('./backend-config.js')
    expect(getFlickrOAuthConfig()).toMatchObject({
      consumerKey: 'ck',
      consumerSecret: 'legacy-secret',
      callbackUrl: 'https://cb',
      appSuccessRedirect: '/done',
    })
  })

  it('parses Discogs OAuth config from env', async () => {
    process.env.DISCOGS_CONSUMER_KEY = 'dck'
    process.env.DISCOGS_CONSUMER_SECRET = 'dsec'
    process.env.DISCOGS_OAUTH_CALLBACK_URL = 'https://cb/discogs'
    process.env.DISCOGS_OAUTH_SUCCESS_REDIRECT = ' /done-d '
    const { getDiscogsOAuthConfig } = await import('./backend-config.js')
    expect(getDiscogsOAuthConfig()).toMatchObject({
      consumerKey: 'dck',
      consumerSecret: 'dsec',
      callbackUrl: 'https://cb/discogs',
      appSuccessRedirect: '/done-d',
    })
  })

  it('parses GitHub OAuth config from env', async () => {
    process.env.GITHUB_APP_CLIENT_ID = 'ghid'
    process.env.GITHUB_APP_CLIENT_SECRET = 'ghsecret'
    process.env.GITHUB_OAUTH_CALLBACK_URL = 'https://cb/gh'
    process.env.GITHUB_OAUTH_SUCCESS_REDIRECT = ' /gh-ok '
    const { getGitHubOAuthConfig } = await import('./backend-config.js')
    expect(getGitHubOAuthConfig()).toMatchObject({
      clientId: 'ghid',
      clientSecret: 'ghsecret',
      callbackUrl: 'https://cb/gh',
      appSuccessRedirect: '/gh-ok',
    })
  })

  it('getIntegrationTokenMasterKeyBytes throws when unset', async () => {
    const { getIntegrationTokenMasterKeyBytes } = await import('./backend-config.js')
    expect(() => getIntegrationTokenMasterKeyBytes()).toThrow(/not configured/)
  })

  it('getIntegrationTokenMasterKeyBytes throws when decoded key is too short', async () => {
    process.env.INTEGRATION_TOKEN_MASTER_KEY = Buffer.alloc(16, 1).toString('base64')
    const { getIntegrationTokenMasterKeyBytes } = await import('./backend-config.js')
    expect(() => getIntegrationTokenMasterKeyBytes()).toThrow(/at least 32 bytes/)
  })

  it('getIntegrationTokenMasterKeyBytes returns decoded material for valid secrets', async () => {
    process.env.INTEGRATION_TOKEN_MASTER_KEY = Buffer.alloc(32, 2).toString('base64')
    const { getIntegrationTokenMasterKeyBytes } = await import('./backend-config.js')
    expect(getIntegrationTokenMasterKeyBytes()).toEqual(Buffer.alloc(32, 2))
  })

})
