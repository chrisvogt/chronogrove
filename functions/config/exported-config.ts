/**
 * Maps firebase functions:config:export JSON paths to process.env names.
 */
export const CONFIG_PATH_TO_ENV: Record<string, string> = {
  'auth.client_api_key': 'CLIENT_API_KEY',
  'auth.client_auth_domain': 'CLIENT_AUTH_DOMAIN',
  'auth.client_project_id': 'CLIENT_PROJECT_ID',
  'anthropic.api_key': 'ANTHROPIC_API_KEY',
  'storage.firestore_database_url': 'STORAGE_FIRESTORE_DATABASE_URL',
  'storage.cloud_storage_images_bucket': 'CLOUD_STORAGE_IMAGES_BUCKET',
  'storage.image_cdn_base_url': 'IMAGE_CDN_BASE_URL',
  'storage.media_public_base_url': 'MEDIA_PUBLIC_BASE_URL',
  'storage.media_store_backend': 'MEDIA_STORE_BACKEND',
  'storage.local_media_root': 'LOCAL_MEDIA_ROOT',
  'discogs.api_key': 'DISCOGS_API_KEY',
  'discogs.username': 'DISCOGS_USERNAME',
  'discogs.consumer_key': 'DISCOGS_CONSUMER_KEY',
  'discogs.consumer_secret': 'DISCOGS_CONSUMER_SECRET',
  'discogs.oauth_callback_url': 'DISCOGS_OAUTH_CALLBACK_URL',
  'discogs.oauth_success_redirect': 'DISCOGS_OAUTH_SUCCESS_REDIRECT',
  'flickr.api_key': 'FLICKR_API_KEY',
  'flickr.api_secret': 'FLICKR_API_SECRET',
  'flickr.user_id': 'FLICKR_USER_ID',
  'flickr.oauth_callback_url': 'FLICKR_OAUTH_CALLBACK_URL',
  'flickr.oauth_success_redirect': 'FLICKR_OAUTH_SUCCESS_REDIRECT',
  'app.public_app_origin': 'PUBLIC_APP_ORIGIN',
  'steam.api_key': 'STEAM_API_KEY',
  'steam.user_id': 'STEAM_USER_ID',
  'github.access_token': 'GITHUB_ACCESS_TOKEN',
  'github.username': 'GITHUB_USERNAME',
  'github.app_client_id': 'GITHUB_APP_CLIENT_ID',
  'github.app_client_secret': 'GITHUB_APP_CLIENT_SECRET',
  'github.oauth_callback_url': 'GITHUB_OAUTH_CALLBACK_URL',
  'github.oauth_success_redirect': 'GITHUB_OAUTH_SUCCESS_REDIRECT',
  'spotify.client_id': 'SPOTIFY_CLIENT_ID',
  'spotify.client_secret': 'SPOTIFY_CLIENT_SECRET',
  'spotify.redirect_uri': 'SPOTIFY_REDIRECT_URI',
  'spotify.refresh_token': 'SPOTIFY_REFRESH_TOKEN',
  'goodreads.key': 'GOODREADS_API_KEY',
  'goodreads.user_id': 'GOODREADS_USER_ID',
  'instagram.access_token': 'INSTAGRAM_ACCESS_TOKEN',
  'instagram.user_id': 'INSTAGRAM_USER_ID',
  'google.books_api_key': 'GOOGLE_BOOKS_API_KEY',
}

/**
 * Apply exported config (from FUNCTIONS_CONFIG_EXPORT secret) to process.env
 */
export function applyExportedConfigToEnv(data: Record<string, unknown>): void {
  if (!data || typeof data !== 'object') return
  for (const [configPath, envVar] of Object.entries(CONFIG_PATH_TO_ENV)) {
    if (process.env[envVar]) {
      continue
    }
    const value = configPath
      .split('.')
      .reduce((obj: unknown, key: string) => (obj as Record<string, unknown>)?.[key], data)
    if (value != null && typeof value === 'string') {
      process.env[envVar] = value
    }
  }
}
