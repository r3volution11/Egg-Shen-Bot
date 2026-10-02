/**
 * Title lookup for tournaments — the one path every way of adding a title
 * goes through: `/bracket manage-titles`, its multi-result picker, and the
 * setup form's import.
 *
 * This used to be written out twice: inline in `bracket.js` for the search,
 * and again in `selectHandler.js` for the picker. The picker's copy then
 * called the groups-only `addGroupTitle`, so every pick in a bracket-mode
 * tournament failed with "Invalid group". Keep lookups here and add titles
 * through `bracketManager.addTitle`, which routes by mode.
 */

import { searchMovies, searchTVShows, getMovieAlternativeTitles, getTVAlternativeTitles, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { searchGames, getGameDetails } from '../services/rawgService.js';
import { searchBoardGames, getBoardGameDetails } from '../services/bggService.js';
import { searchBooks, getBookDetails } from '../services/googleBooksService.js';
import { hybridSearch } from '../services/aiService.js';

export const TITLE_TYPES = ['movie', 'tv', 'game', 'boardgame', 'book'];

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

/**
 * Search the type's API for candidates. Movies and TV go through hybridSearch
 * so tournaments get the same matching as `/movie` and `/tv`.
 * Throws on API failure — callers distinguish that from "no results".
 * @returns {Promise<Array>} Raw search results, best match first
 */
export async function searchTitleCandidates(type, query) {
  switch (type) {
    case 'movie':
      return (await hybridSearch(query, searchMovies, 'movie', getMovieAlternativeTitles)) || [];
    case 'tv':
      return (await hybridSearch(query, searchTVShows, 'tv', getTVAlternativeTitles)) || [];
    case 'game':
      return (await searchGames(query)) || [];
    case 'boardgame':
      return (await searchBoardGames(query)) || [];
    case 'book':
      return (await searchBooks(query)) || [];
    default:
      return [];
  }
}

/**
 * Build a tournament entry from a *search* result, as each service's search
 * function returns it. This read raw-API field names (`YearPublished`,
 * `volumeInfo.publishedDate`) for board games and books, but the services
 * return their own flat shapes (`yearPublished`; `publishedDate`,
 * `thumbnail`), so those entries had no year, cover or authors — on the
 * setup form, and when /bracket manage-titles found exactly one match.
 * BGG's search has no image at all: see completeEntry.
 */
export function buildEntryFromResult(result, type) {
  const entry = {
    type,
    title: result.title || result.name || result.Name || result.volumeInfo?.title || 'Unknown',
    id: result.id ?? null,
    year: null,
    posterUrl: null,
    metadata: {},
  };

  if (type === 'movie') {
    entry.year = result.release_date?.split('-')[0];
    entry.posterUrl = result.poster_path ? `${TMDB_POSTER_BASE}${result.poster_path}` : null;
    entry.metadata = { overview: result.overview, vote_average: result.vote_average };
  } else if (type === 'tv') {
    entry.year = result.first_air_date?.split('-')[0];
    entry.posterUrl = result.poster_path ? `${TMDB_POSTER_BASE}${result.poster_path}` : null;
    entry.metadata = { overview: result.overview, vote_average: result.vote_average };
  } else if (type === 'game') {
    entry.year = result.released?.split('-')[0];
    entry.posterUrl = result.background_image;
    entry.metadata = { rating: result.rating, platforms: result.platforms?.map(p => p.platform.name) };
  } else if (type === 'boardgame') {
    entry.year = result.yearPublished ?? null;
    entry.posterUrl = result.thumbnail ?? null; // not in search results; completeEntry
    entry.metadata = { minPlayers: result.minPlayers, maxPlayers: result.maxPlayers };
  } else if (type === 'book') {
    entry.year = result.publishedDate?.split('-')[0] ?? null;
    entry.posterUrl = result.thumbnail ?? null;
    entry.metadata = { authors: result.authors, pageCount: result.pageCount };
  }

  return entry;
}

/**
 * Build a tournament entry for a title the user picked by id, from the
 * type's *details* endpoint.
 * @returns {Promise<Object|null>} The entry, or null if the lookup found nothing
 */
export async function fetchEntryById(type, id) {
  if (type === 'movie') {
    const result = await getMovieDetails(parseInt(id));
    if (!result) return null;
    return {
      type, title: result.title, id: result.id,
      year: result.release_date?.split('-')[0],
      posterUrl: result.poster_path ? `${TMDB_POSTER_BASE}${result.poster_path}` : null,
      metadata: { overview: result.overview, vote_average: result.vote_average },
    };
  }
  if (type === 'tv') {
    const result = await getTVShowDetails(parseInt(id));
    if (!result) return null;
    return {
      type, title: result.name, id: result.id,
      year: result.first_air_date?.split('-')[0],
      posterUrl: result.poster_path ? `${TMDB_POSTER_BASE}${result.poster_path}` : null,
      metadata: { overview: result.overview, vote_average: result.vote_average },
    };
  }
  if (type === 'game') {
    const result = await getGameDetails(parseInt(id));
    if (!result) return null;
    return {
      type, title: result.name, id: result.id,
      year: result.released?.split('-')[0],
      posterUrl: result.background_image,
      metadata: { rating: result.rating, platforms: result.platforms?.map(p => p.platform.name) },
    };
  }
  if (type === 'boardgame') {
    const result = await getBoardGameDetails(id);
    if (!result) return null;
    return {
      type, title: result.name, id: result.id,
      year: result.yearPublished,
      posterUrl: result.thumbnail,
      metadata: { minPlayers: result.minPlayers, maxPlayers: result.maxPlayers },
    };
  }
  if (type === 'book') {
    const result = await getBookDetails(id);
    if (!result) return null;
    return {
      type, title: result.title, id: result.id,
      year: result.publishedDate?.split('-')[0],
      posterUrl: result.thumbnail,
      metadata: { authors: result.authors, pageCount: result.pageCount },
    };
  }
  return null;
}

/**
 * Fill in what a search result lacks, once a title is settled on. BGG's
 * search returns no image, so a board game added from a search had none;
 * its details lookup has it. Other types come back complete from search.
 * Never fails: on any lookup error the entry is kept as it was.
 * @param {Object} entry - from buildEntryFromResult
 * @returns {Promise<Object>}
 */
export async function completeEntry(entry) {
  if (!entry || entry.posterUrl || entry.type !== 'boardgame' || !entry.id) return entry;
  try {
    const details = await fetchEntryById(entry.type, entry.id);
    return details ? { ...entry, ...details, customImageUrl: entry.customImageUrl } : entry;
  } catch (error) {
    console.error(`[BracketTitles] Couldn't complete ${entry.type} ${entry.id}:`, error.message);
    return entry;
  }
}

export function getTypeLabel(type) {
  const labels = {
    movie: 'Movies',
    tv: 'TV Shows',
    game: 'Video Games',
    boardgame: 'Board Games',
    book: 'Books',
  };
  return labels[type] || type;
}
