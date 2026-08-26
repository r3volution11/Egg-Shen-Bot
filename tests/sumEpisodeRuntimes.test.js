/**
 * Unit tests for tmdbService.js's sumEpisodeRuntimes — sums per-episode
 * runtimes across a range within one season (for multi-episode watch-party
 * timers), falling back to the show's average episode runtime for any
 * episode TMDB doesn't have a specific runtime for, and flagging those as
 * `estimated` rather than silently hiding the gap.
 *
 * Run with: npx jest tests/sumEpisodeRuntimes.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { sumEpisodeRuntimes } from '../src/services/tmdbService.js';

function season(episodes) {
  return { episodes };
}

describe('sumEpisodeRuntimes', () => {
  test('sums real runtimes across a range', () => {
    const seasonDetails = season([
      { episode_number: 4, runtime: 25 },
      { episode_number: 5, runtime: 22 },
      { episode_number: 6, runtime: 22 },
      { episode_number: 7, runtime: 21 },
      { episode_number: 8, runtime: 23 },
      { episode_number: 9, runtime: 20 },
    ]);

    const result = sumEpisodeRuntimes(seasonDetails, 5, 8);

    expect(result.episodeCount).toBe(4);
    expect(result.totalRuntime).toBe(88);
    expect(result.breakdown.every(ep => ep.estimated === false)).toBe(true);
  });

  test('falls back to the show average for an episode with no runtime, and flags it estimated', () => {
    const seasonDetails = season([
      { episode_number: 5, runtime: 22 },
      { episode_number: 6, runtime: 22 },
      { episode_number: 7, runtime: null },
      { episode_number: 8, runtime: 23 },
    ]);

    const result = sumEpisodeRuntimes(seasonDetails, 5, 8, 22);

    expect(result.totalRuntime).toBe(89); // 22 + 22 + 22(fallback) + 23
    const ep7 = result.breakdown.find(ep => ep.episodeNumber === 7);
    expect(ep7).toEqual({ episodeNumber: 7, runtime: 22, estimated: true });
  });

  test('treats a runtime of 0 as missing, not a real zero-length episode', () => {
    const seasonDetails = season([{ episode_number: 5, runtime: 0 }]);
    const result = sumEpisodeRuntimes(seasonDetails, 5, 5, 30);
    expect(result.breakdown[0]).toEqual({ episodeNumber: 5, runtime: 30, estimated: true });
  });

  test('contributes 0 and stays estimated when neither a real nor a fallback runtime exists', () => {
    const seasonDetails = season([{ episode_number: 5, runtime: null }]);
    const result = sumEpisodeRuntimes(seasonDetails, 5, 5, null);
    expect(result.breakdown[0]).toEqual({ episodeNumber: 5, runtime: null, estimated: true });
    expect(result.totalRuntime).toBe(0);
  });

  test('returns null when no episodes in the season fall within the requested range', () => {
    const seasonDetails = season([{ episode_number: 1, runtime: 20 }, { episode_number: 2, runtime: 20 }]);
    expect(sumEpisodeRuntimes(seasonDetails, 10, 12, 20)).toBeNull();
  });

  test('returns null when seasonDetails is null (e.g. TMDB lookup failed)', () => {
    expect(sumEpisodeRuntimes(null, 5, 8, 22)).toBeNull();
  });

  test('returns null when seasonDetails has no episodes array', () => {
    expect(sumEpisodeRuntimes({}, 5, 8, 22)).toBeNull();
  });

  test('handles a range of a single episode', () => {
    const seasonDetails = season([{ episode_number: 5, runtime: 45 }]);
    const result = sumEpisodeRuntimes(seasonDetails, 5, 5, null);
    expect(result.episodeCount).toBe(1);
    expect(result.totalRuntime).toBe(45);
  });

  test('breakdown is sorted by episode number regardless of source order', () => {
    const seasonDetails = season([
      { episode_number: 8, runtime: 23 },
      { episode_number: 5, runtime: 22 },
      { episode_number: 7, runtime: 21 },
      { episode_number: 6, runtime: 22 },
    ]);
    const result = sumEpisodeRuntimes(seasonDetails, 5, 8);
    expect(result.breakdown.map(ep => ep.episodeNumber)).toEqual([5, 6, 7, 8]);
  });
});
