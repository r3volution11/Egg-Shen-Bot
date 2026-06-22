import axios from 'axios';
import { config } from '../config.js';

const watchmodeApi = axios.create({
  baseURL: config.apis.watchmode.baseUrl,
});

/**
 * Search for a title in Watchmode
 * @param {string} title - Title to search for
 * @param {string} type - 'movie' or 'tv'
 * @returns {Object|null} First matching result with id, or null if not found
 */
export async function searchWatchmodeTitle(title, type) {
  if (!config.apis.watchmode.apiKey) {
    return null; // API key not configured, skip Watchmode
  }

  try {
    const response = await watchmodeApi.get('/search/', {
      params: {
        apiKey: config.apis.watchmode.apiKey,
        search_field: 'name',
        search_value: title,
        types: type === 'tv' ? 'tv_series' : 'movie',
      },
    });

    const results = response.data.title_results;
    return results && results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Watchmode search error:', error.message);
    return null; // Don't throw, just return null to allow fallback
  }
}

/**
 * Get streaming sources for a title
 * @param {number} watchmodeId - Watchmode title ID
 * @param {string} region - Two-letter country code (e.g., 'US')
 * @returns {Object|null} Streaming sources organized by type
 */
export async function getWatchmodeSources(watchmodeId, region = 'US') {
  if (!config.apis.watchmode.apiKey) {
    return null;
  }

  try {
    const response = await watchmodeApi.get(`/title/${watchmodeId}/sources/`, {
      params: {
        apiKey: config.apis.watchmode.apiKey,
        regions: region,
      },
    });

    const sources = response.data;
    
    // Organize sources by type
    const organized = {
      flatrate: [], // Subscription streaming
      rent: [],     // Rental options
      buy: [],      // Purchase options
    };

    for (const source of sources) {
      const provider = {
        provider_id: source.source_id,
        provider_name: source.name,
        logo_path: source.logo_100, // Watchmode provides logo URL directly
        region: source.region,
      };

      if (source.type === 'sub') {
        organized.flatrate.push(provider);
      } else if (source.type === 'rent') {
        organized.rent.push(provider);
      } else if (source.type === 'buy') {
        organized.buy.push(provider);
      } else if (source.type === 'free') {
        // Free services (ads) go into flatrate
        organized.flatrate.push(provider);
      }
    }

    return organized;
  } catch (error) {
    console.error('Watchmode sources error:', error.message);
    return null;
  }
}

/**
 * Get watch providers for a title using IMDB ID
 * @param {string} imdbId - IMDB ID (e.g., 'tt0090728')
 * @param {string} region - Two-letter country code
 * @returns {Object|null} Streaming sources
 */
export async function getWatchmodeProvidersByImdbId(imdbId, region = 'US') {
  if (!config.apis.watchmode.apiKey || !imdbId) {
    return null;
  }

  try {
    // Watchmode can look up by IMDB ID directly
    const response = await watchmodeApi.get(`/title/${imdbId}/sources/`, {
      params: {
        apiKey: config.apis.watchmode.apiKey,
        regions: region,
      },
    });

    const sources = response.data;
    
    const organized = {
      flatrate: [],
      rent: [],
      buy: [],
    };

    for (const source of sources) {
      const provider = {
        provider_id: source.source_id,
        provider_name: source.name,
        logo_path: source.logo_100,
        region: source.region,
      };

      if (source.type === 'sub') {
        organized.flatrate.push(provider);
      } else if (source.type === 'rent') {
        organized.rent.push(provider);
      } else if (source.type === 'buy') {
        organized.buy.push(provider);
      } else if (source.type === 'free') {
        organized.flatrate.push(provider);
      }
    }

    return organized;
  } catch (error) {
    // If IMDB lookup fails, return null (will fall back to TMDB)
    console.error('Watchmode IMDB lookup error:', error.message);
    return null;
  }
}
