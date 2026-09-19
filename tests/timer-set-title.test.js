/**
 * Tests for /timer title — naming a running timer so it logs correctly.
 *
 * A timer started without a title still writes a watch-history entry when it
 * stops, just an unidentified one. This lets whoever is watching fix that
 * mid-party.
 *
 * The permission rule is deliberately asymmetric: while there is NO title,
 * anyone may set one (that's the state we want fixed, and an empty field has
 * nothing to vandalize). Once a title exists, only the starter or a
 * moderator may change it — overwriting a correct title silently corrupts
 * the watch-history entry written at stop time.
 *
 * Run with: npm test -- tests/timer-set-title.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: jest.fn(),
  getTVShowDetails: jest.fn(),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn(),
  sumEpisodeRuntimes: jest.fn(),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn().mockResolvedValue([]),
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn((member) => member?._isAdmin === true),
}));

let execute;
let startTimer, getTimerStatus, clearAllTimers, canSetTimerTitle, setTimerTitle;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ startTimer, getTimerStatus, clearAllTimers, canSetTimerTitle, setTimerTitle } =
    await import('../src/utils/timerManager.js'));
});

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  mockSearchMovies.mockReset().mockResolvedValue([]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  clearAllTimers();
  cleanupTimerFile();
});

function makeInteraction({ title = 'The Thing', userId = 'someone-else', isAdmin = false } = {}) {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    user: { id: userId, username: 'tester' },
    member: { _isAdmin: isAdmin },
    channel: { send: jest.fn().mockResolvedValue(undefined) },
    options: {
      getSubcommand: () => 'title',
      getString: () => title,
      getInteger: () => null,
      getBoolean: () => null,
    },
    reply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
}

/** Whatever the user was told, whether via reply or editReply. */
function responseText(interaction) {
  const calls = [...interaction.reply.mock.calls, ...interaction.editReply.mock.calls];
  return calls.map(c => c[0]?.content).filter(Boolean).join(' ');
}

describe('canSetTimerTitle', () => {
  const starter = { userId: 'starter', label: '' };
  const titled = { userId: 'starter', label: 'The Thing' };

  test('anyone may name a timer that has no title', () => {
    expect(canSetTimerTitle(starter, 'a-stranger', {})).toBe(true);
  });

  test('a stranger may not overwrite a title that is already set', () => {
    expect(canSetTimerTitle(titled, 'a-stranger', {})).toBe(false);
  });

  test('the starter may always change it', () => {
    expect(canSetTimerTitle(titled, 'starter', {})).toBe(true);
  });

  test('an admin may always change it', () => {
    expect(canSetTimerTitle(titled, 'a-stranger', { _isAdmin: true })).toBe(true);
  });

  test('there is nothing to set without a timer', () => {
    expect(canSetTimerTitle(null, 'anyone', {})).toBe(false);
  });
});

describe('setTimerTitle', () => {
  test('records the title and what it refers to', () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);

    setTimerTitle('channel-1', 'The Thing', { tmdbId: 1091, type: 'movie' });

    const timer = getTimerStatus('channel-1');
    expect(timer.label).toBe('The Thing');
    expect(timer.tmdbId).toBe(1091);
    expect(timer.type).toBe('movie');
  });

  test('leaves the duration and auto-stop alone', () => {
    // A running timer is synced to real playback — rescheduling its
    // auto-stop underneath people would be worse than an imperfect end time.
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    const before = getTimerStatus('channel-1');

    setTimerTitle('channel-1', 'The Thing', { tmdbId: 1091, type: 'movie' });

    const after = getTimerStatus('channel-1');
    expect(after.duration).toBe(before.duration);
    expect(after.endTime).toBe(before.endTime);
  });

  test('returns null when no timer is running', () => {
    expect(setTimerTitle('channel-1', 'Anything')).toBeNull();
  });
});

describe('/timer title', () => {
  test('a stranger can name an untitled timer', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([{ id: 1091, title: 'The Thing', release_date: '1982-06-25' }]);

    const interaction = makeInteraction({ userId: 'a-stranger' });
    await execute(interaction);

    expect(getTimerStatus('channel-1').label).toBe('The Thing');
    expect(getTimerStatus('channel-1').tmdbId).toBe(1091);
  });

  test('a stranger is refused when a title is already set', async () => {
    startTimer('channel-1', 'starter', 'starter', 'Halloween', 120, null, false);

    const interaction = makeInteraction({ userId: 'a-stranger' });
    await execute(interaction);

    expect(getTimerStatus('channel-1').label).toBe('Halloween'); // unchanged
    expect(responseText(interaction)).toContain('Only the person who started');
  });

  test('the starter may correct a title they already set', async () => {
    startTimer('channel-1', 'starter', 'starter', 'Wrong Title', 120, null, false);
    mockSearchMovies.mockResolvedValue([{ id: 1091, title: 'The Thing', release_date: '1982-06-25' }]);

    const interaction = makeInteraction({ userId: 'starter' });
    await execute(interaction);

    expect(getTimerStatus('channel-1').label).toBe('The Thing');
  });

  test('a moderator may correct anyone\'s title', async () => {
    startTimer('channel-1', 'starter', 'starter', 'Wrong Title', 120, null, false);
    mockSearchMovies.mockResolvedValue([{ id: 1091, title: 'The Thing', release_date: '1982-06-25' }]);

    const interaction = makeInteraction({ userId: 'a-mod', isAdmin: true });
    await execute(interaction);

    expect(getTimerStatus('channel-1').label).toBe('The Thing');
  });

  test('uses TMDB\'s canonical title rather than what was typed', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([{ id: 1091, title: 'The Thing', release_date: '1982-06-25' }]);

    const interaction = makeInteraction({ userId: 'a-stranger', title: 'the thing' });
    await execute(interaction);

    expect(getTimerStatus('channel-1').label).toBe('The Thing');
  });

  test('records an episode range from range notation', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchTVShows.mockResolvedValue([{ id: 2391, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);

    const interaction = makeInteraction({
      userId: 'a-stranger',
      title: 'Tales from the Crypt S6: E4-E7',
    });
    await execute(interaction);

    const timer = getTimerStatus('channel-1');
    expect(timer.tmdbId).toBe(2391);
    expect(timer.type).toBe('tv');
    expect(timer.episodeRange).toEqual({ season: 6, episodeStart: 4, episodeEnd: 7 });
  });

  test('still names the timer when TMDB matches nothing', async () => {
    // An approximate label beats an unnamed timer — /timer stop re-searches
    // it anyway when there's no stored id.
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);

    const interaction = makeInteraction({ userId: 'a-stranger', title: 'Some Obscure Short' });
    await execute(interaction);

    expect(getTimerStatus('channel-1').label).toBe('Some Obscure Short');
    expect(responseText(interaction)).toContain("Couldn't match");
  });

  test('announces the change publicly, since it was done for everyone', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([{ id: 1091, title: 'The Thing', release_date: '1982-06-25' }]);

    const interaction = makeInteraction({ userId: 'a-stranger' });
    await execute(interaction);

    expect(interaction.channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('The Thing') })
    );
  });

  test('says so when there is no timer to name', async () => {
    const interaction = makeInteraction({ userId: 'anyone' });
    await execute(interaction);

    expect(responseText(interaction)).toContain('No active timer');
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });

  test('does not reschedule the auto-stop', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    const before = getTimerStatus('channel-1').endTime;
    mockSearchMovies.mockResolvedValue([{ id: 1091, title: 'The Thing', release_date: '1982-06-25' }]);

    await execute(makeInteraction({ userId: 'a-stranger' }));

    expect(getTimerStatus('channel-1').endTime).toBe(before);
  });
});
