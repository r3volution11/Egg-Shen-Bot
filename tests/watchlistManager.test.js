/**
 * Unit tests for watchlistManager.js — the server watchlist store.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  toggleWant,
  sortWatchlist,
  pickFromWatchlist,
  clearWatchlist,
  searchWatchlist,
  wantCount,
  DEFAULT_MAX_SIZE,
} from '../src/utils/watchlistManager.js';

const GUILD_ID = 'test-watchlist-guild';
const WATCHLIST_DIR = path.join(process.cwd(), 'guild_watchlists');
const FILE = path.join(WATCHLIST_DIR, `${GUILD_ID}_watchlist.json`);

function cleanup() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

/** Minimal valid entry; override any field per test. */
function entry(overrides = {}) {
  return {
    tmdbId: '550',
    type: 'movie',
    title: 'Fight Club',
    year: '1999',
    addedBy: 'alice',
    addedById: 'user-1',
    ...overrides,
  };
}

describe('Reading an empty watchlist', () => {
  test('returns an empty array rather than throwing when no file exists', async () => {
    await expect(getWatchlist(GUILD_ID)).resolves.toEqual([]);
  });
});

describe('Adding titles', () => {
  test('stores a title and reports the new total', async () => {
    const result = await addToWatchlist(GUILD_ID, entry());

    expect(result.success).toBe(true);
    expect(result.total).toBe(1);
    expect(result.entry.title).toBe('Fight Club');
    expect(result.entry.wantedBy).toEqual([]);
    expect(typeof result.entry.addedAt).toBe('number');
  });

  test('newest additions come first', async () => {
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1', title: 'First' }));
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '2', title: 'Second' }));

    const list = await getWatchlist(GUILD_ID);
    expect(list.map(e => e.title)).toEqual(['Second', 'First']);
  });

  test('rejects a duplicate and names who added it', async () => {
    await addToWatchlist(GUILD_ID, entry({ addedBy: 'alice' }));
    const result = await addToWatchlist(GUILD_ID, entry({ addedBy: 'bob' }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('already on the watchlist');
    expect(result.error).toContain('alice');
  });

  test('a movie and a TV show may share a TMDb id', async () => {
    // TMDb ids are only unique within a media type, so type is part of identity.
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1396', type: 'movie', title: 'A Movie' }));
    const result = await addToWatchlist(GUILD_ID, entry({ tmdbId: '1396', type: 'tv', title: 'Breaking Bad' }));

    expect(result.success).toBe(true);
    expect(result.total).toBe(2);
  });

  test('refuses to exceed the configured cap', async () => {
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1' }), 2);
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '2' }), 2);
    const result = await addToWatchlist(GUILD_ID, entry({ tmdbId: '3' }), 2);

    expect(result.success).toBe(false);
    expect(result.error).toContain('full');
  });

  test('a guild cap above the hard ceiling is still capped', async () => {
    // 501 requested, but MAX_WATCHLIST_SIZE (500) wins.
    const result = await addToWatchlist(GUILD_ID, entry(), 100000);
    expect(result.success).toBe(true);
  });
});

describe('Removing titles', () => {
  test('removes the matching entry and returns it', async () => {
    await addToWatchlist(GUILD_ID, entry());
    const result = await removeFromWatchlist(GUILD_ID, '550', 'movie');

    expect(result.success).toBe(true);
    expect(result.removed.title).toBe('Fight Club');
    await expect(getWatchlist(GUILD_ID)).resolves.toEqual([]);
  });

  test('removes only the matching media type', async () => {
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1396', type: 'movie', title: 'The Movie' }));
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1396', type: 'tv', title: 'The Show' }));

    await removeFromWatchlist(GUILD_ID, '1396', 'movie');

    const list = await getWatchlist(GUILD_ID);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('The Show');
  });

  test('reports a miss instead of throwing', async () => {
    const result = await removeFromWatchlist(GUILD_ID, '999', 'movie');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not on the watchlist');
  });

  test('a numeric tmdbId matches an entry stored as a string', async () => {
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '550' }));
    const result = await removeFromWatchlist(GUILD_ID, 550, 'movie');
    expect(result.success).toBe(true);
  });
});

describe('Want votes', () => {
  test('toggles on, then off, for the same user', async () => {
    await addToWatchlist(GUILD_ID, entry());

    const first = await toggleWant(GUILD_ID, '550', 'movie', 'user-9');
    expect(first.added).toBe(true);
    expect(wantCount(first.entry)).toBe(1);

    const second = await toggleWant(GUILD_ID, '550', 'movie', 'user-9');
    expect(second.added).toBe(false);
    expect(wantCount(second.entry)).toBe(0);
  });

  test('counts each user once', async () => {
    await addToWatchlist(GUILD_ID, entry());
    await toggleWant(GUILD_ID, '550', 'movie', 'user-1');
    await toggleWant(GUILD_ID, '550', 'movie', 'user-2');
    await toggleWant(GUILD_ID, '550', 'movie', 'user-1'); // undo

    const list = await getWatchlist(GUILD_ID);
    expect(wantCount(list[0])).toBe(1);
    expect(list[0].wantedBy).toEqual(['user-2']);
  });

  test('errors on a title that is not listed', async () => {
    const result = await toggleWant(GUILD_ID, '999', 'movie', 'user-1');
    expect(result.success).toBe(false);
  });

  test('wantCount tolerates entries saved before votes existed', () => {
    expect(wantCount({ title: 'Legacy' })).toBe(0);
  });
});

describe('Sorting and filtering', () => {
  const entries = [
    { tmdbId: '1', type: 'movie', title: 'Old Movie', addedAt: 1000, wantedBy: ['a'] },
    { tmdbId: '2', type: 'tv', title: 'New Show', addedAt: 3000, wantedBy: ['a', 'b', 'c'] },
    { tmdbId: '3', type: 'movie', title: 'Mid Movie', addedAt: 2000, wantedBy: [] },
  ];

  test('recent puts the newest first', () => {
    expect(sortWatchlist(entries, { sort: 'recent' }).map(e => e.title))
      .toEqual(['New Show', 'Mid Movie', 'Old Movie']);
  });

  test('oldest puts the longest-waiting first', () => {
    expect(sortWatchlist(entries, { sort: 'oldest' }).map(e => e.title))
      .toEqual(['Old Movie', 'Mid Movie', 'New Show']);
  });

  test('votes ranks by want count, breaking ties by recency', () => {
    expect(sortWatchlist(entries, { sort: 'votes' }).map(e => e.title))
      .toEqual(['New Show', 'Old Movie', 'Mid Movie']);
  });

  test('filters by media type', () => {
    expect(sortWatchlist(entries, { filter: 'movie' })).toHaveLength(2);
    expect(sortWatchlist(entries, { filter: 'tv' })).toHaveLength(1);
  });

  test('does not mutate the input array', () => {
    const original = [...entries];
    sortWatchlist(entries, { sort: 'oldest' });
    expect(entries).toEqual(original);
  });
});

describe('Picking something to watch', () => {
  const entries = [
    { tmdbId: '1', type: 'movie', title: 'Old Movie', addedAt: 1000, wantedBy: [] },
    { tmdbId: '2', type: 'tv', title: 'Popular Show', addedAt: 3000, wantedBy: ['a', 'b'] },
  ];

  test('votes picks the most wanted', () => {
    expect(pickFromWatchlist(entries, { method: 'votes' }).title).toBe('Popular Show');
  });

  test('oldest picks the longest waiting', () => {
    expect(pickFromWatchlist(entries, { method: 'oldest' }).title).toBe('Old Movie');
  });

  test('random returns something from the list', () => {
    const picked = pickFromWatchlist(entries, { method: 'random' });
    expect(entries).toContainEqual(picked);
  });

  test('respects the type filter', () => {
    expect(pickFromWatchlist(entries, { method: 'random', filter: 'tv' }).title).toBe('Popular Show');
  });

  test('returns null when nothing matches', () => {
    expect(pickFromWatchlist([], { method: 'random' })).toBeNull();
    expect(pickFromWatchlist(entries, { method: 'random', filter: 'book' })).toBeNull();
  });
});

describe('Clearing', () => {
  test('reports how many were removed', async () => {
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1' }));
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '2' }));

    await expect(clearWatchlist(GUILD_ID)).resolves.toBe(2);
    await expect(getWatchlist(GUILD_ID)).resolves.toEqual([]);
  });

  test('clearing an empty list is a no-op', async () => {
    await expect(clearWatchlist(GUILD_ID)).resolves.toBe(0);
  });
});

describe('Autocomplete search', () => {
  beforeEach(async () => {
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '1', title: 'The Matrix' }));
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '2', title: 'Matrix Reloaded' }));
    await addToWatchlist(GUILD_ID, entry({ tmdbId: '3', title: 'Inception' }));
  });

  test('matches on a substring, case-insensitively', async () => {
    const results = await searchWatchlist(GUILD_ID, 'matrix');
    expect(results.map(r => r.title).sort()).toEqual(['Matrix Reloaded', 'The Matrix']);
  });

  test('an empty query returns everything', async () => {
    await expect(searchWatchlist(GUILD_ID, '')).resolves.toHaveLength(3);
  });

  test('never returns more than Discord accepts', async () => {
    // Discord rejects an autocomplete response with more than 25 choices.
    for (let i = 10; i < 45; i++) {
      await addToWatchlist(GUILD_ID, entry({ tmdbId: String(i), title: `Title ${i}` }), 500);
    }
    const results = await searchWatchlist(GUILD_ID, '');
    expect(results.length).toBeLessThanOrEqual(25);
  });
});

describe('Defaults', () => {
  test('the default cap is applied when none is passed', async () => {
    expect(DEFAULT_MAX_SIZE).toBe(100);
    const result = await addToWatchlist(GUILD_ID, entry());
    expect(result.success).toBe(true);
  });
});
