/**
 * Caches which genres a given title belongs to.
 *
 * Watch-history rows record what was watched but not its genres, so filtering
 * the history by genre means asking TMDB about each title. Those answers
 * never change, so one lookup per title per process is enough — without this
 * cache, filtering a few dozen watched titles would mean a few dozen API
 * calls on every single invocation.
 */

import { getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';

const cache = new Map(); // `${type}:${id}` -> number[]

/**
 * Genre IDs for a title, fetched once and remembered.
 *
 * Note the details endpoint returns `genres: [{id, name}]`, unlike the list
 * endpoints which return a bare `genre_ids` array.
 *
 * A failure caches an empty array deliberately: a title TMDB can't resolve
 * (deleted, merged, or a bad id from old history) would otherwise be
 * re-requested on every call forever.
 *
 * @param {'movie'|'tv'} type
 * @param {string|number} tmdbId
 * @returns {Promise<number[]>} genre IDs, or [] if unavailable
 */
export async function getGenreIds(type, tmdbId) {
  const key = `${type}:${String(tmdbId)}`;

  if (cache.has(key)) {
    return cache.get(key);
  }

  try {
    const details = type === 'movie'
      ? await getMovieDetails(tmdbId)
      : await getTVShowDetails(tmdbId);

    const ids = Array.isArray(details?.genres)
      ? details.genres.map(genre => genre.id).filter(id => typeof id === 'number')
      : [];

    cache.set(key, ids);
    return ids;
  } catch (error) {
    console.error(`[GenreCache] Could not resolve genres for ${key}:`, error.message);
    cache.set(key, []);
    return [];
  }
}

/**
 * Does a title belong to a genre? Resolves and caches as needed.
 */
export async function titleHasGenre(type, tmdbId, genreId) {
  if (!genreId) return true;
  const ids = await getGenreIds(type, tmdbId);
  return ids.includes(Number(genreId));
}

/** Test-only: empty the cache. */
export function _resetGenreCache() {
  cache.clear();
}
