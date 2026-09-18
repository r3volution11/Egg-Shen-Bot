/**
 * Tests for the recommendation engine's pure aggregation and filtering.
 *
 * The fixtures mirror the real production shape: a guild with ~50 logged
 * watches across ~42 distinct titles, nearly all watched exactly once, plus
 * one title watched many times. That distribution is what makes "most
 * watched" nearly signal-free on a young server, and several behaviors here
 * exist specifically to handle it honestly.
 *
 * Run with: npm test -- tests/recommendationEngine.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGetSimilarMovies = jest.fn();
const mockGetSimilarTV = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getSimilarMovies: mockGetSimilarMovies,
  getSimilarTV: mockGetSimilarTV,
}));

let engine;

beforeAll(async () => {
  engine = await import('../src/utils/recommendationEngine.js');
});

beforeEach(() => {
  mockGetSimilarMovies.mockReset();
  mockGetSimilarTV.mockReset();
});

function entry(overrides = {}) {
  return {
    tmdbId: 1,
    type: 'movie',
    title: 'A Film',
    year: '1999',
    watchedAt: 1_000_000,
    ...overrides,
  };
}

describe('aggregateWatchHistory', () => {
  test('collapses rewatches into a single record with a count', () => {
    const { list, maxCount, repeatCount } = engine.aggregateWatchHistory([
      entry({ tmdbId: 2391, type: 'tv', title: 'Tales from the Crypt', watchedAt: 300 }),
      entry({ tmdbId: 2391, type: 'tv', title: 'Tales from the Crypt', watchedAt: 200 }),
      entry({ tmdbId: 2391, type: 'tv', title: 'Tales from the Crypt', watchedAt: 100 }),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(3);
    expect(list[0].lastWatchedAt).toBe(300); // the most recent, not the last seen
    expect(maxCount).toBe(3);
    expect(repeatCount).toBe(1);
  });

  test('treats a numeric and a string tmdbId as the same title', () => {
    // watched.js stores result.id (number); selectHandler.js stores the
    // string it split out of a customId. Both reach this function.
    const { list } = engine.aggregateWatchHistory([
      entry({ tmdbId: 550 }),
      entry({ tmdbId: '550' }),
    ]);

    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
  });

  test('keeps movies and TV with the same id apart', () => {
    const { list } = engine.aggregateWatchHistory([
      entry({ tmdbId: 100, type: 'movie' }),
      entry({ tmdbId: 100, type: 'tv' }),
    ]);

    expect(list).toHaveLength(2);
  });

  test('reports repeatCount 0 when nothing has been rewatched', () => {
    // The real Shudder shape: dozens of distinct titles, all watched once.
    const entries = Array.from({ length: 42 }, (_, i) =>
      entry({ tmdbId: i + 1, title: `Film ${i + 1}`, watchedAt: i })
    );

    const { repeatCount, maxCount, list } = engine.aggregateWatchHistory(entries);

    expect(list).toHaveLength(42);
    expect(maxCount).toBe(1);
    expect(repeatCount).toBe(0); // callers use this to fall back to "recently watched"
  });

  test('ignores malformed rows rather than throwing', () => {
    const { list } = engine.aggregateWatchHistory([
      entry(),
      null,
      undefined,
      { type: 'movie' }, // no tmdbId
      { tmdbId: 5 }, // no type
      { tmdbId: 6, type: 'boardgame' }, // not a watchable type
    ]);

    expect(list).toHaveLength(1);
  });

  test('handles empty and missing input', () => {
    expect(engine.aggregateWatchHistory([]).list).toEqual([]);
    expect(engine.aggregateWatchHistory(null).list).toEqual([]);
    expect(engine.aggregateWatchHistory(undefined).repeatCount).toBe(0);
  });
});

describe('sortByAffinity / pickSeeds', () => {
  test('ranks by play count, then recency', () => {
    const aggregate = engine.aggregateWatchHistory([
      entry({ tmdbId: 1, title: 'Once Old', watchedAt: 100 }),
      entry({ tmdbId: 2, title: 'Once Recent', watchedAt: 900 }),
      entry({ tmdbId: 3, title: 'Twice', watchedAt: 200 }),
      entry({ tmdbId: 3, title: 'Twice', watchedAt: 300 }),
    ]);

    const titles = engine.sortByAffinity(aggregate.list).map(t => t.title);
    expect(titles).toEqual(['Twice', 'Once Recent', 'Once Old']);
  });

  test('degrades to most-recent-first when everything is tied at one play', () => {
    const aggregate = engine.aggregateWatchHistory([
      entry({ tmdbId: 1, title: 'Oldest', watchedAt: 1 }),
      entry({ tmdbId: 2, title: 'Newest', watchedAt: 3 }),
      entry({ tmdbId: 3, title: 'Middle', watchedAt: 2 }),
    ]);

    expect(engine.sortByAffinity(aggregate.list).map(t => t.title))
      .toEqual(['Newest', 'Middle', 'Oldest']);
  });

  test('pickSeeds caps the seed set', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry({ tmdbId: i + 1, watchedAt: i })
    );
    const aggregate = engine.aggregateWatchHistory(entries);

    expect(engine.pickSeeds(aggregate)).toHaveLength(8);
    expect(engine.pickSeeds(aggregate, 3)).toHaveLength(3);
  });
});

describe('gatherCandidates', () => {
  const seeds = [
    { tmdbId: 1, title: 'Seed One' },
    { tmdbId: 2, title: 'Seed Two' },
  ];

  test('merges results and counts how many seeds surfaced each candidate', async () => {
    mockGetSimilarMovies
      .mockResolvedValueOnce([{ id: 10, title: 'Shared' }, { id: 11, title: 'Only A' }])
      .mockResolvedValueOnce([{ id: 10, title: 'Shared' }, { id: 12, title: 'Only B' }]);

    const candidates = await engine.gatherCandidates(seeds, 'movie');
    const shared = candidates.find(c => c.id === 10);

    expect(candidates).toHaveLength(3);
    expect(shared.seedCount).toBe(2);
    expect(shared.seedTitles).toEqual(['Seed One', 'Seed Two']);
    expect(candidates.find(c => c.id === 11).seedCount).toBe(1);
  });

  test('survives a seed whose lookup throws', async () => {
    // getSimilarMovies throws on error — one bad seed must not lose them all.
    mockGetSimilarMovies
      .mockRejectedValueOnce(new Error('TMDB down'))
      .mockResolvedValueOnce([{ id: 20, title: 'Survivor' }]);

    const candidates = await engine.gatherCandidates(seeds, 'movie');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Survivor');
  });

  test('returns an empty list when every seed fails', async () => {
    mockGetSimilarMovies.mockRejectedValue(new Error('TMDB down'));
    expect(await engine.gatherCandidates(seeds, 'movie')).toEqual([]);
  });

  test('uses the TV endpoint for TV', async () => {
    mockGetSimilarTV.mockResolvedValue([{ id: 30, name: 'A Show' }]);

    await engine.gatherCandidates(seeds, 'tv');

    expect(mockGetSimilarTV).toHaveBeenCalledTimes(2);
    expect(mockGetSimilarMovies).not.toHaveBeenCalled();
  });
});

describe('filters', () => {
  const candidates = [
    { key: 'movie:1', id: 1, genre_ids: [27, 53], release_date: '1985-06-01' },
    { key: 'movie:2', id: 2, genre_ids: [35], release_date: '1995-06-01' },
    { key: 'movie:3', id: 3, release_date: '1988-01-01' }, // no genre_ids at all
  ];

  test('excludeWatched drops titles already in the history', () => {
    const watched = new Set(['movie:2']);
    expect(engine.excludeWatched(candidates, watched).map(c => c.id)).toEqual([1, 3]);
  });

  test('filterByGenre keeps only matches, and drops entries with no genre data', () => {
    expect(engine.filterByGenre(candidates, 27).map(c => c.id)).toEqual([1]);
    expect(engine.filterByGenre(candidates, '27').map(c => c.id)).toEqual([1]);
  });

  test('filterByGenre is a no-op without a genre', () => {
    expect(engine.filterByGenre(candidates, null)).toHaveLength(3);
  });

  test('filterByDecade keeps only titles released in that decade', () => {
    expect(engine.filterByDecade(candidates, '1980').map(c => c.id)).toEqual([1, 3]);
    expect(engine.filterByDecade(candidates, '1990').map(c => c.id)).toEqual([2]);
  });

  test('filterByDecade uses first_air_date for TV', () => {
    const shows = [{ id: 9, first_air_date: '1989-06-10' }];
    expect(engine.filterByDecade(shows, '1980')).toHaveLength(1);
  });

  test('filterByDecade is a no-op without a decade', () => {
    expect(engine.filterByDecade(candidates, null)).toHaveLength(3);
  });
});

describe('scoreCandidates', () => {
  test('prefers candidates that several seeds agreed on', () => {
    const ranked = engine.scoreCandidates([
      { id: 1, seedCount: 1, vote_average: 8.0, vote_count: 1000 },
      { id: 2, seedCount: 4, vote_average: 7.0, vote_count: 1000 },
    ]);

    expect(ranked[0].id).toBe(2); // 4 seeds beats a one-point rating edge
  });

  test('filters out barely-voted titles when there are enough alternatives', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1, seedCount: 1, vote_average: 7, vote_count: 500,
    }));
    const obscure = { id: 99, seedCount: 1, vote_average: 10, vote_count: 2 };

    const ranked = engine.scoreCandidates([obscure, ...many]);

    expect(ranked.find(c => c.id === 99)).toBeUndefined();
  });

  test('relaxes the vote floor rather than returning too little', () => {
    const obscure = [
      { id: 1, seedCount: 1, vote_average: 8, vote_count: 3 },
      { id: 2, seedCount: 1, vote_average: 7, vote_count: 1 },
    ];

    expect(engine.scoreCandidates(obscure)).toHaveLength(2);
  });

  test('is deterministic for a fixed input', () => {
    const input = [
      { id: 1, seedCount: 2, vote_average: 7.5, vote_count: 800 },
      { id: 2, seedCount: 1, vote_average: 8.5, vote_count: 400 },
      { id: 3, seedCount: 3, vote_average: 6.0, vote_count: 200 },
    ];

    const a = engine.scoreCandidates(input).map(c => c.id);
    const b = engine.scoreCandidates(input).map(c => c.id);
    expect(a).toEqual(b);
  });

  test('handles missing rating fields without producing NaN', () => {
    const ranked = engine.scoreCandidates([{ id: 1, seedCount: 1 }]);
    expect(Number.isFinite(ranked[0].score)).toBe(true);
  });
});
