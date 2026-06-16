import axios from 'axios';
import { config } from '../config.js';

const rawgApi = axios.create({
  baseURL: config.apis.rawg.baseUrl,
  params: {
    key: config.apis.rawg.apiKey,
  },
});

/**
 * Search for games
 */
export async function searchGames(query) {
  try {
    const response = await rawgApi.get('/games', {
      params: { 
        search: query,
        page_size: 5,
      },
    });
    return response.data.results.slice(0, 20); // Return top 20 results (commands will slice based on guild config)
  } catch (error) {
    console.error('RAWG game search error:', error.message);
    throw new Error('Failed to search for games');
  }
}

/**
 * Get detailed game information
 */
export async function getGameDetails(gameId) {
  try {
    const response = await rawgApi.get(`/games/${gameId}`);
    return response.data;
  } catch (error) {
    console.error('RAWG game details error:', error.message);
    throw new Error('Failed to get game details');
  }
}

/**
 * Discover a random game with optional filters
 * @param {Object} filters - Optional filters
 * @param {string} filters.genres - Comma-separated genre IDs (e.g., '3' for Adventure, '4' for Action)
 * @param {number} filters.minRating - Minimum rating (1-5)
 * @param {string} filters.platforms - Platform IDs (e.g., '4' for PC, '1' for Xbox, '2' for PlayStation)
 * @returns {Promise<Object>} Random game details
 */
export async function discoverRandomGame(filters = {}) {
  try {
    // RAWG API parameters
    const params = {
      page_size: 40, // Get more results for better randomization
      ordering: '-rating', // Order by rating (high to low)
    };

    // Apply genre filter if provided
    if (filters.genres) {
      params.genres = filters.genres;
    }

    // Apply platform filter if provided
    if (filters.platforms) {
      params.platforms = filters.platforms;
    }

    // Apply minimum rating filter if provided
    if (filters.minRating) {
      params.metacritic = `${filters.minRating * 20},100`; // Convert 1-5 to 20-100 scale
    }

    // Get random page (1-5 to stay within relevant results)
    const randomPage = Math.floor(Math.random() * 5) + 1;
    params.page = randomPage;

    const response = await rawgApi.get('/games', { params });

    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('No games found matching the specified filters');
    }

    // Pick a random game from the results
    const randomIndex = Math.floor(Math.random() * response.data.results.length);
    const game = response.data.results[randomIndex];

    // Get full details for the selected game
    return await getGameDetails(game.id);
  } catch (error) {
    console.error('RAWG random game discovery error:', error.message);
    throw new Error(error.message || 'Failed to discover random game');
  }
}

/**
 * Get similar/related games
 * @param {number} gameId - RAWG game ID
 * @returns {Promise<Array>} Array of similar games
 */
export async function getSimilarGames(gameId) {
  try {
    // RAWG provides game series and developers for similarity
    const gameDetails = await getGameDetails(gameId);
    
    // Use genres and tags to find similar games
    const genreIds = gameDetails.genres?.map(g => g.id).join(',');
    const tagIds = gameDetails.tags?.slice(0, 3).map(t => t.id).join(',');
    
    const params = {
      genres: genreIds,
      tags: tagIds,
      page_size: 10,
      ordering: '-rating',
      exclude_additions: true,
    };

    const response = await rawgApi.get('/games', { params });
    
    // Filter out the original game and return top results
    return response.data.results
      .filter(game => game.id !== gameId)
      .slice(0, 10);
  } catch (error) {
    console.error('RAWG similar games error:', error.message);
    throw new Error('Failed to get similar games');
  }
}
