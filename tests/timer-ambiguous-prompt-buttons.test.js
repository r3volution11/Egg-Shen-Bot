/**
 * Tests for the two buttons on the ambiguous-title prompt:
 *   timer_start_now_<theme>[_range_s_e1_e2]  — start the countdown now
 *   timer_lookup_<theme>[_range_s_e1_e2]     — show the list of matches
 *
 * The prompt replaces a 25-option picker with a plain either/or when an
 * auto-detected watch-party title can't be pinned down. Both buttons recover
 * the title from the prompt's embed, and carry an episode range in their ids
 * when one came from the event's description (where it isn't recoverable
 * from the label).
 *
 * Run with: npm test -- tests/timer-ambiguous-prompt-buttons.test.js
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

let handleButtonInteraction;
let buildAmbiguousTitlePrompt;
let getTimerStatus, clearAllTimers;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  ({ buildAmbiguousTitlePrompt } = await import('../src/commands/timer.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return { id: 'channel-1', send: jest.fn().mockResolvedValue(message) };
}

function createMockInteraction({ customId, label = 'Tales From the Crypt' }) {
  return {
    customId,
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    guild: { id: 'guild-1' },
    member: { permissions: { has: () => false } },
    // Exactly what buildAmbiguousTitlePrompt produced, so the label-recovery
    // regex is tested against the real embed title rather than a guess.
    message: { embeds: [{ title: buildAmbiguousTitlePrompt(label, 5, 'modern').embeds[0].data.title }] },
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
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

async function runButton(interaction) {
  const promise = handleButtonInteraction(interaction);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

describe('▶️ Start Now', () => {
  test('starts a labeled timer with no duration', async () => {
    const interaction = createMockInteraction({ customId: 'timer_start_now_modern' });
    await runButton(interaction);

    const status = getTimerStatus('channel-1');
    expect(status).not.toBeNull();
    expect(status.label).toBe('Tales From the Crypt');
    // No duration was detected, so the server cap applies AND the timer
    // stays eligible for the expiry warning with its Extend button.
    expect(status.duration).toBe(360);
    expect(status.isFallbackDuration).toBe(true);
  });

  test('never searches TMDB — the whole point is starting now', async () => {
    const interaction = createMockInteraction({ customId: 'timer_start_now_modern' });
    await runButton(interaction);

    expect(mockSearchMovies).not.toHaveBeenCalled();
    expect(mockSearchTVShows).not.toHaveBeenCalled();
  });

  test('ignores a range suffix when reading the theme', async () => {
    const interaction = createMockInteraction({ customId: 'timer_start_now_classic_range_6_4_7' });
    await runButton(interaction);

    expect(getTimerStatus('channel-1')).not.toBeNull();
  });

  test('recovers a title containing punctuation', async () => {
    const interaction = createMockInteraction({
      customId: 'timer_start_now_modern',
      label: 'What We Do in the Shadows: Season 5 "Pride Parade"',
    });
    await runButton(interaction);

    expect(getTimerStatus('channel-1').label).toBe('What We Do in the Shadows: Season 5 "Pride Parade"');
  });
});

describe('🔎 Look Up Title', () => {
  test('runs the search and shows the picker, not another prompt', async () => {
    // Deliberately no exact title match — otherwise the search resolves it
    // outright and never reaches a picker.
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Tales from the Crypt: Demon Knight', release_date: '1995-01-13' },
      { id: 2, title: 'Tales from the Cryptkeeper', release_date: '1993-09-18' },
    ]);

    const interaction = createMockInteraction({ customId: 'timer_lookup_modern' });
    await runButton(interaction);

    expect(mockSearchMovies).toHaveBeenCalledWith('Tales From the Crypt');

    const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
    const options = call[0].components[0].components[0].options;
    expect(options).toBeDefined(); // a select menu, not buttons again
    expect(options[0].data.value).toBe('timer_skip_modern'); // escape hatch still first
    expect(getTimerStatus('channel-1')).toBeNull(); // awaiting the pick
  });

  test('a confident match resolves the duration without a picker', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 620, title: 'Juno', release_date: '2007-12-05' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 96 });

    const interaction = createMockInteraction({ customId: 'timer_lookup_modern', label: 'Juno' });
    await runButton(interaction);

    expect(getTimerStatus('channel-1').duration).toBe(106);
  });

  test('carries an episode range from the button id into the search', async () => {
    // Without this the range from the event's DESCRIPTION would be lost, and
    // the lookup would fall back to a single show with no episode count.
    mockSearchTVShows.mockResolvedValue([
      { id: 3, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
    ]);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [26] });
    mockGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 4, runtime: 26 },
        { episode_number: 5, runtime: 26 },
      ],
    });

    const interaction = createMockInteraction({ customId: 'timer_lookup_modern_range_6_4_5' });
    await runButton(interaction);

    // The range path searches by show name and sums the episodes.
    expect(mockSearchTVShows).toHaveBeenCalledWith('Tales From the Crypt');
    expect(mockGetSeasonDetails).toHaveBeenCalledWith(3, 6);
  });
});
