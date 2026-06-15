import axios from 'axios';
import { config } from '../config.js';

/**
 * Search for a movie or TV show on OMDB
 */
export async function getOMDBData(imdbId) {
  if (!imdbId) return null;
  
  try {
    const response = await axios.get(config.apis.omdb.baseUrl, {
      params: {
        apikey: config.apis.omdb.apiKey,
        i: imdbId,
        plot: 'short',
      },
    });
    
    if (response.data.Response === 'False') {
      console.warn('OMDB returned error:', response.data.Error);
      return null;
    }
    
    return response.data;
  } catch (error) {
    console.error('OMDB API error:', error.message);
    return null;
  }
}

/**
 * Extract ratings from OMDB response
 */
export function extractOMDBRatings(omdbData) {
  if (!omdbData || !omdbData.Ratings) {
    return {
      imdb: null,
      rottenTomatoes: { critics: null, audience: null },
    };
  }
  
  const ratings = {
    imdb: omdbData.imdbRating !== 'N/A' ? omdbData.imdbRating : null,
    rottenTomatoes: { critics: null, audience: null },
  };
  
  // Parse Rotten Tomatoes ratings
  omdbData.Ratings.forEach(rating => {
    if (rating.Source === 'Rotten Tomatoes') {
      ratings.rottenTomatoes.critics = rating.Value;
    }
  });
  
  // Note: OMDB doesn't provide audience score; we'd need to scrape or use another source
  
  return ratings;
}
