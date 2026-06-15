import axios from 'axios';
import { config } from '../config.js';

const traktApi = axios.create({
  baseURL: config.apis.trakt.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': config.apis.trakt.clientId,
  },
});

/**
 * Search for movies on Trakt
 */
export async function searchMoviesOnTrakt(query) {
  try {
    const response = await traktApi.get('/search/movie', {
      params: { query },
    });
    return response.data;
  } catch (error) {
    console.error('Trakt movie search error:', error.message);
    return null;
  }
}

/**
 * Search for TV shows on Trakt
 */
export async function searchShowsOnTrakt(query) {
  try {
    const response = await traktApi.get('/search/show', {
      params: { query },
    });
    return response.data;
  } catch (error) {
    console.error('Trakt TV search error:', error.message);
    return null;
  }
}

/**
 * Get movie ratings from Trakt by IMDb ID
 */
export async function getMovieRating(imdbId) {
  if (!imdbId) return null;
  
  try {
    const response = await traktApi.get(`/movies/${imdbId}/ratings`);
    return response.data;
  } catch (error) {
    console.error('Trakt movie rating error:', error.message);
    return null;
  }
}

/**
 * Get TV show ratings from Trakt by IMDb ID or Trakt slug
 */
export async function getShowRating(identifier) {
  if (!identifier) return null;
  
  try {
    const response = await traktApi.get(`/shows/${identifier}/ratings`);
    return response.data;
  } catch (error) {
    console.error('Trakt show rating error:', error.message);
    return null;
  }
}

/**
 * Get episode ratings from Trakt
 */
export async function getEpisodeRating(showId, season, episode) {
  if (!showId) return null;
  
  try {
    const response = await traktApi.get(
      `/shows/${showId}/seasons/${season}/episodes/${episode}/ratings`
    );
    return response.data;
  } catch (error) {
    console.error('Trakt episode rating error:', error.message);
    return null;
  }
}
