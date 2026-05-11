import spotifyClient from './spotify-client.js'

interface SpotifyTopTracksResponse {
  items?: unknown[]
}

const getTopTracks = async accessToken => {
  const { body } = await spotifyClient<SpotifyTopTracksResponse>('me/top/tracks', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    searchParams: {
      time_range: 'short_term',
      limit: 24
    }
  })
  const { items } = body

  if (!items || items.length === 0) {
    throw new Error('No top tracks returned from Spotify.')
  }
  
  return items
}

export default getTopTracks
