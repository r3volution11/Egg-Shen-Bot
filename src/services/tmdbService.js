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

/**
 * Discover random movies with optional filters
 * @param {Object} filters - Optional filters { genre, decade, minRating, maxRating }
 * @returns {Object} Random movie result
 */
export async function discoverRandomMovie(filters = {}) {
  try {
    const params = {
      language: 'en-US',
      sort_by: 'popularity.desc',
      include_adult: false,
      include_video: false,
      page: Math.floor(Math.random() * 50) + 1, // Random page 1-50
    };

    if (filters.genre) {
      params.with_genres = filters.genre;
    }
    
    if (filters.decade) {
      const startYear = parseInt(filters.decade);
      params.primary_release_date_gte = `${startYear}-01-01`;
      params.primary_release_date_lte = `${startYear + 9}-12-31`;
    }
    
    if (filters.minRating) {
      params['vote_average.gte'] = parseFloat(filters.minRating);
      params.vote_count_gte = 100; // Ensure sufficient votes
    }
    
    if (filters.maxRating) {
      params['vote_average.lte'] = parseFloat(filters.maxRating);
    }

    const response = await tmdbApi.get('/discover/movie', { params });
    const results = response.data.results;
    
    if (!results || results.length === 0) {
      return null;
    }
    
    // Pick a random movie from the page
    const randomIndex = Math.floor(Math.random() * results.length);
    return results[randomIndex];
  } catch (error) {
    console.error('TMDB discover movie error:', error.message);
    throw new Error('Failed to discover random movie');
  }
}

/**
 * Discover random TV show with optional filters
 * @param {Object} filters - Optional filters { genre, year, minRating, maxRating }
 * @returns {Object} Random TV show result
 */
export async function discoverRandomTV(filters = {}) {
  try {
    const params = {
      language: 'en-US',
      sort_by: 'popularity.desc',
      include_adult: false,
      page: Math.floor(Math.random() * 50) + 1, // Random page 1-50
    };

    if (filters.genre) {
      params.with_genres = filters.genre;
    }
    
    if (filters.year) {
      params.first_air_date_year = parseInt(filters.year);
    }
    
    if (filters.minRating) {
      params['vote_average.gte'] = parseFloat(filters.minRating);
      params.vote_count_gte = 100; // Ensure sufficient votes
    }
    
    if (filters.maxRating) {
      params['vote_average.lte'] = parseFloat(filters.maxRating);
    }

    const response = await tmdbApi.get('/discover/tv', { params });
    const results = response.data.results;
    
    if (!results || results.length === 0) {
      return null;
    }
    
    // Pick a random show from the page
    const randomIndex = Math.floor(Math.random() * results.length);
    return results[randomIndex];
  } catch (error) {
    console.error('TMDB discover TV error:', error.message);
    throw new Error('Failed to discover random TV show');
  }
}

/**
 * Get similar movies
 * @param {string} movieId - TMDB movie ID
 * @returns {Array} Array of similar movies
 */
export async function getSimilarMovies(movieId) {
  try {
    const response = await tmdbApi.get(`/movie/${movieId}/similar`, {
      params: { language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('TMDB similar movies error:', error.message);
    throw new Error('Failed to get similar movies');
  }
}

/**
 * Get similar TV shows
 * @param {string} tvId - TMDB TV show ID
 * @returns {Array} Array of similar TV shows
 */
export async function getSimilarTV(tvId) {
  try {
    const response = await tmdbApi.get(`/tv/${tvId}/similar`, {
      params: { language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('TMDB similar TV error:', error.message);
    throw new Error('Failed to get similar TV shows');
  }
}

/**
 * Get watch providers for a movie
 * @param {string} movieId - TMDB movie ID
 * @param {string} region - ISO 3166-1 country code (default: 'US')
 * @returns {Object} Watch provider data with flatrate, rent, and buy options
 */
export async function getMovieWatchProviders(movieId, region = 'US') {
  try {
    const response = await tmdbApi.get(`/movie/${movieId}/watch/providers`);
    const providers = response.data.results[region];
    
    if (!providers) {
      return null;
    }
    
    return {
      link: providers.link,
      flatrate: providers.flatrate || [], // Streaming services
      rent: providers.rent || [], // Rental options
      buy: providers.buy || [], // Purchase options
    };
  } catch (error) {
    console.error('TMDB movie watch providers error:', error.message);
    return null; // Return null on error, don't throw
  }
}

/**
 * Get watch providers for a TV show
 * @param {string} tvId - TMDB TV show ID
 * @param {string} region - ISO 3166-1 country code (default: 'US')
 * @returns {Object} Watch provider data with flatrate, rent, and buy options
 */
export async function getTVWatchProviders(tvId, region = 'US') {
  try {
    const response = await tmdbApi.get(`/tv/${tvId}/watch/providers`);
    const providers = response.data.results[region];
    
    if (!providers) {
      return null;
    }
    
    return {
      link: providers.link,
      flatrate: providers.flatrate || [], // Streaming services
      rent: providers.rent || [], // Rental options
      buy: providers.buy || [], // Purchase options
    };
  } catch (error) {
    console.error('TMDB TV watch providers error:', error.message);
    return null; // Return null on error, don't throw
  }
}
