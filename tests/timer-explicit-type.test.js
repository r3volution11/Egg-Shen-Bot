/**
 * Tests for /timer start's new explicit `movie`/`tv` options — an
 * alternative to the free-text `label` option that lets a user declare the
 * media type up front, skipping the ambiguous movie+TV+boardgame merged
 * search entirely and going straight to a single-type hybridSearch. `tv`
 * also accepts episode-range notation (e.g. "S5E5-E8"), reusing
 * parseEpisodeRange exactly as `label` already does.
 *
 * `label` itself must remain completely unchanged — see
 * tests/timer-duration-detection.test.js and tests/timer-episode-range.test.js,
 * both of which pass unmodified against this same file, proving additivity.
 *
 * Run with: npx jest tests/timer-explicit-type.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetSeasonDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: mockGetSeasonDetails,
  sumEpisodeRuntimes: (seasonDetails, episodeStart, episodeEnd, fallbackPerEpisodeRuntime = null) => {
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
  },
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn().mockResolvedValue([]),
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let execute;
let getTimerStatus, clearAllTimers;

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    id: 'channel-1',
    send: jest.fn().mockResolvedValue(message),
  };
}

function makeInteraction({ label = null, movie = null, tv = null, duration = null, theme = null } = {}) {
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
        if (name === 'theme') return theme;
        return null;
      },
      getInteger: (name) => (name === 'duration' ? duration : null),
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

describe('/timer start — conflicting options', () => {
  test('label + movie together is rejected before any search', async () => {
    const interaction = makeInteraction({ label: 'Movie Night', movie: 'The Thing' });
    await runExecute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Use only one of') })
    );
    expect(mockSearchMovies).not.toHaveBeenCalled();
    expect(mockSearchTVShows).not.toHaveBeenCalled();
  });

  test('movie + tv together is rejected', async () => {
    const interaction = makeInteraction({ movie: 'The Thing', tv: 'The Office' });
    await runExecute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Use only one of') })
    );
  });

  test('label alone is unaffected by the new validation', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 1, title: 'The Thing', release_date: '1982-01-01' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 109 });

    const interaction = makeInteraction({ label: 'The Thing' });
    await runExecute(interaction);

    expect(interaction.editReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Use only one of') })
    );
    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(119);
  });
});

describe('/timer start — movie: option', () => {
  test('searches movies only, not TV or board games', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 1, title: 'The Thing', release_date: '1982-01-01' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 109 });

    const interaction = makeInteraction({ movie: 'The Thing' });
    await runExecute(interaction);

    expect(mockSearchMovies).toHaveBeenCalledWith('The Thing');
    expect(mockSearchTVShows).not.toHaveBeenCalled();
  });

  test('a single match resolves duration = runtime + 10', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 1, title: 'The Thing', release_date: '1982-01-01' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 109 });

    const interaction = makeInteraction({ movie: 'The Thing' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(119);
    expect(status.label).toBe('The Thing');
  });

  test('no matches falls back to the server default duration with a warning', async () => {
    mockSearchMovies.mockResolvedValue([]);

    const interaction = makeInteraction({ movie: 'Some Obscure Title' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(360);
    expect(status.isFallbackDuration).toBe(true);
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Some Obscure Title') })
    );
  });

  test('multiple ambiguous results show a movie-only picker', async () => {
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'It', release_date: '2017-09-08' },
      { id: 2, title: 'It', release_date: '1990-11-18' },
    ]);

    const interaction = makeInteraction({ movie: 'It' });
    await runExecute(interaction);

    expect(getTimerStatus('channel-1')).toBeNull(); // nothing started — waiting on selection
    const editReplyCall = interaction.editReply.mock.calls.find(call => call[0]?.components);
    expect(editReplyCall).toBeDefined();

    const options = editReplyCall[0].components[0].components[0].options;
    expect(options[0].data.value).toBe('timer_movie_1_modern');
    expect(options[1].data.value).toBe('timer_movie_2_modern');
  });
});

describe('/timer start — tv: option (plain show name)', () => {
  test('searches TV shows only, not movies or board games', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 10, name: 'The Office', first_air_date: '2005-03-24' }]);
    mockGetTVShowDetails.mockResolvedValue({ episode_run_time: [22] });

    const interaction = makeInteraction({ tv: 'The Office' });
    await runExecute(interaction);

    expect(mockSearchTVShows).toHaveBeenCalledWith('The Office');
    expect(mockSearchMovies).not.toHaveBeenCalled();
  });

  test('a single match uses episode_run_time[0] + 10', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 10, name: 'The Office', first_air_date: '2005-03-24' }]);
    mockGetTVShowDetails.mockResolvedValue({ episode_run_time: [22] });

    const interaction = makeInteraction({ tv: 'The Office' });
    await runExecute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(32);
    expect(status.label).toBe('The Office');
  });
});

describe('/timer start — tv: option with episode-range notation', () => {
  const seasonFiveDetails = {
    episodes: [
      { episode_number: 5, runtime: 22 },
      { episode_number: 6, runtime: 22 },
      { episode_number: 7, runtime: 21 },
      { episode_number: 8, runtime: 23 },
    ],
  };

  test('is parsed and resolved the same way label-based ranges are', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue(seasonFiveDetails);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ tv: 'Tales from the Crypt S5E5-E8' });
    await runExecute(interaction);

    expect(mockSearchTVShows).toHaveBeenCalledWith('Tales from the Crypt');
    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(98); // 22+22+21+23 + 10 buffer
  });

  test('shows the episode breakdown as a followUp', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
    mockGetSeasonDetails.mockResolvedValue(seasonFiveDetails);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [22] });

    const interaction = makeInteraction({ tv: 'Tales from the Crypt S5E5-E8' });
    await runExecute(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('4 episodes') })
    );
  });

  test('multiple matching shows produce a range-suffixed picker', async () => {
    mockSearchTVShows.mockResolvedValue([
      { id: 42, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
      { id: 99, name: 'Tales from the Crypt', first_air_date: '2023-01-01' },
    ]);

    const interaction = makeInteraction({ tv: 'Tales from the Crypt S5E5-E8' });
    await runExecute(interaction);

    expect(getTimerStatus('channel-1')).toBeNull();
    const editReplyCall = interaction.editReply.mock.calls.find(call => call[0]?.components);
    const options = editReplyCall[0].components[0].components[0].options;
    expect(options[0].data.value).toBe('timer_tv_42_modern_range_5_5_8');
  });
});
