/**
 * Tests for the watch-party auto-detect "Search" / "Start Timer" recovery
 * flow — when a title auto-detected from a Discord scheduled event doesn't
 * cleanly match a movie/TV/board-game search, the user previously had no
 * way to reject it: a zero-results match silently started the timer under
 * the wrong auto-detected name, and an ambiguous match only offered "Skip"
 * (which also kept the wrong name). `runTitleSearchAndDecide()` now shows a
 * recovery screen (with a "🔎 Search" button opening a modal to retype the
 * title) whenever `wasAutoDetected` is true, while a manually-typed label
 * that doesn't match anything keeps its exact prior behavior unchanged.
 *
 * Run with: npx jest tests/timer-retype-flow.test.js --verbose
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
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn(),
  sumEpisodeRuntimes: jest.fn(),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: mockSearchBoardGames,
  getBoardGameDetails: mockGetBoardGameDetails,
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let runTitleSearchAndDecide;
let clearAllTimers, getTimerStatus;

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ runTitleSearchAndDecide } = await import('../src/commands/timer.js'));
  ({ clearAllTimers, getTimerStatus } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return { id: 'channel-1', send: jest.fn().mockResolvedValue(message) };
}

function makeInteraction() {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

function baseParams(overrides = {}) {
  return {
    channelId: 'channel-1',
    userId: 'user-1',
    username: 'tester',
    label: 'asdfghjkl',
    theme: 'modern',
    guildConfig: {},
    wasAutoDetected: false,
    ...overrides,
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

async function run(interaction, params) {
  const promise = runTitleSearchAndDecide(interaction, params);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

describe('zero results', () => {
  test('wasAutoDetected: true shows the new recovery screen instead of starting the timer', async () => {
    const interaction = makeInteraction();
    await run(interaction, baseParams({ wasAutoDetected: true }));

    expect(getTimerStatus('channel-1')).toBeNull();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Couldn\'t find a match for "asdfghjkl"'),
            }),
          }),
        ]),
      })
    );

    const call = interaction.editReply.mock.calls[0][0];
    const buttons = call.components[0].components;
    expect(buttons).toHaveLength(2);
    expect(buttons[0].data.custom_id).toBe('timer_retype_modern');
    expect(buttons[0].data.label).toBe('🔎 Search');
    expect(buttons[1].data.custom_id).toBe('timer_skip_noauto_modern');
    expect(buttons[1].data.label).toBe('▶️ Start Timer');
  });

  test('wasAutoDetected: false keeps the exact existing silent-start behavior', async () => {
    const interaction = makeInteraction();
    await run(interaction, baseParams({ wasAutoDetected: false }));

    const status = getTimerStatus('channel-1');
    expect(status).not.toBeNull();
    expect(status.duration).toBe(360);
    expect(status.isFallbackDuration).toBe(true);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Couldn't find a runtime for \"asdfghjkl\""),
        ephemeral: true,
      })
    );
  });
});

describe('ambiguous results', () => {
  function seedAmbiguousMovies() {
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Match A', release_date: '2020-01-01' },
      { id: 2, title: 'Match B', release_date: '2021-01-01' },
    ]);
  }

  test('wasAutoDetected: true adds a second row with the Search button', async () => {
    seedAmbiguousMovies();
    const interaction = makeInteraction();
    await run(interaction, baseParams({ label: 'Match', wasAutoDetected: true }));

    expect(getTimerStatus('channel-1')).toBeNull();
    const call = interaction.editReply.mock.calls[0][0];
    expect(call.components).toHaveLength(2);
    const searchButton = call.components[1].components[0];
    expect(searchButton.data.custom_id).toBe('timer_retype_modern');
    expect(searchButton.data.label).toBe('🔎 Search');
  });

  test('wasAutoDetected: false shows only the select-menu row, no Search button (regression guard)', async () => {
    seedAmbiguousMovies();
    const interaction = makeInteraction();
    await run(interaction, baseParams({ label: 'Match', wasAutoDetected: false }));

    const call = interaction.editReply.mock.calls[0][0];
    expect(call.components).toHaveLength(1);
  });

  test('the select menu\'s "Start Timer" option uses the same value regardless of wasAutoDetected', async () => {
    seedAmbiguousMovies();
    const interaction = makeInteraction();
    await run(interaction, baseParams({ label: 'Match', wasAutoDetected: true }));

    const call = interaction.editReply.mock.calls[0][0];
    const selectMenu = call.components[0].components[0];
    const startTimerOption = selectMenu.options.find(o => o.data.value === 'timer_skip_modern');
    expect(startTimerOption).toBeDefined();
    expect(startTimerOption.data.label).toBe('▶️ Start Timer (No Duration)');
  });
});

describe('landslide/single match — unaffected by wasAutoDetected', () => {
  test('a single movie match starts the timer directly, no picker, regardless of the flag', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 620, title: 'Juno', release_date: '2007-12-05' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 96 });

    const interaction = makeInteraction();
    await run(interaction, baseParams({ label: 'Juno', wasAutoDetected: true }));

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(106);
    // No picker/recovery screen was shown — every editReply call has an
    // empty components array (startTimerCountdown's own "Starting
    // timer..." placeholder), never a real select menu or button row.
    for (const call of interaction.editReply.mock.calls) {
      expect(call[0].components ?? []).toHaveLength(0);
    }
  });
});

describe('episode-range notation retyped via the Search modal', () => {
  test('a retyped title matching range notation still runs the range sub-path and offers Search when ambiguous', async () => {
    mockSearchTVShows.mockResolvedValue([
      { id: 1, name: 'Severance', first_air_date: '2022-01-01' },
      { id: 2, name: 'Severance (UK)', first_air_date: '2010-01-01' },
    ]);

    const interaction = makeInteraction();
    await run(interaction, baseParams({ label: 'Severance - S2: E1-E3', wasAutoDetected: true }));

    expect(getTimerStatus('channel-1')).toBeNull();
    const call = interaction.editReply.mock.calls[0][0];
    expect(call.embeds[0].data.title).toContain('Confirm Show for "Severance"');
    expect(call.components).toHaveLength(2);
    expect(call.components[1].components[0].data.custom_id).toBe('timer_retype_modern');
  });
});
