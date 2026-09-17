/**
 * Tests for src/utils/timerWatchLog.js — deciding what a finished timer was
 * for, what note to store with it, and which pause hint to show.
 *
 * The important behavior here is that a timer carrying a tmdbId is logged as
 * THAT title. The fallback search concatenates movies ahead of TV and takes
 * the first hit, so a show sharing a name with a movie used to be logged as
 * the wrong title entirely.
 *
 * Run with: npm test -- tests/timerWatchLog.test.js
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { resolveWatchedTitle, buildWatchLogNotes, buildPauseHint } from '../src/utils/timerWatchLog.js';

let tmdb;

beforeEach(() => {
  tmdb = {
    searchMovies: jest.fn().mockResolvedValue([]),
    searchTVShows: jest.fn().mockResolvedValue([]),
    getMovieDetails: jest.fn(),
    getTVShowDetails: jest.fn(),
  };
});

describe('resolveWatchedTitle', () => {
  test('uses the stored tmdbId and skips the search entirely', async () => {
    tmdb.getMovieDetails.mockResolvedValue({ title: 'Juno', release_date: '2007-12-05' });

    const resolved = await resolveWatchedTitle(
      { tmdbId: 620, type: 'movie' },
      'Juno',
      tmdb
    );

    expect(resolved).toEqual({ tmdbId: 620, type: 'movie', details: expect.objectContaining({ title: 'Juno' }) });
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
    expect(tmdb.searchTVShows).not.toHaveBeenCalled();
  });

  test('logs a TV show as the show, not a same-named movie (the old bug)', async () => {
    // "Fargo" is both a 1996 film and a 2014 series. The fallback search puts
    // movies first, so without the stored id the series logged as the film.
    tmdb.getTVShowDetails.mockResolvedValue({ name: 'Fargo', first_air_date: '2014-04-15' });
    tmdb.searchMovies.mockResolvedValue([{ id: 275, title: 'Fargo', release_date: '1996-03-08' }]);
    tmdb.searchTVShows.mockResolvedValue([{ id: 60622, name: 'Fargo', first_air_date: '2014-04-15' }]);

    const resolved = await resolveWatchedTitle({ tmdbId: 60622, type: 'tv' }, 'Fargo', tmdb);

    expect(resolved.type).toBe('tv');
    expect(resolved.tmdbId).toBe(60622);
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
  });

  test('falls back to a search for timers with no stored id (pre-existing timers)', async () => {
    tmdb.searchMovies.mockResolvedValue([{ id: 620, title: 'Juno', release_date: '2007-12-05' }]);
    tmdb.getMovieDetails.mockResolvedValue({ title: 'Juno', release_date: '2007-12-05' });

    const resolved = await resolveWatchedTitle({ label: 'Juno' }, 'Juno', tmdb);

    expect(tmdb.searchMovies).toHaveBeenCalledWith('Juno');
    expect(resolved.tmdbId).toBe(620);
  });

  test('falls back to a search when the stored id no longer resolves', async () => {
    tmdb.getMovieDetails.mockResolvedValue(null); // deleted/merged on TMDB
    tmdb.searchMovies.mockResolvedValue([{ id: 999, title: 'Juno', release_date: '2007-12-05' }]);
    tmdb.getMovieDetails.mockResolvedValueOnce(null).mockResolvedValue({ title: 'Juno' });

    const resolved = await resolveWatchedTitle({ tmdbId: 1, type: 'movie' }, 'Juno', tmdb);

    expect(tmdb.searchMovies).toHaveBeenCalled();
    expect(resolved.tmdbId).toBe(999);
  });

  test('survives a details lookup that throws', async () => {
    tmdb.getMovieDetails.mockRejectedValueOnce(new Error('TMDB down'));
    tmdb.searchMovies.mockResolvedValue([{ id: 620, title: 'Juno' }]);
    tmdb.getMovieDetails.mockResolvedValue({ title: 'Juno' });

    const resolved = await resolveWatchedTitle({ tmdbId: 620, type: 'movie' }, 'Juno', tmdb);

    expect(resolved).not.toBeNull();
  });

  test('never logs board games — watch history has no equivalent', async () => {
    const resolved = await resolveWatchedTitle({ tmdbId: 13, type: 'boardgame' }, 'Catan', tmdb);

    expect(resolved).toBeNull();
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
  });

  test('returns null when nothing matches, so the caller can offer manual logging', async () => {
    const resolved = await resolveWatchedTitle(null, 'Garbled Event Name', tmdb);
    expect(resolved).toBeNull();
  });

  test('returns null for an empty label with no stored id', async () => {
    expect(await resolveWatchedTitle(null, '', tmdb)).toBeNull();
  });
});

describe('buildWatchLogNotes', () => {
  test('records the episode range on a multi-episode party', async () => {
    expect(buildWatchLogNotes('1h 53m', { season: 6, episodeStart: 4, episodeEnd: 7 }))
      .toBe('Watch party timer: 1h 53m • S6 E4-7');
  });

  test('collapses a single-episode range', () => {
    expect(buildWatchLogNotes('26m', { season: 6, episodeStart: 4, episodeEnd: 4 }))
      .toBe('Watch party timer: 26m • S6 E4');
  });

  test('omits the range entirely for a movie', () => {
    expect(buildWatchLogNotes('1h 46m', null)).toBe('Watch party timer: 1h 46m');
  });

  test('keeps the auto-completed suffix ahead of the range', () => {
    expect(buildWatchLogNotes('6h', { season: 2, episodeStart: 1, episodeEnd: 3 }, ' (auto-completed)'))
      .toBe('Watch party timer: 6h (auto-completed) • S2 E1-3');
  });
});

describe('buildPauseHint', () => {
  test('tells multi-episode parties to pause between episodes', () => {
    const hint = buildPauseHint({ type: 'tv', episodeRange: { season: 6, episodeStart: 4, episodeEnd: 7 } });
    expect(hint).toContain('several episodes');
    expect(hint).toContain('/timer pause');
  });

  test('uses the same wording for any TV timer', () => {
    expect(buildPauseHint({ type: 'tv' })).toContain('several episodes');
  });

  test('gives movies the short version', () => {
    const hint = buildPauseHint({ type: 'movie' });
    expect(hint).toContain('/timer pause');
    expect(hint).not.toContain('several episodes');
  });

  test('handles a timer with no type at all (skipped title, or a pre-existing timer)', () => {
    expect(buildPauseHint(null)).toContain('/timer pause');
    expect(buildPauseHint({})).toContain('/timer pause');
  });
});
