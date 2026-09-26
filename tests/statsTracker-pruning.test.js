/**
 * Tests for statsTracker's raw-row pruning.
 *
 * `stats.searches` grew without bound — nothing pruned it, and `trackSearch`
 * runs on a dozen command paths doing a full read-parse-mutate-write each
 * time. An active guild's commands got steadily slower forever.
 *
 * The pruning has to be invisible to every /stats view, which is the real
 * risk: all-time totals come from incrementally-maintained counters, and only
 * the today/week/month filters re-aggregate the raw rows. So dropping old rows
 * must not move an all-time number.
 *
 * Run with: npm test -- tests/statsTracker-pruning.test.js
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import {
  pruneSearches,
  trackSearch,
  getStats,
  clearStats,
  loadGuildStats,
} from '../src/utils/statsTracker.js';

const GUILD_ID = 'stats-pruning-guild';
const STATS_DIR = process.env.GUILD_STATS_DIR;

/** A row N days old, with everything getStats needs to re-aggregate it. */
function row(daysAgo, overrides = {}) {
  return {
    userId: 'user-1',
    username: 'tester',
    type: 'movie',
    title: 'Fargo',
    year: '1996',
    timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

beforeEach(async () => {
  await clearStats(GUILD_ID).catch(() => {});
});

afterEach(async () => {
  await clearStats(GUILD_ID).catch(() => {});
});

describe('pruneSearches', () => {
  test('keeps rows inside the retention window', () => {
    const rows = [row(1), row(10), row(30)];

    expect(pruneSearches(rows)).toHaveLength(3);
  });

  test('drops rows older than the window', () => {
    const kept = row(10);
    const rows = [row(400), row(90), kept];

    expect(pruneSearches(rows)).toEqual([kept]);
  });

  test('keeps a row just inside the window and drops one just outside', () => {
    const inside = row(34);
    const outside = row(36);

    const result = pruneSearches([outside, inside]);

    expect(result).toEqual([inside]);
  });

  test('caps the row count, keeping the newest', () => {
    // All within the window, so only the row cap can trim these.
    const rows = Array.from({ length: 5200 }, (_, i) => row(1, { title: `Film ${i}` }));

    const result = pruneSearches(rows);

    expect(result).toHaveLength(5000);
    // The newest survive: the last input row must be the last output row.
    expect(result[result.length - 1].title).toBe('Film 5199');
    expect(result[0].title).toBe('Film 200');
  });

  test('keeps rows with an unusable timestamp rather than losing them', () => {
    // Dropping real history over a bad field would be worse than keeping rows
    // the date filters ignore. The row cap still bounds them.
    const rows = [row(1, { timestamp: undefined }), row(1, { timestamp: 'not a date' }), row(1)];

    expect(pruneSearches(rows)).toHaveLength(3);
  });

  test('tolerates a missing or non-array value', () => {
    expect(pruneSearches(undefined)).toEqual([]);
    expect(pruneSearches(null)).toEqual([]);
    expect(pruneSearches('nonsense')).toEqual([]);
  });

  test('does not mutate its input', () => {
    const rows = [row(400), row(1)];

    pruneSearches(rows);

    expect(rows).toHaveLength(2);
  });
});

describe('trackSearch prunes as it writes', () => {
  test('an old row is gone from the stored file', async () => {
    // Seed a file that already carries an ancient row, as a long-running
    // guild's file does today.
    await trackSearch(GUILD_ID, 'user-1', 'tester', 'movie', 'Old Film', '1970');
    const seeded = await loadGuildStats(GUILD_ID);
    seeded.searches[0].timestamp = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(
      path.join(STATS_DIR, `${GUILD_ID}_stats.json`),
      JSON.stringify(seeded, null, 2)
    );

    await trackSearch(GUILD_ID, 'user-1', 'tester', 'movie', 'New Film', '2024');

    const stats = await loadGuildStats(GUILD_ID);
    expect(stats.searches.map(s => s.title)).toEqual(['New Film']);
  });
});

describe('pruning does not change what /stats reports', () => {
  test('all-time totals survive the rows being pruned', async () => {
    // The all-time view reads the incremental counters, never the raw rows —
    // this is what makes pruning safe, so pin it.
    await trackSearch(GUILD_ID, 'user-1', 'tester', 'movie', 'Fargo', '1996');
    await trackSearch(GUILD_ID, 'user-1', 'tester', 'movie', 'Fargo', '1996');
    await trackSearch(GUILD_ID, 'user-2', 'other', 'tv', 'Twin Peaks', '1990');

    // Age every row out of the window, then write it back.
    const stats = await loadGuildStats(GUILD_ID);
    for (const search of stats.searches) {
      search.timestamp = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    }
    await fs.writeFile(
      path.join(STATS_DIR, `${GUILD_ID}_stats.json`),
      JSON.stringify(stats, null, 2)
    );

    // One more call, which prunes all three aged rows.
    await trackSearch(GUILD_ID, 'user-1', 'tester', 'movie', 'Blood Simple', '1984');

    const allTime = await getStats(GUILD_ID, 'all-time');
    expect(allTime.totalSearches).toBe(4);
    expect(allTime.topMovies.find(m => m.name === 'Fargo (1996)').count).toBe(2);
    expect(allTime.topShows.find(s => s.name === 'Twin Peaks (1990)').count).toBe(1);
    expect(allTime.userStats['user-2'].shows).toBe(1);
  });

  test('the month view still sees everything inside its own window', async () => {
    // Retention is deliberately longer than the longest filter, so no filtered
    // view can ever be short a row.
    await trackSearch(GUILD_ID, 'user-1', 'tester', 'movie', 'Fargo', '1996');

    const monthly = await getStats(GUILD_ID, 'month');
    expect(monthly.totalSearches).toBe(1);
  });
});
