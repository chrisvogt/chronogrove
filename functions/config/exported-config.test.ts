import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyExportedConfigToEnv, CONFIG_PATH_TO_ENV } from './exported-config.js'

describe('exported-config', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('CONFIG_PATH_TO_ENV', () => {
    it('includes expected config paths', () => {
      expect(CONFIG_PATH_TO_ENV['github.access_token']).toBe('GITHUB_ACCESS_TOKEN')
      expect(CONFIG_PATH_TO_ENV['auth.client_api_key']).toBe('CLIENT_API_KEY')
      expect(CONFIG_PATH_TO_ENV['spotify.client_id']).toBe('SPOTIFY_CLIENT_ID')
      expect(CONFIG_PATH_TO_ENV['storage.media_store_backend']).toBe('MEDIA_STORE_BACKEND')
      expect(CONFIG_PATH_TO_ENV['storage.local_media_root']).toBe('LOCAL_MEDIA_ROOT')
      expect(CONFIG_PATH_TO_ENV['storage.media_public_base_url']).toBe('MEDIA_PUBLIC_BASE_URL')
      expect(CONFIG_PATH_TO_ENV['flickr.api_secret']).toBe('FLICKR_API_SECRET')
      expect(CONFIG_PATH_TO_ENV['flickr.oauth_callback_url']).toBe('FLICKR_OAUTH_CALLBACK_URL')
      expect(CONFIG_PATH_TO_ENV['discogs.consumer_key']).toBe('DISCOGS_CONSUMER_KEY')
      expect(CONFIG_PATH_TO_ENV['discogs.oauth_callback_url']).toBe('DISCOGS_OAUTH_CALLBACK_URL')
      expect(CONFIG_PATH_TO_ENV['github.app_client_id']).toBe('GITHUB_APP_CLIENT_ID')
      expect(CONFIG_PATH_TO_ENV['github.oauth_callback_url']).toBe('GITHUB_OAUTH_CALLBACK_URL')
      expect(CONFIG_PATH_TO_ENV['anthropic.api_key']).toBe('ANTHROPIC_API_KEY')
    })
  })

  describe('applyExportedConfigToEnv', () => {
    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    it('sets process.env from nested data when value is string', () => {
      const data = {
        github: { access_token: 'secret-token', username: 'myuser' },
        auth: { client_api_key: 'api-key' },
      }
      applyExportedConfigToEnv(data)
      expect(process.env.GITHUB_ACCESS_TOKEN).toBe('secret-token')
      expect(process.env.GITHUB_USERNAME).toBe('myuser')
      expect(process.env.CLIENT_API_KEY).toBe('api-key')
    })

    it('maps Discogs OAuth paths for production FUNCTIONS_CONFIG_EXPORT', () => {
      const data = {
        discogs: {
          consumer_key: 'dck',
          consumer_secret: 'dsec',
          oauth_callback_url: 'https://example.com/api/oauth/discogs/callback',
          oauth_success_redirect: '/discogs-done',
        },
      }
      applyExportedConfigToEnv(data)
      expect(process.env.DISCOGS_CONSUMER_KEY).toBe('dck')
      expect(process.env.DISCOGS_CONSUMER_SECRET).toBe('dsec')
      expect(process.env.DISCOGS_OAUTH_CALLBACK_URL).toBe('https://example.com/api/oauth/discogs/callback')
      expect(process.env.DISCOGS_OAUTH_SUCCESS_REDIRECT).toBe('/discogs-done')
    })

    it('maps GitHub OAuth paths for production FUNCTIONS_CONFIG_EXPORT', () => {
      const data = {
        github: {
          app_client_id: 'ghcid',
          app_client_secret: 'ghsec',
          oauth_callback_url: 'https://example.com/api/oauth/github/callback',
          oauth_success_redirect: '/gh-done',
        },
      }
      applyExportedConfigToEnv(data)
      expect(process.env.GITHUB_APP_CLIENT_ID).toBe('ghcid')
      expect(process.env.GITHUB_APP_CLIENT_SECRET).toBe('ghsec')
      expect(process.env.GITHUB_OAUTH_CALLBACK_URL).toBe('https://example.com/api/oauth/github/callback')
      expect(process.env.GITHUB_OAUTH_SUCCESS_REDIRECT).toBe('/gh-done')
    })

    it('maps Flickr OAuth paths for production FUNCTIONS_CONFIG_EXPORT', () => {
      const data = {
        flickr: {
          api_key: 'k',
          api_secret: 's',
          user_id: 'u',
          oauth_callback_url: 'https://example.com/api/oauth/flickr/callback',
          oauth_success_redirect: '/done',
        },
        app: { public_app_origin: 'https://example.com' },
      }
      applyExportedConfigToEnv(data)
      expect(process.env.FLICKR_API_KEY).toBe('k')
      expect(process.env.FLICKR_API_SECRET).toBe('s')
      expect(process.env.FLICKR_USER_ID).toBe('u')
      expect(process.env.FLICKR_OAUTH_CALLBACK_URL).toBe(
        'https://example.com/api/oauth/flickr/callback'
      )
      expect(process.env.FLICKR_OAUTH_SUCCESS_REDIRECT).toBe('/done')
      expect(process.env.PUBLIC_APP_ORIGIN).toBe('https://example.com')
    })

    it('skips non-string values', () => {
      process.env.GITHUB_ACCESS_TOKEN = 'existing'
      const data = { github: { access_token: 12345 } }
      applyExportedConfigToEnv(data)
      expect(process.env.GITHUB_ACCESS_TOKEN).toBe('existing')
    })

    it('skips when data is null or not an object', () => {
      applyExportedConfigToEnv(null)
      applyExportedConfigToEnv(undefined)
      applyExportedConfigToEnv('string')
      expect(process.env.GITHUB_ACCESS_TOKEN).toBeUndefined()
    })

    it('skips missing paths', () => {
      const data = { github: { username: 'user' } }
      applyExportedConfigToEnv(data)
      expect(process.env.GITHUB_ACCESS_TOKEN).toBeUndefined()
      expect(process.env.GITHUB_USERNAME).toBe('user')
    })

    it('preserves existing env values', () => {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'local-token'
      process.env.INSTAGRAM_USER_ID = 'local-user-id'

      const data = {
        instagram: {
          access_token: 'secret-token',
          user_id: 'secret-user-id',
        },
      }

      applyExportedConfigToEnv(data)

      expect(process.env.INSTAGRAM_ACCESS_TOKEN).toBe('local-token')
      expect(process.env.INSTAGRAM_USER_ID).toBe('local-user-id')
    })
  })
})
