/**
 * iTunes Search API Service
 * Search for movie and TV show soundtracks
 * Free API - no authentication required
 */

const ITUNES_BASE_URL = 'https://itunes.apple.com/search';

/**
 * Search for soundtracks by movie or TV show title
 * @param {string} title - Movie or TV show title
 * @param {string} type - 'movie' or 'tv'
 * @param {number} limit - Maximum number of results (default: 5)
 * @returns {Promise<Array>} Array of soundtrack results
 */
export async function searchSoundtrack(title, type = 'movie', limit = 5) {
  try {
    // Build search query
    // iTunes doesn't differentiate between movie/TV soundtracks well, so we add context
    const searchTerm = type === 'tv' 
      ? `${title} television soundtrack`
      : `${title} soundtrack`;
    
    const params = new URLSearchParams({
      term: searchTerm,
      media: 'music',
      entity: 'album',
      attribute: 'albumTerm',
      limit: limit.toString(),
    });
    
    const response = await fetch(`${ITUNES_BASE_URL}?${params}`);
    
    if (!response.ok) {
      console.error(`iTunes API error: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return [];
    }
    
    // Filter results to focus on soundtracks
    // Look for keywords in collection name
    const soundtrackKeywords = [
      'soundtrack',
      'original motion picture',
      'original score',
      'music from',
      'songs from',
      'original television',
      'original tv',
      'ost',
    ];
    
    const filteredResults = data.results.filter(album => {
      const collectionName = album.collectionName?.toLowerCase() || '';
      return soundtrackKeywords.some(keyword => collectionName.includes(keyword));
    });
    
    // If no filtered results, return all results (user might still find what they want)
    const results = filteredResults.length > 0 ? filteredResults : data.results;
    
    // Map to simplified format
    return results.map(album => ({
      collectionId: album.collectionId,
      collectionName: album.collectionName,
      artistName: album.artistName,
      artworkUrl100: album.artworkUrl100,
      artworkUrl600: album.artworkUrl100?.replace('100x100', '600x600'), // Higher res
      collectionPrice: album.collectionPrice,
      currency: album.currency,
      trackCount: album.trackCount,
      releaseDate: album.releaseDate,
      collectionViewUrl: album.collectionViewUrl,
      primaryGenreName: album.primaryGenreName,
      copyright: album.copyright,
    }));
  } catch (error) {
    console.error('Error searching iTunes:', error);
    return [];
  }
}

/**
 * Get detailed album information including track listing
 * @param {number} collectionId - iTunes collection ID
 * @returns {Promise<Object|null>} Album details with tracks
 */
export async function getAlbumDetails(collectionId) {
  try {
    const params = new URLSearchParams({
      id: collectionId.toString(),
      entity: 'song',
    });
    
    const response = await fetch(`${ITUNES_BASE_URL}?${params}`);
    
    if (!response.ok) {
      console.error(`iTunes API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    // First result is the album, rest are tracks
    const album = data.results[0];
    const tracks = data.results.slice(1).map(track => ({
      trackId: track.trackId,
      trackName: track.trackName,
      trackNumber: track.trackNumber,
      trackTimeMillis: track.trackTimeMillis,
      artistName: track.artistName,
      previewUrl: track.previewUrl,
      trackPrice: track.trackPrice,
      trackViewUrl: track.trackViewUrl,
    }));
    
    return {
      album: {
        collectionId: album.collectionId,
        collectionName: album.collectionName,
        artistName: album.artistName,
        artworkUrl100: album.artworkUrl100,
        artworkUrl600: album.artworkUrl100?.replace('100x100', '600x600'),
        collectionPrice: album.collectionPrice,
        currency: album.currency,
        trackCount: album.trackCount,
        releaseDate: album.releaseDate,
        collectionViewUrl: album.collectionViewUrl,
        primaryGenreName: album.primaryGenreName,
        copyright: album.copyright,
      },
      tracks: tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0)),
    };
  } catch (error) {
    console.error('Error fetching iTunes album details:', error);
    return null;
  }
}

/**
 * Format track duration from milliseconds to mm:ss
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(milliseconds) {
  if (!milliseconds) return '0:00';
  
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
