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
 * @returns {Promise<{tmdbId: number, type: 'movie'|'tv', label: string, year: string|null, backdrop_path, poster_path} | null>}
 */
export async function resolveWatchTitle(title) {
  const { title: query, year } = stripTrailingYear(String(title || '').trim());
  if (!query) return null;

  const [movies, shows] = await Promise.all([
    hybridSearch(query, searchMovies, 'movie', getMovieAlternativeTitles).catch(() => []),
    hybridSearch(query, searchTVShows, 'tv', getTVAlternativeTitles).catch(() => []),
  ]);

  // Every exact title match, movies and TV together. It's confident only
  // when that's one title — or the year narrows it to one. Two films and a
  // show all called "Fargo" is a question for a person, not a guess (it
  // used to pick the show, since each list was checked on its own).
  const exact = [
    ...movies.filter(r => pickExactTitleMatch([r], query)).map(r => ({ r, type: 'movie' })),
    ...shows.filter(r => pickExactTitleMatch([r], query)).map(r => ({ r, type: 'tv' })),
  ];
  const sameYear = year ? exact.filter(e => yearOf(e.r) === String(year)) : [];
  const soleMovie = movies.length === 1 && shows.length === 0 ? movies[0] : null;
  const soleTV = shows.length === 1 && movies.length === 0 ? shows[0] : null;

  const winner = sameYear.length === 1 ? sameYear[0]
    : exact.length === 1 ? exact[0]
    : exact.length === 0 && soleMovie ? { r: soleMovie, type: 'movie' }
    : exact.length === 0 && soleTV ? { r: soleTV, type: 'tv' }
    : null;
  if (!winner) return null;

  return {
    tmdbId: winner.r.id,
    type: winner.type,
    label: winner.r.title || winner.r.name,
    year: yearOf(winner.r) || null,
    // The result's own artwork, for when its full image list is empty
    // (titleArtwork.js)
    backdrop_path: winner.r.backdrop_path || null,
    poster_path: winner.r.poster_path || null,
  };
}
