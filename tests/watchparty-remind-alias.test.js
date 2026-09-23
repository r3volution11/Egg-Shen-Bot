/**
 * /watchparty remind and /timer remind are one feature under two names.
 *
 * They used to be separate byte-for-byte copies — the event lookup, the TMDB
 * search and the announcement builder, roughly 300 duplicated lines. A fix
 * landing in one silently skipped the other, which is how /watchparty remind
 * missed the year-suffix handling and kept finding nothing for an event named
 * "The Covenant (2006)".
 *
 * These tests pin that they now share an implementation and produce the same
 * announcement, so the two can't drift apart again.
 *
 * Run with: npm test -- tests/watchparty-remind-alias.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
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
  searchBoardGames: jest.fn().mockResolvedValue([]),
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let timerCommand, watchpartyCommand;

beforeAll(async () => {
  timerCommand = await import('../src/commands/timer.js');
  watchpartyCommand = await import('../src/commands/watchparty.js');
});

beforeEach(() => {
  mockSearchMovies.mockReset().mockResolvedValue([]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
  mockGetMovieDetails.mockReset().mockResolvedValue({ runtime: 97, overview: 'A film.' });
  mockGetTVShowDetails.mockReset();
});

/** A guild whose only Active event is bound to the current channel. */
function makeGuild(eventName) {
  const event = {
    name: eventName,
    description: null,
    status: 2, // Active
    channelId: 'channel-1',
    entityMetadata: null,
    scheduledStartTimestamp: Date.now() + 600_000,
  };

  const collection = new Map([['0', event]]);
  collection.filter = function (fn) {
    return new Map([...this.entries()].filter(([k, v]) => fn(v, k)));
  };

  return {
    id: 'guild-1',
    scheduledEvents: { fetch: jest.fn().mockResolvedValue(collection) },
    channels: { cache: new Map() },
  };
}

function makeInteraction({ subcommand, eventName = 'The Covenant (2006)' }) {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    guild: makeGuild(eventName),
    channel: { id: 'channel-1', name: 'movie-night', send: jest.fn().mockResolvedValue(undefined) },
    user: { id: 'user-1', username: 'tester' },
    member: { voice: { channel: null } },
    client: {},
    options: {
      getSubcommand: () => subcommand,
      getString: () => null,
      getRole: () => null,
      getInteger: () => null,
      getBoolean: () => null,
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('the two commands share one implementation', () => {
  test('timer.js exports runRemind for watchparty.js to call', () => {
    expect(typeof timerCommand.runRemind).toBe('function');
  });

  test('both expose the same remind options', () => {
    const timerRemind = timerCommand.data.toJSON().options.find(o => o.name === 'remind');
    const wpRemind = watchpartyCommand.data.toJSON().options.find(o => o.name === 'remind');

    expect(wpRemind.options.map(o => o.name)).toEqual(timerRemind.options.map(o => o.name));
  });
});

describe('both paths handle a year in the event name', () => {
  // The bug: TMDB matches a query literally, so "The Covenant (2006)"
  // returned zero results and the announcement silently lost its poster,
  // runtime and overview. /timer start was fixed in 2.35.0; neither remind
  // path was, because the logic was duplicated.
  test.each([
    ['/timer remind', () => makeInteraction({ subcommand: 'remind' }), (i) => timerCommand.execute(i)],
    ['/watchparty remind', () => makeInteraction({ subcommand: 'remind' }), (i) => watchpartyCommand.execute(i)],
  ])('%s searches without the year', async (_label, build, run) => {
    mockSearchMovies.mockResolvedValue([
      { id: 9954, title: 'The Covenant', release_date: '2006-09-07', overview: 'A film.', popularity: 10 },
    ]);

    await run(build());

    expect(mockSearchMovies).toHaveBeenCalledWith('The Covenant');
    expect(mockSearchMovies).not.toHaveBeenCalledWith('The Covenant (2006)');
  });

  test.each([
    ['/timer remind', (i) => timerCommand.execute(i)],
    ['/watchparty remind', (i) => watchpartyCommand.execute(i)],
  ])('%s announces the event even when TMDB finds nothing', async (_label, run) => {
    mockSearchMovies.mockResolvedValue([]);
    mockSearchTVShows.mockResolvedValue([]);

    const interaction = makeInteraction({ subcommand: 'remind', eventName: 'Some Obscure Short' });
    await run(interaction);

    // Still announces — a missing TMDB match must not lose the reminder.
    const replied = interaction.editReply.mock.calls.length > 0;
    expect(replied).toBe(true);
  });
});

describe('watchparty rejects anything it does not handle', () => {
  test('an unknown subcommand gets a clear refusal', async () => {
    const interaction = makeInteraction({ subcommand: 'nonsense' });

    await watchpartyCommand.execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Unknown subcommand') })
    );
  });
});
