/**
 * Focused coverage for createDetailedEmbed's "Also Known As" field, added
 * so a movie/show whose TMDB title of record is obscure (e.g. "Day of the
 * Woman" (1978), better known as "I Spit on Your Grave") shows its
 * well-known alternate title once a result has been found, not just when
 * searching for it (see aiService.promoteAlternativeTitleMatch for the
 * search-ranking half of this fix).
 *
 * Run with: npx jest tests/services/embedBuilder.test.js --verbose
 */

import { createDetailedEmbed } from '../../src/utils/embedBuilder.js';

function baseMovieData(overrides = {}) {
  return {
    tmdb: { title: 'Day of the Woman', release_date: '1978-11-02', overview: 'A woman seeks revenge.' },
    omdb: null,
    trakt: null,
    letterboxd: null,
    urls: { imdb: 'https://imdb.com/title/tt0077713' },
    ...overrides,
  };
}

describe('createDetailedEmbed — Also Known As field', () => {
  test('adds an "Also Known As" field when knownAs is provided', async () => {
    const data = baseMovieData({ knownAs: 'I Spit on Your Grave' });

    const response = await createDetailedEmbed(data, 'movie');

    const field = response.embeds[0].data.fields.find(f => f.name === 'Also Known As');
    expect(field).toBeDefined();
    expect(field.value).toBe('I Spit on Your Grave');
  });

  test('omits the field entirely when knownAs is null', async () => {
    const data = baseMovieData({ knownAs: null });

    const response = await createDetailedEmbed(data, 'movie');

    const field = response.embeds[0].data.fields?.find(f => f.name === 'Also Known As');
    expect(field).toBeUndefined();
  });

  test('omits the field when knownAs is not provided at all (backward compatible)', async () => {
    const data = baseMovieData();
    delete data.knownAs;

    const response = await createDetailedEmbed(data, 'movie');

    const field = response.embeds[0].data.fields?.find(f => f.name === 'Also Known As');
    expect(field).toBeUndefined();
  });

  test('still sets the title to the primary TMDB title, not knownAs', async () => {
    const data = baseMovieData({ knownAs: 'I Spit on Your Grave' });

    const response = await createDetailedEmbed(data, 'movie');

    expect(response.embeds[0].data.title).toBe('Day of the Woman (1978)');
  });

  test('works the same way for TV shows (name field, knownAs still supported)', async () => {
    const data = {
      tmdb: { name: 'Original Show Name', first_air_date: '2020-01-01' },
      omdb: null,
      trakt: null,
      letterboxd: null,
      urls: { imdb: 'https://imdb.com/title/tt1234567' },
      knownAs: 'Better Known Title',
    };

    const response = await createDetailedEmbed(data, 'tv');

    const field = response.embeds[0].data.fields.find(f => f.name === 'Also Known As');
    expect(field.value).toBe('Better Known Title');
  });
});
