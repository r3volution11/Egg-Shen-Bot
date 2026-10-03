/**
 * Artwork suggestions for an event request (Doug, 2026-10-03): type a
 * title, and the form offers backdrops and posters from TMDB to pick from
 * and crop. It suggests, never chooses — the person clicks one, or ignores
 * them and uploads their own.
 *
 * One confidently-matched title (resolveWatchTitle, the same matcher the
 * where-to-watch line uses) gets all the room. Otherwise the top few
 * candidates each get a row, labelled with their year, so the person picks
 * the right "Fargo" rather than the bot guessing.
 *
 * Backdrops come first: they're 16:9 like a Discord event cover, so they
 * fit with little cropping. Posters are tall and lose most of themselves
 * to a 16:9 crop, so only a couple are offered.
 */

import { searchMovies, searchTVShows, getTitleImages, getBackdropUrl, getPosterUrl } from '../services/tmdbService.js';
import { stripTrailingYear } from './episodeRangeParser.js';
import { resolveWatchTitle } from './watchTitle.js';

export const MAX_TITLES = 3;
const BACKDROPS_ONE = 8; // one confident title
const BACKDROPS_EACH = 4; // several candidates
const POSTERS = 2;

const yearOf = (r) => String(r?.release_date || r?.first_air_date || '').slice(0, 4) || null;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The titles worth showing artwork for: the confident match, or the top few */
async function candidates(title) {
  const match = await resolveWatchTitle(title).catch(() => null);
  if (match) return [match];

  const { title: query, year } = stripTrailingYear(String(title || '').trim());
  if (!query) return [];
  const [movies, shows] = await Promise.all([
    searchMovies(query).catch(() => []),
    searchTVShows(query).catch(() => []),
  ]);
  const all = [
    ...movies.map(r => ({ r, type: 'movie' })),
    ...shows.map(r => ({ r, type: 'tv' })),
  ];
  // Same title first, then the given year, then the most popular
  const score = ({ r }) => (norm(r.title || r.name) === norm(query) ? 2 : 0) + (year && yearOf(r) === String(year) ? 1 : 0);
  return all
    .filter(({ r }) => r.backdrop_path || r.poster_path)
    .sort((a, b) => score(b) - score(a) || (b.r.popularity || 0) - (a.r.popularity || 0))
    .slice(0, MAX_TITLES)
    .map(({ r, type }) => ({ tmdbId: r.id, type, label: r.title || r.name, year: yearOf(r), backdrop_path: r.backdrop_path, poster_path: r.poster_path }));
}

const image = (kind, path) => ({
  kind,
  url: kind === 'backdrop' ? getBackdropUrl(path, 'w1280') : getPosterUrl(path, 'w780'),
  thumb: kind === 'backdrop' ? getBackdropUrl(path, 'w300') : getPosterUrl(path, 'w185'),
});

/**
 * @returns {Promise<{titles: Array<{tmdbId, type, label, year, images: Array<{kind, url, thumb}>}>}>}
 */
export async function findTitleArtwork(title) {
  const titles = await candidates(title);
  const backdropCount = titles.length === 1 ? BACKDROPS_ONE : BACKDROPS_EACH;
  const withImages = await Promise.all(titles.map(async (t) => {
    const found = await getTitleImages(t.type, t.tmdbId);
    // The search result's own artwork, if the images list came back empty
    const backdrops = found.backdrops.length ? found.backdrops : [t.backdrop_path].filter(Boolean);
    const posters = found.posters.length ? found.posters : [t.poster_path].filter(Boolean);
    return {
      tmdbId: t.tmdbId,
      type: t.type,
      label: t.label,
      year: t.year || null,
      images: [
        ...backdrops.slice(0, backdropCount).map(p => image('backdrop', p)),
        ...posters.slice(0, POSTERS).map(p => image('poster', p)),
      ],
    };
  }));
  return { titles: withImages.filter(t => t.images.length) };
}
