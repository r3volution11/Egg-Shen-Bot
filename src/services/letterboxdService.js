import { getFilm } from 'letterboxd-retriever';

/**
 * Get Letterboxd rating for a film by IMDb ID
 * @param {string} imdbId - IMDb ID (e.g., 'tt0111161')
 * @returns {Promise<Object|null>} Object with rating and ratingCount, or null
 */
export async function getLetterboxdRating(imdbId) {
  if (!imdbId) return null;
  
  try {
    const filmData = await getFilm({ imdbId });
    
    if (!filmData?.ldJson?.aggregateRating) {
      return null;
    }
    
    const { ratingValue, ratingCount } = filmData.ldJson.aggregateRating;
    
    return {
      rating: ratingValue, // Out of 5.0
      ratingCount: ratingCount,
    };
  } catch (error) {
    console.error('Letterboxd rating error:', error.message);
    return null; // Return null on error, don't throw
  }
}
