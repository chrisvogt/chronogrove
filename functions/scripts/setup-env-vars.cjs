#!/usr/bin/env node

/**
 * Script to set up environment variables for Firebase Functions v2
 * Run this script to set all environment variables from your .runtimeconfig.json
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Environment variable mappings
const envVarMappings = {
  // Auth
  'auth.client_api_key': 'FIREBASE_CLIENT_API_KEY',
  'auth.client_auth_domain': 'FIREBASE_CLIENT_AUTH_DOMAIN',
  'auth.client_project_id': 'FIREBASE_CLIENT_PROJECT_ID',

  // Anthropic (AI summaries)
  'anthropic.api_key': 'ANTHROPIC_API_KEY',
  
  // Storage
  'storage.firestore_database_url': 'STORAGE_FIRESTORE_DATABASE_URL',
  'storage.cloud_storage_images_bucket': 'CLOUD_STORAGE_IMAGES_BUCKET',
  'storage.image_cdn_base_url': 'IMAGE_CDN_BASE_URL',
  'storage.media_public_base_url': 'MEDIA_PUBLIC_BASE_URL',
  'storage.media_store_backend': 'MEDIA_STORE_BACKEND',
  'storage.local_media_root': 'LOCAL_MEDIA_ROOT',
  
  // Discogs
  'discogs.api_key': 'DISCOGS_API_KEY',
  'discogs.username': 'DISCOGS_USERNAME',

  // Flickr
  'flickr.api_key': 'FLICKR_API_KEY',
  'flickr.user_id': 'FLICKR_USER_ID',
  
  // Steam
  'steam.api_key': 'STEAM_API_KEY',
  'steam.user_id': 'STEAM_USER_ID',
  
  // GitHub
  'github.access_token': 'GITHUB_ACCESS_TOKEN',
  'github.username': 'GITHUB_USERNAME',
  
  // Spotify
  'spotify.client_id': 'SPOTIFY_CLIENT_ID',
  'spotify.client_secret': 'SPOTIFY_CLIENT_SECRET',
  'spotify.redirect_uri': 'SPOTIFY_REDIRECT_URI',
  'spotify.refresh_token': 'SPOTIFY_REFRESH_TOKEN',
  
  // Goodreads
  'goodreads.key': 'GOODREADS_API_KEY',
  'goodreads.user_id': 'GOODREADS_USER_ID',
  
  // Instagram
  'instagram.access_token': 'INSTAGRAM_ACCESS_TOKEN',
  
  // Google Books
  'google.books_api_key': 'GOOGLE_BOOKS_API_KEY'
}

function setupEnvVars({ runtimeConfig, execSyncImpl = execSync, log = console.log, warn = console.warn, error = console.error }) {
  log('Setting up environment variables for Firebase Functions v2...\n')

  Object.entries(envVarMappings).forEach(([configPath, envVar]) => {
    const value = configPath.split('.').reduce((obj, key) => obj?.[key], runtimeConfig)
    if (value) {
      try {
        const command = `firebase functions:config:set ${configPath}="${value}"`
        log(`Setting ${envVar}...`)
        execSyncImpl(command, { stdio: 'inherit' })
      } catch (err) {
        error(`Failed to set ${envVar}:`, err.message)
      }
    } else {
      warn(`Warning: No value found for ${configPath}`)
    }
  })

  log('\nEnvironment variables setup complete!')
  log('\nNext steps:')
  log('1. Deploy your functions: firebase deploy --only functions')
  log('2. For local development, create a .env.local file with the same variables')
  log('3. You can now safely delete .runtimeconfig.json if you want')
}

if (require.main === module) {
  const runtimeConfigPath = path.join(__dirname, '..', '.runtimeconfig.json')
  const runtimeConfig = JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8'))
  setupEnvVars({ runtimeConfig })
}

module.exports = { setupEnvVars, envVarMappings } 
