/**
 * The "Streaming Availability" field on /movie, /tv, /random and the search
 * picker's detail card (all built by createDetailedEmbed).
 *
 * Two things went wrong here:
 * - TMDB's free and free-with-ads services (Tubi, Pluto, Roku Channel…) are
 *   kept only in `free`, which the field never read, so they never appeared.
 * - "AMC Plus Apple TV channel" (TMDB's casing) missed the exact-case name
 *   map and showed up beside the AMC+ it duplicates.
 *
 * The providers below are TMDB's real US response for Session 9 (10972),
 * shaped the way getMovieWatchProviders/mergeWatchProviders return it.
 *
 * Run with: npx jest tests/streaming-availability-embed.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { createDetailedEmbed } from '../src/utils/embedBuilder.js';

const p = (provider_name) => ({ provider_name });

const SESSION_9 = {
  link: 'https://www.themoviedb.org/movie/10972-session-9/watch?locale=US',
  flatrate: ['Philo', 'AMC Plus Apple TV channel', 'AMC+ Amazon Channel', 'AMC+'].map(p),
  rent: ['Amazon Video', 'Apple TV Store', 'Google Play Movies', 'YouTube', 'Fandango At Home'].map(p),
  buy: ['Amazon Video', 'Apple TV Store', 'Google Play Movies', 'YouTube', 'Fandango At Home'].map(p),
  free: [],
};

async function streamingField(watchProviders) {
  const data = {
    tmdb: { title: 'Session 9', release_date: '2001-08-10', runtime: 100, genres: [] },
    urls: {},
  };
  const response = await createDetailedEmbed(data, 'movie', null, null, watchProviders);
  const fields = response.embeds[0].toJSON().fields || [];
  return fields.find(f => f.name === '📺 Streaming Availability')?.value;
}

const lines = (value) => value.split('\n').filter(Boolean);

describe('Streaming Availability field', () => {
  test('Session 9: the AMC+ channels collapse into one AMC+', async () => {
    const value = await streamingField(SESSION_9);
    expect(lines(value)[0]).toBe('**Stream:** Philo • AMC+');
    expect(lines(value)[1]).toBe('**Rent:** Amazon • Apple TV • Google Play • YouTube • Fandango');
  });

  test("TMDB's free services are shown on their own line", async () => {
    const value = await streamingField({
      ...SESSION_9,
      free: ['Tubi TV', 'Pluto TV'].map(p),
    });
    expect(lines(value)).toContain('**Free:** Tubi TV • Pluto TV');
    expect(lines(value)[0]).toBe('**Stream:** Philo • AMC+');
  });

  test("Watchmode's free services (in both flatrate and free) are listed once, as free", async () => {
    const value = await streamingField({
      ...SESSION_9,
      flatrate: [...SESSION_9.flatrate, p('Tubi TV')],
      free: [p('Tubi TV')],
    });
    expect(lines(value)[0]).toBe('**Stream:** Philo • AMC+');
    expect(lines(value)[1]).toBe('**Free:** Tubi TV');
  });

  test('a title only free somewhere still gets the field, with no empty Stream line', async () => {
    const value = await streamingField({ link: null, flatrate: [], rent: [], buy: [], free: [p('Tubi TV')] });
    expect(value).toBe('**Free:** Tubi TV');
  });
});
