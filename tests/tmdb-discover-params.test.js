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

describe('random page selection respects how many pages exist', () => {
  /** Mock a discover response with a given total_pages. */
  function seedPages(totalPages, resultsPerPage = 20) {
    mockGet.mockImplementation((url, options) => {
      const page = options.params.page;
      if (page > totalPages) {
        return Promise.resolve({ data: { total_pages: totalPages, results: [] } });
      }
      return Promise.resolve({
        data: {
          total_pages: totalPages,
          results: Array.from({ length: resultsPerPage }, (_, i) => ({
            id: page * 100 + i, title: `P${page} #${i}`,
          })),
        },
      });
    });
  }

  test('never asks for a page beyond the result set', async () => {
    // A narrow filter may only have a couple of pages; asking for a random
    // page 1-50 would come back empty most of the time.
    seedPages(2);

    for (let i = 0; i < 25; i++) {
      const result = await tmdb.discoverRandomMovie({ minRating: 9 });
      expect(result).not.toBeNull();
    }

    const requestedPages = mockGet.mock.calls.map(c => c.params?.page ?? c[1].params.page);
    expect(Math.max(...requestedPages)).toBeLessThanOrEqual(2);
  });

  test('a single-page result costs only one request', async () => {
    seedPages(1);

    await tmdb.discoverRandomMovie({ minRating: 9 });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('returns null when the filters match nothing', async () => {
    mockGet.mockResolvedValue({ data: { total_pages: 0, results: [] } });

    expect(await tmdb.discoverRandomMovie({ minRating: 10 })).toBeNull();
  });

  test('still spreads across pages when there are many', async () => {
    seedPages(500);

    const pages = new Set();
    for (let i = 0; i < 30; i++) {
      await tmdb.discoverRandomMovie({});
      const calls = mockGet.mock.calls;
      pages.add(calls[calls.length - 1][1].params.page);
    }

    // Randomness should not collapse to a single page.
    expect(pages.size).toBeGreaterThan(1);
  });

  test('TV uses the same page-aware selection', async () => {
    seedPages(3);

    const result = await tmdb.discoverRandomTV({ genre: '10765' });

    expect(result).not.toBeNull();
    const pagesAsked = mockGet.mock.calls.map(c => c[1].params.page);
    expect(Math.max(...pagesAsked)).toBeLessThanOrEqual(3);
  });
});
