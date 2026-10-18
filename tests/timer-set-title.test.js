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
  getBackdropUrl: jest.fn(() => null),
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: jest.fn(),
  getTVShowDetails: jest.fn(),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn(),
  sumEpisodeRuntimes: jest.fn(),
  // selectHandler.js imports these too
  getUnifiedMovieWatchProviders: jest.fn(),
  getUnifiedTVWatchProviders: jest.fn(),
}));

jest.unstable_mockModule('../src/api/server.js', () => ({
  saveEventChannelSelections: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn().mockResolvedValue([]),
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getEpisodeBufferMinutes: jest.fn(() => 5),
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn((member) => member?._isAdmin === true),
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  getStatsConfig: jest.fn().mockResolvedValue({}),
}));

let execute, handleSelectInteraction;
let startTimer, stopTimer, getTimerStatus, clearAllTimers, canSetTimerTitle, setTimerTitle;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
  ({ startTimer, stopTimer, getTimerStatus, clearAllTimers, canSetTimerTitle, setTimerTitle } =
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

describe('/timer title picker — an ambiguous title asks, like /movie', () => {
  // Driven end to end: the real command builds the menu, and its OWN option
  // values are fed back into the real select handler.

  /** The picker's options from the command's reply, or null if none. */
  function pickerOptions(interaction) {
    const reply = interaction.editReply.mock.calls.at(-1)?.[0];
    const row = reply?.components?.[0];
    if (!row) return null;
    const json = typeof row.toJSON === 'function' ? row.toJSON() : row;
    expect(json.components[0].custom_id).toBe('timer_select_title');
    return json.components[0].options;
  }

  function makeSelect(value, { userId = 'a-stranger', isAdmin = false } = {}) {
    return {
      customId: 'timer_select_title',
      values: [value],
      channelId: 'channel-1',
      guildId: 'guild-1',
      user: { id: userId, username: 'tester' },
      member: { _isAdmin: isAdmin },
      channel: { send: jest.fn().mockResolvedValue(undefined) },
      replied: false,
      deferred: false,
      deferUpdate: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
    };
  }

  const carpenterThing = { id: 1091, title: 'The Thing', release_date: '1982-06-25', overview: 'Antarctica.' };
  const prequelThing = { id: 60935, title: 'The Thing', release_date: '2011-10-13', overview: 'Prequel.' };
  const christine = { id: 8769, title: 'Christine', release_date: '1983-12-09' };

  test('a fuzzy title shows a picker instead of saving the raw text', async () => {
    // The reported bug: no exact match meant the typed text became the
    // title, unidentified. It must ask instead.
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([carpenterThing, christine]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'carpenter thing' });
    await execute(cmd);

    expect(getTimerStatus('channel-1').label).toBe(''); // not set yet
    expect(cmd.channel.send).not.toHaveBeenCalled();
    const options = pickerOptions(cmd);
    expect(options.map(o => o.label)).toEqual([
      'Keep "carpenter thing" as typed',
      'The Thing (1982)',
      'Christine (1983)',
    ]);

    const select = makeSelect(options[1].value);
    await handleSelectInteraction(select);

    const timer = getTimerStatus('channel-1');
    expect(timer.label).toBe('The Thing');
    expect(timer.tmdbId).toBe(1091);
    expect(timer.type).toBe('movie');
    expect(select.editReply.mock.calls.at(-1)[0].content).toContain('Matched on TMDB');
    expect(select.channel.send.mock.calls[0][0].content).toContain('The Thing');
  });

  test('two exact matches ask which one, rather than picking either', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([carpenterThing, prequelThing]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'The Thing' });
    await execute(cmd);

    const options = pickerOptions(cmd);
    const prequel = options.find(o => o.label === 'The Thing (2011)');
    await handleSelectInteraction(makeSelect(prequel.value));

    expect(getTimerStatus('channel-1').tmdbId).toBe(60935);
  });

  test('exact title matches are listed ahead of fuzzy ones, across movies and TV', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Fargo Nights', release_date: '2001-01-01' },
      { id: 275, title: 'Fargo', release_date: '1996-03-08' },
    ]);
    mockSearchTVShows.mockResolvedValue([{ id: 60622, name: 'Fargo', first_air_date: '2014-04-15' }]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'Fargo' });
    await execute(cmd);

    const labels = pickerOptions(cmd).map(o => o.label);
    expect(labels.slice(1)).toEqual(['Fargo (1996)', 'Fargo (2014)', 'Fargo Nights (2001)']);

    await handleSelectInteraction(makeSelect(pickerOptions(cmd)[2].value));
    expect(getTimerStatus('channel-1')).toMatchObject({ label: 'Fargo', tmdbId: 60622, type: 'tv' });
  });

  test('"keep as typed" names the timer without identifying it', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([carpenterThing, christine]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'Basement Tapes' });
    await execute(cmd);

    const select = makeSelect(pickerOptions(cmd)[0].value);
    await handleSelectInteraction(select);

    const timer = getTimerStatus('channel-1');
    expect(timer.label).toBe('Basement Tapes');
    expect(timer.tmdbId).toBeFalsy();
    expect(select.editReply.mock.calls.at(-1)[0].content).toContain('Kept as typed');
  });

  test('an ambiguous show in range notation keeps the range when picked', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchTVShows.mockResolvedValue([
      { id: 2391, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
      { id: 9999, name: 'Tales from the Crypt', first_air_date: '2026-01-01' } // a reboot, same name,
    ]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'Tales from the Crypt S6: E4-E7' });
    await execute(cmd);

    const options = pickerOptions(cmd);
    await handleSelectInteraction(makeSelect(options.find(o => o.label === 'Tales from the Crypt (1989)').value));

    const timer = getTimerStatus('channel-1');
    expect(timer.label).toBe('Tales from the Crypt S6: E4-E7');
    expect(timer.tmdbId).toBe(2391);
    expect(timer.episodeRange).toEqual({ season: 6, episodeStart: 4, episodeEnd: 7 });
  });

  test('a menu left open across a new timer does not name the new one', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([carpenterThing, christine]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'carpenter thing' });
    await execute(cmd);
    const value = pickerOptions(cmd)[1].value;

    stopTimer('channel-1');
    // startTime is Date.now(); make sure the new timer's differs
    const realNow = Date.now;
    Date.now = () => realNow() + 60_000;
    try {
      startTimer('channel-1', 'other', 'other', '', 90, null, false);
    } finally {
      Date.now = realNow;
    }

    const select = makeSelect(value);
    await handleSelectInteraction(select);

    expect(getTimerStatus('channel-1').label).toBe('');
    expect(select.editReply.mock.calls.at(-1)[0].content).toContain('no longer running');
  });

  test('a stranger\'s pick is refused if a title was set while the menu was open', async () => {
    startTimer('channel-1', 'starter', 'starter', '', 120, null, false);
    mockSearchMovies.mockResolvedValue([carpenterThing, christine]);

    const cmd = makeInteraction({ userId: 'a-stranger', title: 'carpenter thing' });
    await execute(cmd);
    const value = pickerOptions(cmd)[2].value; // Christine

    setTimerTitle('channel-1', 'The Thing', { tmdbId: 1091, type: 'movie' });

    await handleSelectInteraction(makeSelect(value));
    expect(getTimerStatus('channel-1')).toMatchObject({ label: 'The Thing', tmdbId: 1091 });
  });
});
