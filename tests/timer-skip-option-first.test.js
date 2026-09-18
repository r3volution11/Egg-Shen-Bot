/**
 * The "Start Timer Without Title Selection" option must lead EVERY /timer
 * start picker.
 *
 * It used to be appended last, which on a full picker meant scrolling past
 * 24 TMDB results to find it — friction that was driving watch-party hosts
 * to use another bot's timer instead. These tests pin the ordering at all
 * four picker sites and the 25-option ceiling Discord enforces.
 *
 * Run with: npm test -- tests/timer-skip-option-first.test.js
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
const mockGetSeasonDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: mockGetSeasonDetails,
  sumEpisodeRuntimes: jest.fn(),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: mockSearchBoardGames,
  getBoardGameDetails: mockGetBoardGameDetails,
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let execute, buildSkipOption;
let getTimerStatus, clearAllTimers;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute, buildSkipOption } = await import('../src/commands/timer.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  return {
    id: 'channel-1',
    send: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue(undefined) }),
  };
}

function makeInteraction({ label = null, movie = null, tv = null } = {}) {
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
        if (name === 'movie') return movie;
        if (name === 'tv') return tv;
        return null;
      },
      getInteger: () => null,
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
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
  mockGetSeasonDetails.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

async function runExecute(interaction) {
  const promise = execute(interaction);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

function getPickerOptions(interaction) {
  const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
  expect(call).toBeDefined();
  return call[0].components[0].components[0].options;
}

/** Generate n ambiguous results so the search can't pick a landslide winner. */
function manyMovies(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `Match ${i + 1}`,
    release_date: '2000-01-01',
  }));
}

function manyShows(n, namePrefix = 'Match') {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    name: `${namePrefix} ${i + 1}`,
    first_air_date: '2000-01-01',
  }));
}

describe('buildSkipOption', () => {
  test('is worded so a first-time user knows what it does', () => {
    const option = buildSkipOption('modern');
    expect(option.label).toBe('▶️ Start Timer Without Title Selection');
    expect(option.description).toBe('Skip the lookup — just start the timer now (runs until stopped)');
  });

  test('keeps the exact value shape selectHandler parses', () => {
    // selectHandler reads parts[1] for the 'skip' marker and the LAST
    // segment as the theme — extra segments would break both.
    expect(buildSkipOption('modern').value).toBe('timer_skip_modern');
    expect(buildSkipOption('classic').value).toBe('timer_skip_classic');
  });

  test('respects Discord\'s 100-char option limits', () => {
    const option = buildSkipOption('modern');
    expect(option.label.length).toBeLessThanOrEqual(100);
    expect(option.description.length).toBeLessThanOrEqual(100);
  });
});

describe('skip option leads every picker', () => {
  test('picker 1: the auto/manual episode-range picker', async () => {
    mockSearchTVShows.mockResolvedValue(manyShows(3, 'Crypt'));

    const interaction = makeInteraction({ label: 'Crypt S5E5-E8' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options[0].data.value).toBe('timer_skip_modern');
    expect(options[1].data.value).toMatch(/^timer_tv_\d+_modern_range_5_5_8$/);
  });

  test('picker 2: the generic movie/TV/board-game picker', async () => {
    mockSearchMovies.mockResolvedValue(manyMovies(3));

    const interaction = makeInteraction({ label: 'Match' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options[0].data.value).toBe('timer_skip_modern');
    expect(options[1].data.value).toBe('timer_movie_1_modern');
  });

  test('picker 3: the explicit tv: range picker', async () => {
    mockSearchTVShows.mockResolvedValue(manyShows(3, 'Crypt'));

    const interaction = makeInteraction({ tv: 'Crypt S5E5-E8' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options[0].data.value).toBe('timer_skip_modern');
    expect(options[1].data.value).toMatch(/^timer_tv_\d+_modern_range_5_5_8$/);
  });

  test('picker 4: the explicit movie: picker', async () => {
    mockSearchMovies.mockResolvedValue(manyMovies(3));

    const interaction = makeInteraction({ movie: 'Match' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options[0].data.value).toBe('timer_skip_modern');
    expect(options[1].data.value).toBe('timer_movie_1_modern');
  });
});

describe('Discord\'s 25-option ceiling', () => {
  test('a saturated tri-search picker stays at exactly 25 options', async () => {
    // 10 results per source: each is capped at 8, then the combined list is
    // capped at 24, leaving room for the skip option at index 0. Before the
    // explicit cap this held only because 8*3 happened to equal 24.
    mockSearchMovies.mockResolvedValue(manyMovies(10));
    mockSearchTVShows.mockResolvedValue(manyShows(10));
    mockSearchBoardGames.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, name: `Game ${i + 1}` }))
    );

    const interaction = makeInteraction({ label: 'Match' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options.length).toBe(25);
    expect(options[0].data.value).toBe('timer_skip_modern');
    expect(getTimerStatus('channel-1')).toBeNull(); // still awaiting a choice
  });

  test('an over-long single-type picker is capped to 24 results plus the skip', async () => {
    mockSearchMovies.mockResolvedValue(manyMovies(40));

    const interaction = makeInteraction({ movie: 'Match' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options.length).toBe(25);
    expect(options[0].data.value).toBe('timer_skip_modern');
  });

  test('an over-long range picker is capped to 24 results plus the skip', async () => {
    mockSearchTVShows.mockResolvedValue(manyShows(40, 'Crypt'));

    const interaction = makeInteraction({ label: 'Crypt S5E5-E8' });
    await runExecute(interaction);

    const options = getPickerOptions(interaction);
    expect(options.length).toBe(25);
    expect(options[0].data.value).toBe('timer_skip_modern');
  });
});
