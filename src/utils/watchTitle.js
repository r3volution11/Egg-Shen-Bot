/**
 * Which movie or show a title means, when it can be said with confidence.
 *
 * Lifted from `/timer title`'s lookup so the event-request streaming line
 * (eventStreaming.js) and the timer share one matcher. Confident means: one
 * exact title match across movies and TV (a trailing "(2017)" breaks ties),
 * or the only result there is. Anything else is null — a caller must never
 * guess, because a wrong "streaming on" line is worse than none.
 */

import { searchMovies, searchTVShows, getMovieAlternativeTitles, getTVAlternativeTitles } from '../services/tmdbService.js';
import { hybridSearch, pickExactTitleMatch } from '../services/aiService.js';
import { stripTrailingYear } from './episodeRangeParser.js';

const yearOf = (r) => String(r?.release_date || r?.first_air_date || '').slice(0, 4);

/**
 * @param {string} title - as typed, e.g. "Tragedy Girls (2017)"
 * @returns {Promise<{tmdbId: number, type: 'movie'|'tv', label: string, year: string|null} | null>}
 */
export async function resolveWatchTitle(title) {
  const { title: query, year } = stripTrailingYear(String(title || '').trim());
  if (!query) return null;

  const [movies, shows] = await Promise.all([
    hybridSearch(query, searchMovies, 'movie', getMovieAlternativeTitles).catch(() => []),
    hybridSearch(query, searchTVShows, 'tv', getTVAlternativeTitles).catch(() => []),
  ]);

  let exactMovie = pickExactTitleMatch(movies, query, year);
  let exactTV = pickExactTitleMatch(shows, query, year);
  // Both a movie and a show by that name ("Fargo"): a year that fits only
  // one of them settles it
  if (exactMovie && exactTV && year) {
    if (yearOf(exactMovie) === String(year) && yearOf(exactTV) !== String(year)) exactTV = null;
    else if (yearOf(exactTV) === String(year) && yearOf(exactMovie) !== String(year)) exactMovie = null;
  }
  const soleMovie = movies.length === 1 && shows.length === 0 ? movies[0] : null;
  const soleTV = shows.length === 1 && movies.length === 0 ? shows[0] : null;

  const winner = (exactMovie && !exactTV) ? { r: exactMovie, type: 'movie' }
    : (exactTV && !exactMovie) ? { r: exactTV, type: 'tv' }
    : soleMovie ? { r: soleMovie, type: 'movie' }
    : soleTV ? { r: soleTV, type: 'tv' }
    : null;
  if (!winner) return null;

  return {
    tmdbId: winner.r.id,
    type: winner.type,
    label: winner.r.title || winner.r.name,
    year: yearOf(winner.r) || null,
  };
}
