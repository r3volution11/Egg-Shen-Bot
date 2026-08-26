/**
 * End-to-end tests for /timer start's episode-range detection: a label like
 * "Tales from the Crypt - S5: E5 - E8" means a single watch party spanning
 * multiple episodes. The bot should parse the range, resolve the show,
 * fetch the season, sum runtimes for the requested episodes, and start the
 * timer with that total + a 10-minute buffer — showing a breakdown, not
 * just an opaque final number.
 *
 * Run with: npx jest tests/timer-episode-range.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockSearchBoardGames = jest.fn();
const mockGetSeasonDetails = jest.fn();

// A faithful copy of tmdbService.js's real sumEpisodeRuntimes — used here
// (rather than the module's own export, which can't be referenced from
// inside its own jest.unstable_mockModule factory) so these tests exercise
// the real summing logic end-to-end, not a stub. The logic itself already
// has full unit coverage in tests/sumEpisodeRuntimes.test.js.
function realSumEpisodeRuntimes(seasonDetails, episodeStart, episodeEnd, fallbackPerEpisodeRuntime = null) {
  const episodes = (seasonDetails?.episodes || []).filter(
    ep => ep.episode_number >= episodeStart && ep.episode_number <= episodeEnd
  );
  if (episodes.length === 0) return null;
  const breakdown = episodes
    .sort((a, b) => a.episode_number - b.episode_number)
    .map(ep => {
      const hasRealRuntime = typeof ep.runtime === 'number' && ep.runtime > 0;
      return {
        episodeNumber: ep.episode_number,
        runtime: hasRealRuntime ? ep.runtime : fallbackPerEpisodeRuntime,
        estimated: !hasRealRuntime,
      };
    });
  const totalRuntime = breakdown.reduce((sum, ep) => sum + (ep.runtime || 0), 0);
  return { episodeCount: episodes.length, breakdown, totalRuntime };
}

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: mockGetSeasonDetails,
  sumEpisodeRuntimes: realSumEpisodeRuntimes,
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: mockSearchBoardGames,
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
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
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    id: 'channel-1',
    send: jest.fn().mockResolvedValue(message),
  };
}

function makeInteraction({ label = null } = {}) {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    options: {
      getSubcommand: () => 'start',
      getString: (name) => (name === 'label' ? label : null),
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

const seasonFiveDetails = {
  episodes: [
    { episode_number: 4, runtime: 25 },
    { episode_number: 5, runtime: 22 },
    { episode_number: 6, runtime: 22 },
    { episode_number: 7, runtime: 21 },
    { episode_number: 8, runtime: 23 },
    { episode_number: 9, runtime: 20 },
  ],
};

describe('/timer start — episode range, single unambiguous show', () => {
  test('sums episode runtimes across the range and adds the 10-minute buffer', async () => {
    mockSearchTVShows.mockResolvedValue([
      { id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
    ]);
    mockGetSeasonDetails.mockResolvedValue(seasonFiveDetails);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ label: 'Tales from the Crypt - S5: E5 - E8' });
    await runExecute(interaction);

    // 22 + 22 + 21 + 23 = 88, + 10 buffer = 98
    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(98);
    expect(status.isFallbackDuration).toBeFalsy();
  });

  test('searches TV shows using only the stripped show name, not the raw range-containing label', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue(seasonFiveDetails);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ label: 'Tales from the Crypt - S5: E5 - E8' });
    await runExecute(interaction);

    expect(mockSearchTVShows).toHaveBeenCalledWith('Tales from the Crypt');
    expect(mockSearchMovies).not.toHaveBeenCalled();
  });

  test('shows the episode breakdown as a followUp, not just the total', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue(seasonFiveDetails);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ label: 'Tales from the Crypt - S5: E5 - E8' });
    await runExecute(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('4 episodes'),
        ephemeral: true,
      })
    );
    const breakdownCall = interaction.followUp.mock.calls.find(c => c[0].content.includes('Tales from the Crypt'));
    expect(breakdownCall[0].content).toContain('E5: 22 min');
    expect(breakdownCall[0].content).toContain('E8: 23 min');
    expect(breakdownCall[0].content).toContain('88 min + 10 min buffer = 98 min');
  });

  test('marks estimated episodes distinctly in the breakdown', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 5, runtime: 22 },
        { episode_number: 6, runtime: null },
      ],
    });
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ label: 'Tales from the Crypt S5E5-E6' });
    await runExecute(interaction);

    const breakdownCall = interaction.followUp.mock.calls.find(c => c[0].content.includes('Tales from the Crypt'));
    expect(breakdownCall[0].content).toContain('E6: ~22 min (estimated)');
  });

  test('a single-episode "range" (no dash) skips the breakdown followUp, matching plain single-episode behavior', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue(seasonFiveDetails);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ label: 'Tales from the Crypt S5E5' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(32); // 22 + 10 buffer
    expect(interaction.followUp).not.toHaveBeenCalled();
  });
});

describe('/timer start — episode range, no show found', () => {
  test('falls back to noRuntimeFound behavior without retrying the raw label', async () => {
    mockSearchTVShows.mockResolvedValue([]);

    const interaction = makeInteraction({ label: 'Some Unknown Show - S5: E5 - E8' });
    await runExecute(interaction);

    expect(mockSearchTVShows).toHaveBeenCalledWith('Some Unknown Show');
    expect(mockSearchTVShows).toHaveBeenCalledTimes(1); // never retried with the raw label
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Couldn't find a runtime") })
    );
  });

  test('falls back gracefully when the season has no episodes in the requested range', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue({ episodes: [{ episode_number: 1, runtime: 20 }] });

    const interaction = makeInteraction({ label: 'Tales from the Crypt - S5: E5 - E8' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.isFallbackDuration).toBe(true);
  });
});

describe('/timer start — episode range with multiple matching shows', () => {
  test('shows a picker with range data encoded in the option values', async () => {
    mockSearchTVShows.mockResolvedValue([
      { id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10', overview: 'Horror anthology.' },
      { id: 99, name: 'Tales from the Crypt', first_air_date: '2023-01-01', overview: 'A reboot.' },
    ]);

    const interaction = makeInteraction({ label: 'Tales from the Crypt - S5: E5 - E8' });
    await runExecute(interaction);

    expect(getTimerStatus('channel-1')).toBeNull(); // nothing started yet — waiting on selection
    const editReplyCall = interaction.editReply.mock.calls.find(call => call[0]?.components);
    expect(editReplyCall).toBeDefined();

    const options = editReplyCall[0].components[0].components[0].options;
    const rangeOption = options.find(o => o.data.value.includes('_range_'));
    expect(rangeOption.data.value).toBe('timer_tv_42_modern_range_5_5_8');
  });
});
