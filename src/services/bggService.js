import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const bggApi = axios.create({
  baseURL: 'https://boardgamegeek.com/xmlapi2',
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Search for board games
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of board game search results
 */
export async function searchBoardGames(query) {
  try {
    const response = await bggApi.get('/search', {
      params: {
        query,
        type: 'boardgame',
      },
    });

    const parsed = xmlParser.parse(response.data);
    
    if (!parsed.items || !parsed.items.item) {
      return [];
    }

    // Ensure item is always an array
    const items = Array.isArray(parsed.items.item) ? parsed.items.item : [parsed.items.item];
    
    // Return top 10 results (commands will slice based on guild config)
    return items.slice(0, 10).map(item => ({
      id: item['@_id'],
      name: item.name?.['@_value'] || 'Unknown',
      yearPublished: item.yearpublished?.['@_value'] || null,
    }));
  } catch (error) {
    console.error('BGG search error:', error.message);
    throw new Error('Failed to search for board games');
  }
}

/**
 * Get detailed board game information
 * @param {number} gameId - BGG game ID
 * @returns {Promise<Object>} Detailed board game info
 */
export async function getBoardGameDetails(gameId) {
  try {
    const response = await bggApi.get('/thing', {
      params: {
        id: gameId,
        stats: 1,
      },
    });

    const parsed = xmlParser.parse(response.data);
    
    if (!parsed.items || !parsed.items.item) {
      throw new Error('Board game not found');
    }

    const item = parsed.items.item;
    
    // Extract primary name
    const names = Array.isArray(item.name) ? item.name : [item.name];
    const primaryName = names.find(n => n['@_type'] === 'primary')?.['@_value'] || names[0]?.['@_value'];
    
    // Extract categories
    const categories = item.link
      ? (Array.isArray(item.link) ? item.link : [item.link])
          .filter(l => l['@_type'] === 'boardgamecategory')
          .map(l => ({ id: l['@_id'], name: l['@_value'] }))
      : [];
    
    // Extract mechanics
    const mechanics = item.link
      ? (Array.isArray(item.link) ? item.link : [item.link])
          .filter(l => l['@_type'] === 'boardgamemechanic')
          .map(l => ({ id: l['@_id'], name: l['@_value'] }))
      : [];
    
    // Extract designers
    const designers = item.link
      ? (Array.isArray(item.link) ? item.link : [item.link])
          .filter(l => l['@_type'] === 'boardgamedesigner')
          .map(l => l['@_value'])
      : [];
    
    // Extract publishers
    const publishers = item.link
      ? (Array.isArray(item.link) ? item.link : [item.link])
          .filter(l => l['@_type'] === 'boardgamepublisher')
          .map(l => l['@_value'])
      : [];

    return {
      id: item['@_id'],
      name: primaryName,
      yearPublished: item.yearpublished?.['@_value'] || null,
      description: item.description || 'No description available.',
      image: item.image || null,
      thumbnail: item.thumbnail || null,
      minPlayers: item.minplayers?.['@_value'] || null,
      maxPlayers: item.maxplayers?.['@_value'] || null,
      playingTime: item.playingtime?.['@_value'] || null,
      minPlayTime: item.minplaytime?.['@_value'] || null,
      maxPlayTime: item.maxplaytime?.['@_value'] || null,
      minAge: item.minage?.['@_value'] || null,
      categories,
      mechanics,
      designers: designers.slice(0, 5), // Limit to 5
      publishers: publishers.slice(0, 5), // Limit to 5
      rating: {
        average: item.statistics?.ratings?.average?.['@_value'] || null,
        bayesAverage: item.statistics?.ratings?.bayesaverage?.['@_value'] || null,
        usersRated: item.statistics?.ratings?.usersrated?.['@_value'] || null,
        rank: item.statistics?.ratings?.ranks?.rank?.['@_value'] || null,
      },
      complexity: item.statistics?.ratings?.averageweight?.['@_value'] || null,
    };
  } catch (error) {
    console.error('BGG details error:', error.message);
    throw new Error('Failed to get board game details');
  }
}

/**
 * Get hot/trending board games for random selection
 * @returns {Promise<Array>} Array of hot board game IDs
 */
async function getHotBoardGames() {
  try {
    const response = await bggApi.get('/hot', {
      params: {
        type: 'boardgame',
      },
    });

    const parsed = xmlParser.parse(response.data);
    
    if (!parsed.items || !parsed.items.item) {
      return [];
    }

    const items = Array.isArray(parsed.items.item) ? parsed.items.item : [parsed.items.item];
    
    return items.map(item => item['@_id']);
  } catch (error) {
    console.error('BGG hot games error:', error.message);
    return [];
  }
}

/**
 * Get a random board game with optional filters
 * @param {Object} filters - Optional filters
 * @param {number} filters.minPlayers - Minimum player count
 * @param {number} filters.maxPlayers - Maximum player count
 * @param {string} filters.category - Category name (e.g., 'Horror', 'Fantasy')
 * @param {number} filters.minRating - Minimum average rating (1-10)
 * @returns {Promise<Object>} Random board game details
 */
export async function getRandomBoardGame(filters = {}) {
  try {
    // Get hot games as a starting point
    const hotGameIds = await getHotBoardGames();
    
    if (hotGameIds.length === 0) {
      throw new Error('No board games available');
    }

    // Pick a random game from hot games
    const randomId = hotGameIds[Math.floor(Math.random() * hotGameIds.length)];
    
    // Get details and check filters
    const game = await getBoardGameDetails(randomId);
    
    // Apply filters
    if (filters.minPlayers && game.minPlayers && parseInt(game.minPlayers) > filters.minPlayers) {
      // Try another random game (simple retry)
      const retryId = hotGameIds[Math.floor(Math.random() * hotGameIds.length)];
      return await getBoardGameDetails(retryId);
    }
    
    if (filters.maxPlayers && game.maxPlayers && parseInt(game.maxPlayers) < filters.maxPlayers) {
      const retryId = hotGameIds[Math.floor(Math.random() * hotGameIds.length)];
      return await getBoardGameDetails(retryId);
    }
    
    if (filters.category) {
      const hasCategory = game.categories.some(c => 
        c.name.toLowerCase().includes(filters.category.toLowerCase())
      );
      if (!hasCategory) {
        const retryId = hotGameIds[Math.floor(Math.random() * hotGameIds.length)];
        return await getBoardGameDetails(retryId);
      }
    }
    
    if (filters.minRating && game.rating.average && parseFloat(game.rating.average) < filters.minRating) {
      const retryId = hotGameIds[Math.floor(Math.random() * hotGameIds.length)];
      return await getBoardGameDetails(retryId);
    }
    
    return game;
  } catch (error) {
    console.error('BGG random game error:', error.message);
    throw new Error('Failed to get random board game');
  }
}

/**
 * Get similar board games based on categories and mechanics
 * @param {number} gameId - BGG game ID
 * @returns {Promise<Array>} Array of similar board games
 */
export async function getSimilarBoardGames(gameId) {
  try {
    const game = await getBoardGameDetails(gameId);
    
    // For BGG, we'll use the hot games list and filter by matching categories
    const hotGameIds = await getHotBoardGames();
    
    const similarGames = [];
    
    // Get details for hot games and compare categories
    for (const id of hotGameIds.slice(0, 20)) {
      if (id === gameId.toString()) continue;
      
      try {
        const otherGame = await getBoardGameDetails(id);
        
        // Check if they share categories
        const sharedCategories = game.categories.filter(c1 =>
          otherGame.categories.some(c2 => c2.id === c1.id)
        );
        
        if (sharedCategories.length > 0) {
          similarGames.push({
            ...otherGame,
            sharedCategories: sharedCategories.length,
          });
        }
        
        if (similarGames.length >= 10) break;
      } catch (err) {
        console.error(`Error fetching game ${id}:`, err.message);
        continue;
      }
    }
    
    // Sort by number of shared categories
    similarGames.sort((a, b) => b.sharedCategories - a.sharedCategories);
    
    return similarGames.slice(0, 10);
  } catch (error) {
    console.error('BGG similar games error:', error.message);
    throw new Error('Failed to get similar board games');
  }
}
