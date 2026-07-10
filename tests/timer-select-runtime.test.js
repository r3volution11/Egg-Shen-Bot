/**
 * Regression test for selectHandler.js's `timer_select_runtime` handling
 * with a board-game selection (the third media type added alongside the
 * existing movie/tv cases — see tests/timer-duration-detection.test.js for
 * the /timer start gate itself).
 *
 * Confirms choosing a `timer_boardgame_<id>_<theme>` select-menu option
 * looks up the board game via getBoardGameDetails, computes
 * duration = parseInt(playingTime, 10) + 10, and passes it through to
 * startTimerCountdown (verified indirectly via the real timerManager state
 * startTimer() produces, matching the pattern used elsewhere in this repo).
 *
 * Run with: npx jest tests/timer-select-runtime.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetBoardGameDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: jest.fn(),
  searchTVShows: jest.fn(),
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getSeasonDetails: jest.fn(),
  getEpisodeDetails: jest.fn(),
  searchEpisodeByName: jest.fn(),
  getPosterUrl: jest.fn(),
  getBackdropUrl: jest.fn(),
  discoverRandomMovie: jest.fn(),
  discoverRandomTV: jest.fn(),
  getSimilarMovies: jest.fn(),
  getSimilarTV: jest.fn(),
  getMovieWatchProviders: jest.fn(),
  getTVWatchProviders: jest.fn(),
  getUnifiedMovieWatchProviders: jest.fn(),
  getUnifiedTVWatchProviders: jest.fn(),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn(),
  getBoardGameDetails: mockGetBoardGameDetails,
  getRandomBoardGame: jest.fn(),
  getSimilarBoardGames: jest.fn(),
}));

jest.unstable_mockModule('../src/api/server.js', () => ({
  saveEventChannelSelections: jest.fn().mockResolvedValue(undefined),
}));

let handleSelectInteraction;
let getTimerStatus, clearAllTimers;

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    id: 'channel-1',
    send: jest.fn().mockResolvedValue(message),
  };
}

function makeSelectInteraction({ value }) {
  return {
    customId: 'timer_select_runtime',
    values: [value],
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    replied: false,
    deferred: false,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    message: {
      embeds: [{ title: 'Confirm Title for "Catan"' }],
    },
  };
}

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  mockGetMovieDetails.mockReset();
  mockGetTVShowDetails.mockReset();
  mockGetBoardGameDetails.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

async function runSelection(interaction) {
  const promise = handleSelectInteraction(interaction);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

describe('timer_select_runtime — board game selection', () => {
  test('selecting a board game option computes duration from playingTime + 10', async () => {
    mockGetBoardGameDetails.mockResolvedValue({ playingTime: '90' });

    const interaction = makeSelectInteraction({ value: 'timer_boardgame_13_modern' });
    await runSelection(interaction);

    expect(mockGetBoardGameDetails).toHaveBeenCalledWith(13);
    expect(mockGetMovieDetails).not.toHaveBeenCalled();
    expect(mockGetTVShowDetails).not.toHaveBeenCalled();

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(100);
    expect(status.label).toBe('Catan');
  });

  test('a board game with no playingTime data starts the timer with no duration', async () => {
    mockGetBoardGameDetails.mockResolvedValue({ playingTime: null });

    const interaction = makeSelectInteraction({ value: 'timer_boardgame_999_modern' });
    await runSelection(interaction);

    const status = getTimerStatus('channel-1');
    expect(status).not.toBeNull();
    expect(status.duration).toBeUndefined();
  });

  test('movie/tv selections still work unaffected by the boardgame branch', async () => {
    mockGetMovieDetails.mockResolvedValue({ runtime: 96 });

    const interaction = makeSelectInteraction({ value: 'timer_movie_620_modern' });
    await runSelection(interaction);

    expect(mockGetMovieDetails).toHaveBeenCalledWith(620);
    expect(mockGetBoardGameDetails).not.toHaveBeenCalled();

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(106);
  });
});
