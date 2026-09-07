/**
 * Tests for the ratings badge row built by embedBuilder.js.
 *
 * Two behaviors matter here and neither is obvious from the code alone:
 *
 * 1. Metacritic rides along in the OMDB payload the bot already fetches, but
 *    only movies carry a Metascore — TV series generally don't. The badge has
 *    to disappear cleanly rather than render "Metacritic: undefined".
 *
 * 2. The Rotten Tomatoes badge is critics-only and must say so. OMDB's RT data
 *    is critics-only (its tomatoes=true tier returns N/A for every audience
 *    field), and no other integrated service carries RT's audience number, so
 *    a bare "Rotten Tomatoes" label would imply a combined score the bot
 *    cannot show.
 */

import { describe, test, expect } from '@jest/globals';
import { createDetailedEmbed } from '../src/utils/embedBuilder.js';

/** Build the minimum shape createDetailedEmbed needs, with OMDB ratings attached. */
function buildData({ ratings = [], imdbRating = '8.0', title = 'Test Title' } = {}) {
  return {
    tmdb: {
      title,
      name: title,
      overview: 'An overview.',
      release_date: '1982-06-25',
      first_air_date: '1982-06-25',
      genres: [],
      vote_average: 8,
    },
    omdb: { Title: title, imdbRating, Ratings: ratings },
    trakt: { rating: 8.17 },
    letterboxd: { rating: 4.1 },
    urls: {
      imdb: 'https://www.imdb.com/title/tt0084787',
      letterboxd: 'https://letterboxd.com/imdb/tt0084787',
      trakt: 'https://trakt.tv/movies/the-thing-1982',
      rottenTomatoes: 'https://www.rottentomatoes.com/m/the_thing',
      justWatch: 'https://www.justwatch.com/us/movie/the-thing',
    },
  };
}

/** Pull the ratings field's text out of a rendered embed. */
async function ratingsRow(data, type = 'movie', services = null) {
  const result = await createDetailedEmbed(data, type, services);
  const embed = result.embeds[0].data ?? result.embeds[0];
  const field = (embed.fields || []).find(f => /rating/i.test(f.name));
  return field ? field.value : '';
}

const RT_CRITICS = { Source: 'Rotten Tomatoes', Value: '85%' };
const METACRITIC = { Source: 'Metacritic', Value: '57/100' };
const IMDB = { Source: 'Internet Movie Database', Value: '8.2/10' };

describe('Metacritic badge', () => {
  test('renders when OMDB returns a Metacritic score', async () => {
    const row = await ratingsRow(buildData({ ratings: [IMDB, RT_CRITICS, METACRITIC] }));
    expect(row).toContain('**Metacritic:** 57/100');
  });

  test('is omitted entirely when there is no Metacritic score', async () => {
    // TV series typically have no Metascore.
    const row = await ratingsRow(buildData({ ratings: [IMDB, RT_CRITICS] }), 'tv');
    expect(row).not.toContain('Metacritic');
    expect(row).not.toContain('undefined');
  });

  test('is omitted when OMDB returns no ratings at all', async () => {
    const row = await ratingsRow(buildData({ ratings: [] }));
    expect(row).not.toContain('Metacritic');
  });

  test('can be disabled per guild without affecting other badges', async () => {
    const data = buildData({ ratings: [IMDB, RT_CRITICS, METACRITIC] });
    const row = await ratingsRow(data, 'movie', {
      imdb: true,
      letterboxd: true,
      trakt: true,
      rottenTomatoes: true,
      metacritic: false,
      justWatch: true,
    });

    expect(row).not.toContain('Metacritic');
    expect(row).toContain('RT Critics');
    expect(row).toContain('IMDb');
  });

  test('renders as plain text, not a broken link', async () => {
    // Metacritic has no reliable ID-based URL scheme, so the badge is
    // deliberately unlinked rather than guessing a slug.
    const row = await ratingsRow(buildData({ ratings: [METACRITIC] }));
    expect(row).toContain('**Metacritic:** 57/100');
    expect(row).not.toMatch(/\[\*\*Metacritic[^\]]*\]\(undefined\)/);
  });
});

describe('Rotten Tomatoes badge is labelled critics-only', () => {
  test('shows "RT Critics" with the score', async () => {
    const row = await ratingsRow(buildData({ ratings: [IMDB, RT_CRITICS] }));
    expect(row).toContain('**RT Critics:** 85%');
  });

  test('still says "RT Critics" when no score is available', async () => {
    // The fallback branch used to read "Rotten Tomatoes", which implies a
    // combined critics+audience score the bot cannot source.
    const row = await ratingsRow(buildData({ ratings: [] }));
    expect(row).toContain('**RT Critics**');
    expect(row).not.toMatch(/\*\*Rotten Tomatoes\*\*/);
  });

  test('never claims to show an audience score', async () => {
    const row = await ratingsRow(buildData({ ratings: [IMDB, RT_CRITICS, METACRITIC] }));
    expect(row).not.toMatch(/audience/i);
  });
});

describe('Badge row composition', () => {
  test('a full payload renders every enabled badge once', async () => {
    const row = await ratingsRow(buildData({ ratings: [IMDB, RT_CRITICS, METACRITIC] }));

    for (const label of ['IMDb', 'Letterboxd', 'Trakt', 'RT Critics', 'Metacritic', 'JustWatch']) {
      expect(row.split(label).length - 1).toBe(1);
    }
  });

  test('badges are separated consistently', async () => {
    const row = await ratingsRow(buildData({ ratings: [IMDB, RT_CRITICS, METACRITIC] }));
    expect(row).toContain(' • ');
  });
});
