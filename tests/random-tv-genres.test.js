/**
 * Regression test: /random's TV genre choices must be genres TMDB actually
 * has for television.
 *
 * Movie and TV have separate taxonomies, and two movie-only IDs — Horror (27)
 * and Romance (10749) — had been copied into the TV list. TMDB returns an
 * empty result set for them rather than an error, so `/random tv genre:Horror`
 * silently produced nothing on a server whose whole theme is horror.
 *
 * The valid list below is TMDB's /genre/tv/list as of 2026-09.
 *
 * Run with: npm test -- tests/random-tv-genres.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { data } from '../src/commands/random.js';

// TMDB /genre/tv/list
const VALID_TV_GENRE_IDS = new Set([
  '10759', '16', '35', '80', '99', '18', '10751', '10762',
  '9648', '10763', '10764', '10765', '10766', '10767', '10768', '37',
]);

// TMDB /genre/movie/list
const VALID_MOVIE_GENRE_IDS = new Set([
  '28', '12', '16', '35', '80', '99', '18', '10751', '14', '36',
  '27', '10402', '9648', '10749', '878', '10770', '53', '10752', '37',
]);

/** Genre choices offered by a /random subcommand. */
function genreChoices(subcommandName) {
  const json = data.toJSON();
  const sub = json.options.find(o => o.name === subcommandName);
  const genre = sub?.options?.find(o => o.name === 'genre');
  return genre?.choices || [];
}

describe('/random tv genre choices', () => {
  const choices = genreChoices('tv');

  test('offers some genres at all', () => {
    expect(choices.length).toBeGreaterThan(0);
  });

  test.each(choices.map(c => [c.name, c.value]))(
    '%s (%s) is a real TV genre',
    (_name, value) => {
      expect(VALID_TV_GENRE_IDS.has(value)).toBe(true);
    }
  );

  test('does not offer the movie-only genres that returned nothing', () => {
    const values = choices.map(c => c.value);
    expect(values).not.toContain('27');    // Horror — movies only
    expect(values).not.toContain('10749'); // Romance — movies only
  });
});

describe('/random movie genre choices', () => {
  const choices = genreChoices('movie');

  test.each(choices.map(c => [c.name, c.value]))(
    '%s (%s) is a real movie genre',
    (_name, value) => {
      expect(VALID_MOVIE_GENRE_IDS.has(value)).toBe(true);
    }
  );

  test('still offers Horror and Romance, which movies do have', () => {
    const values = choices.map(c => c.value);
    expect(values).toContain('27');
    expect(values).toContain('10749');
  });
});
