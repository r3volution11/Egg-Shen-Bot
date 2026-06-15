import axios from 'axios';
import { config } from '../config.js';

const tmdbApi = axios.create({
  baseURL: config.apis.tmdb.baseUrl,
  params: {
    api_key: config.apis.tmdb.apiKey,
  },
});

/**
 * Search for movies
 */
export async function searchMovies(query) {
  try {
    const response = await tmdbApi.get('/search/movie', {
      params: { query, language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 5); // Return top 5 results
  } catch (error) {
    console.error('TMDB movie search error:', error.message);
    throw new Error('Failed to search for movies');
  }
}

/**
 * Search for TV shows
 */
export async function searchTVShows(query) {
  try {
    const response = await tmdbApi.get('/search/tv', {
      params: { query, language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 5); // Return top 5 results
  } catch (error) {
    console.error('TMDB TV search error:', error.message);
    throw new Error('Failed to search for TV shows');
  }
}

/**
 * Get detailed movie information including external IDs
 */
export async function getMovieDetails(movieId) {
  try {
    const [details, externalIds] = await Promise.all([
      tmdbApi.get(`/movie/${movieId}`, { params: { language: 'en-US' } }),
      tmdbApi.get(`/movie/${movieId}/external_ids`),
    ]);
    
    return {
      ...details.data,
      external_ids: externalIds.data,
    };
  } catch (error) {
    console.error('TMDB movie details error:', error.message);
    throw new Error('Failed to get movie details');
  }
}

/**
 * Get detailed TV show information including external IDs
 */
export async function getTVShowDetails(tvId) {
  try {
    const [details, externalIds] = await Promise.all([
      tmdbApi.get(`/tv/${tvId}`, { params: { language: 'en-US' } }),
      tmdbApi.get(`/tv/${tvId}/external_ids`),
    ]);
    
    return {
      ...details.data,
      external_ids: externalIds.data,
    };
  } catch (error) {
    console.error('TMDB TV details error:', error.message);
    throw new Error('Failed to get TV show details');
  }
}

/**
 * Get season details including all episodes
 */
export async function getSeasonDetails(tvId, seasonNumber) {
  try {
    const response = await tmdbApi.get(
      `/tv/${tvId}/season/${seasonNumber}`,
      { params: { language: 'en-US' } }
    );
    return response.data;
  } catch (error) {
    console.error('TMDB season details error:', error.message);
    return null;
  }
}

/**
 * Get episode details for a specific TV show episode
 */
export async function getEpisodeDetails(tvId, seasonNumber, episodeNumber) {
  try {
    const [details, externalIds] = await Promise.all([
      tmdbApi.get(
        `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
        { params: { language: 'en-US' } }
      ),
      tmdbApi.get(
        `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`
      ).catch(() => ({ data: {} })) // Gracefully handle if external_ids aren't available
    ]);
    
    return {
      ...details.data,
      external_ids: externalIds.data,
    };
  } catch (error) {
    console.error('TMDB episode details error:', error.message);
    throw new Error('Failed to get episode details');
  }
}

/**
 * Search for an episode by name across all seasons of a show
 */
export async function searchEpisodeByName(tvId, episodeName) {
  try {
    console.log(`Searching for episode "${episodeName}" in show ID ${tvId}...`);
    
    // First get show details to know how many seasons
    const showDetails = await getTVShowDetails(tvId);
    
    if (!showDetails || !showDetails.number_of_seasons) {
      console.log('Could not get show details or no seasons found');
      return null;
    }
    
    console.log(`Show has ${showDetails.number_of_seasons} seasons. Searching...`);
    
    // Search through each season
    for (let seasonNum = 1; seasonNum <= showDetails.number_of_seasons; seasonNum++) {
      console.log(`Checking season ${seasonNum}...`);
      const seasonDetails = await getSeasonDetails(tvId, seasonNum);
      
      if (!seasonDetails || !seasonDetails.episodes) {
        console.log(`Season ${seasonNum} has no episodes data`);
        continue;
      }
      
      console.log(`Season ${seasonNum} has ${seasonDetails.episodes.length} episodes`);
      
      // Log first few episode names for debugging
      if (seasonNum === 1) {
        console.log(`First 5 episodes: ${seasonDetails.episodes.slice(0, 5).map(e => e.name).join(', ')}`);
      }
      
      // Search episodes in this season
      const episode = seasonDetails.episodes.find(ep => 
        ep.name && ep.name.toLowerCase().includes(episodeName.toLowerCase())
      );
      
      if (episode) {
        console.log(`Found match: ${episode.name} (S${seasonNum}E${episode.episode_number})`);
        
        // Fetch detailed episode info including external IDs
        const episodeDetails = await getEpisodeDetails(tvId, seasonNum, episode.episode_number);
        
        return {
          ...episodeDetails,
          show: showDetails,
          season_number: seasonNum,
        };
      }
    }
    
    console.log(`No episode found matching "${episodeName}"`);
    return null;
  } catch (error) {
    console.error('TMDB episode search error:', error.message);
    return null;
  }
}

/**
 * Get poster URL
 */
export function getPosterUrl(posterPath, size = 'w500') {
  if (!posterPath) return null;
  return `${config.apis.tmdb.imageBaseUrl}/${size}${posterPath}`;
}

/**
 * Get backdrop URL
 */
export function getBackdropUrl(backdropPath, size = 'w1280') {
  if (!backdropPath) return null;
  return `${config.apis.tmdb.imageBaseUrl}/${size}${backdropPath}`;
}
