/**
 * Regression tests for TMDB /discover query parameters.
 *
 * TMDB silently ignores query parameters it doesn't recognize rather than
 * erroring, which is how `vote_count_gte` (underscore) sat in place of
 * `vote_count.gte` (dot) without anyone noticing: the minimum-vote guard was
 * simply never applied. Measured against the live API, the broken key
 * matched 20,001 titles for `vote_average.gte=8` — including ones with a
 * handful of votes — while the correct key matches 484.
 *
 * Run with: npm test -- tests/tmdb-discover-params.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { create: () => ({ get: mockGet, post: jest.fn() }) },
}));

let tmdb;

beforeAll(async () => {
  tmdb = await import('../src/services/tmdbService.js');
});

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { results: [{ id: 1, title: 'X' }] } });
});

/** The params object sent with the most recent request. */
function sentParams() {
  return mockGet.mock.calls[0][1].params;
}

describe('the minimum-vote guard actually reaches TMDB', () => {
  test.each([
    ['discoverRandomMovie', 'movie'],
    ['discoverRandomTV', 'tv'],
  ])('%s sends the dotted vote_count.gte key', async (fnName) => {
    await tmdb[fnName]({ minRating: 8 });

    const params = sentParams();
    expect(params['vote_count.gte']).toBe(100);
    // The underscore form is what TMDB silently ignored.
    expect(params.vote_count_gte).toBeUndefined();
  });
});

describe('buildDiscoverParams', () => {
  test('always applies a vote floor, so recommendations avoid 1-vote curios', () => {
    expect(tmdb.buildDiscoverParams('movie')['vote_count.gte']).toBe(50);
  });

  test('uses the right date field for each media type', () => {
    const movie = tmdb.buildDiscoverParams('movie', { decade: '1980' });
    expect(movie['primary_release_date.gte']).toBe('1980-01-01');
    expect(movie['primary_release_date.lte']).toBe('1989-12-31');

    const tv = tmdb.buildDiscoverParams('tv', { decade: '1980' });
    expect(tv['first_air_date.gte']).toBe('1980-01-01');
  });

  test('filters movies by crew but TV by people', () => {
    // TMDB credits a film's director in the crew, but models TV credits as
    // creators and per-episode directors — with_crew finds almost nothing there.
    expect(tmdb.buildDiscoverParams('movie', { personId: 11770 }).with_crew).toBe('11770');
    expect(tmdb.buildDiscoverParams('tv', { personId: 11770 }).with_people).toBe('11770');
  });

  test('omits filters that were not given', () => {
    const params = tmdb.buildDiscoverParams('movie', {});
    expect(params.with_genres).toBeUndefined();
    expect(params.with_crew).toBeUndefined();
    expect(params['primary_release_date.gte']).toBeUndefined();
  });

  test('ignores a non-numeric decade rather than sending a broken range', () => {
    const params = tmdb.buildDiscoverParams('movie', { decade: 'eighties' });
    expect(params['primary_release_date.gte']).toBeUndefined();
  });
});
