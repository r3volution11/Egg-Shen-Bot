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
 * Build a tournament entry from a *search* result. Search and details
 * responses differ in shape for board games and books (e.g. BGG search has
 * `YearPublished`, details has `yearPublished`), hence the separate
 * `fetchEntryById` below.
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
    entry.year = result.YearPublished;
    entry.posterUrl = result.thumbnail;
    entry.metadata = { minPlayers: result.MinPlayers, maxPlayers: result.MaxPlayers };
  } else if (type === 'book') {
    entry.year = result.volumeInfo?.publishedDate?.split('-')[0];
    entry.posterUrl = result.volumeInfo?.imageLinks?.thumbnail;
    entry.metadata = { authors: result.volumeInfo?.authors, pageCount: result.volumeInfo?.pageCount };
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
