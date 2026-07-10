/**
 * Regression tests for /timer start's title-lookup/duration-detection flow.
 *
 * Previously this only ran when a label was auto-detected from a Discord
 * scheduled event (`autoDetectedLabel === true`) — a manually-typed
 * `label:Juno` never triggered the movie/TV search or the "confirm title"
 * select menu, and the timer just started with no duration. The gate is now
 * `if (!duration && label)`, so manual labels get the same treatment.
 *
 * This also adds board games as a third search source (BoardGameGeek's
 * `playingTime` field is the only other media type with real, usable
 * duration data — video games and books have nothing comparable). Each
 * source is capped at 8 results (not 10) so three combined sources plus the
 * "Skip" option never exceed Discord's real 25-option select-menu limit.
 *
 * Run with: npx jest tests/timer-duration-detection.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockSearchBoardGames = jest.fn();
const mockGetBoardGameDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: mockSearchBoardGames,
  getBoardGameDetails: mockGetBoardGameDetails,
}));

let execute;
let startTimer, getTimerStatus, clearAllTimers;

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ startTimer, getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  const message = {
    edit: jest.fn().mockResolvedValue(undefined),
  };
  return {
    id: 'channel-1',
    send: jest.fn().mockResolvedValue(message),
  };
}

function makeInteraction({ label = null, duration = null, theme = null } = {}) {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    options: {
      getSubcommand: () => 'start',
      getString: (name) => {
        if (name === 'label') return label;
        if (name === 'theme') return theme;
        return null;
      },
      getInteger: (name) => (name === 'duration' ? duration : null),
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  mockSearchMovies.mockReset().mockResolvedValue([]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
  mockGetMovieDetails.mockReset();
  mockGetTVShowDetails.mockReset();
  mockSearchBoardGames.mockReset().mockResolvedValue([]);
  mockGetBoardGameDetails.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

async function runExecute(interaction) {
  const promise = execute(interaction);
  // Advance past the countdown's real setTimeout delays (a handful of 1s
  // steps) without using runAllTimersAsync, which would also fire the
  // (possibly 100+ minute) auto-stop timer startTimer() schedules and
  // immediately remove the timer this test is trying to inspect.
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

describe('manual labels now trigger duration detection', () => {
  test('a manually-typed label with no duration searches movies, TV, and board games', async () => {
    mockSearchMovies.mockResolvedValue([]);
    mockSearchTVShows.mockResolvedValue([]);
    mockSearchBoardGames.mockResolvedValue([]);

    const interaction = makeInteraction({ label: 'Juno' });
    await runExecute(interaction);

    expect(mockSearchMovies).toHaveBeenCalledWith('Juno');
    expect(mockSearchTVShows).toHaveBeenCalledWith('Juno');
    expect(mockSearchBoardGames).toHaveBeenCalledWith('Juno');
  });
});

describe('single-result auto-duration', () => {
  test('a single movie match sets duration to runtime + 10', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 620, title: 'Juno', release_date: '2007-12-05' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 96 });

    const interaction = makeInteraction({ label: 'Juno' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(106);
  });

  test('a single TV match uses episode_run_time[0] + 10', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 2316, name: 'The Office', first_air_date: '2005-03-24' }]);
    mockGetTVShowDetails.mockResolvedValue({ episode_run_time: [22, 30] });

    const interaction = makeInteraction({ label: 'The Office' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(32);
  });

  test('a single board game match uses parseInt(playingTime) + 10', async () => {
    mockSearchBoardGames.mockResolvedValue([{ id: 13, name: 'Catan' }]);
    mockGetBoardGameDetails.mockResolvedValue({ playingTime: '90' });

    const interaction = makeInteraction({ label: 'Catan' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(100);
  });

  test('a board game with no playingTime data falls through gracefully with no duration', async () => {
    mockSearchBoardGames.mockResolvedValue([{ id: 999, name: 'Obscure Game' }]);
    mockGetBoardGameDetails.mockResolvedValue({ playingTime: null });

    const interaction = makeInteraction({ label: 'Obscure Game' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBeUndefined();
  });
});

describe('zero results', () => {
  test('no matches anywhere still starts the timer with no duration and no error', async () => {
    const interaction = makeInteraction({ label: 'asdfghjkl' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status).not.toBeNull();
    expect(status.duration).toBeUndefined();
  });
});

describe('multiple results and the 25-option select-menu cap', () => {
  test('a mix of movie/TV/boardgame matches shows a select menu instead of starting immediately', async () => {
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Match A', release_date: '2020-01-01' },
      { id: 2, title: 'Match B', release_date: '2021-01-01' },
    ]);
    mockSearchTVShows.mockResolvedValue([{ id: 3, name: 'Match C', first_air_date: '2019-01-01' }]);
    mockSearchBoardGames.mockResolvedValue([{ id: 4, name: 'Match D' }]);

    const interaction = makeInteraction({ label: 'Match' });
    await runExecute(interaction);

    // No timer should have started yet - waiting on user selection.
    expect(getTimerStatus('channel-1')).toBeNull();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.anything(),
        components: expect.anything(),
      })
    );
  });

  test('more than 8 results per source are capped so total options never exceed 25', async () => {
    const manyMovies = Array.from({ length: 15 }, (_, i) => ({ id: i, title: `Movie ${i}`, release_date: '2020-01-01' }));
    const manyShows = Array.from({ length: 15 }, (_, i) => ({ id: i + 100, name: `Show ${i}`, first_air_date: '2020-01-01' }));
    const manyGames = Array.from({ length: 15 }, (_, i) => ({ id: i + 200, name: `Game ${i}` }));

    mockSearchMovies.mockResolvedValue(manyMovies);
    mockSearchTVShows.mockResolvedValue(manyShows);
    mockSearchBoardGames.mockResolvedValue(manyGames);

    const interaction = makeInteraction({ label: 'Many' });
    await runExecute(interaction);

    const editReplyCall = interaction.editReply.mock.calls.find(
      (call) => call[0]?.components
    );
    expect(editReplyCall).toBeDefined();

    const selectMenu = editReplyCall[0].components[0].components[0];
    const optionCount = selectMenu.options.length;

    // 8 movies + 8 TV + 8 boardgames + 1 Skip = 25, never more.
    expect(optionCount).toBeLessThanOrEqual(25);
    expect(optionCount).toBe(25);
  });
});
