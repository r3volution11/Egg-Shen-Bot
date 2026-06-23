import { config } from '../config.js';

let accessToken = null;
let tokenExpiry = null;

/**
 * Get Spotify access token using Client Credentials flow
 * Tokens are cached and reused until they expire
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const clientId = config.apis.spotify?.clientId;
  const clientSecret = config.apis.spotify?.clientSecret;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify API credentials not configured');
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`Spotify auth failed: ${response.status}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    // Set expiry to 5 minutes before actual expiry for safety
    tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
    
    return accessToken;
  } catch (error) {
    console.error('Error getting Spotify access token:', error);
    throw error;
  }
}

/**
 * Search for soundtrack albums on Spotify
 * @param {string} title - Movie or TV show title
 * @param {string} type - 'movie' or 'tv'
 * @param {number} limit - Maximum results (default 5)
 */
export async function searchSoundtrack(title, type = 'movie', limit = 5) {
  try {
    const token = await getAccessToken();

    // Build search query with keywords to find soundtracks
    const searchTerm = type === 'tv' 
      ? `${title} television soundtrack OR ${title} tv soundtrack OR ${title} original score`
      : `${title} soundtrack OR ${title} original motion picture OR ${title} original score`;

    const params = new URLSearchParams({
      q: searchTerm,
      type: 'album',
      limit: limit.toString(),
      market: 'US', // Use US market for broader availability
    });

    const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify search failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.albums || !data.albums.items || data.albums.items.length === 0) {
      return null;
    }

    // Filter results to prioritize actual soundtracks
    const soundtrackKeywords = [
      'soundtrack',
      'original motion picture',
      'original score',
      'original television',
      'music from',
      'songs from',
    ];

    const filtered = data.albums.items.filter(album => {
      const albumName = album.name.toLowerCase();
      return soundtrackKeywords.some(keyword => albumName.includes(keyword));
    });

    // Return filtered results if we found any, otherwise return all results
    const results = filtered.length > 0 ? filtered : data.albums.items;

    // Return the top result with enhanced metadata
    const topResult = results[0];
    return {
      name: topResult.name,
      artists: topResult.artists.map(a => a.name).join(', '),
      releaseDate: topResult.release_date,
      totalTracks: topResult.total_tracks,
      albumUrl: topResult.external_urls.spotify,
      imageUrl: topResult.images[0]?.url || null,
      albumId: topResult.id,
    };
  } catch (error) {
    console.error('Error searching Spotify:', error);
    return null;
  }
}

/**
 * Get detailed album information including track listing
 * @param {string} albumId - Spotify album ID
 */
export async function getAlbumDetails(albumId) {
  try {
    const token = await getAccessToken();

    const response = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify album fetch failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      name: data.name,
      artists: data.artists.map(a => a.name).join(', '),
      releaseDate: data.release_date,
      totalTracks: data.total_tracks,
      albumUrl: data.external_urls.spotify,
      imageUrl: data.images[0]?.url || null,
      label: data.label,
      tracks: data.tracks.items.map(track => ({
        trackNumber: track.track_number,
        name: track.name,
        duration: formatDuration(track.duration_ms),
        artists: track.artists.map(a => a.name).join(', '),
        previewUrl: track.preview_url,
      })),
    };
  } catch (error) {
    console.error('Error fetching Spotify album details:', error);
    return null;
  }
}

/**
 * Format duration from milliseconds to "m:ss" format
 */
function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Check if Spotify API is configured
 */
export function isConfigured() {
  return !!(config.apis.spotify?.clientId && config.apis.spotify?.clientSecret);
}
