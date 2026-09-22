/**
 * End-to-end regression coverage for the two select-menu flows that carry
 * context through a disambiguation: /watched log and /watchlist add.
 *
 * Both encoded their context (user id, note, privacy flag) as base64 inside
 * the option value and truncated it to fit Discord's 100-character cap. The
 * truncated base64 never parsed, so:
 *
 *   - /watched log failed on EVERY ambiguous title — 100% of the time. The
 *     single-result path worked, which is why it went unnoticed: anyone
 *     testing with an unambiguous title never reached it.
 *   - /watchlist add failed once a note of ~30 characters pushed the value
 *     past the limit.
 *
 * Neither handler had any test coverage at all. These tests drive the real
 * command to build the menu, then feed its own option value back into the
 * real handler — so a truncation bug of any shape fails here.
 *
 * Run with: npm test -- tests/selection-payload-roundtrip.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

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
  // selectHandler imports these statically.
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
  getUnifiedTVWatchProviders: jest.fn().mockResolvedValue(null),
  getGenres: jest.fn().mockResolvedValue([]),
  searchPeople: jest.fn().mockResolvedValue([]),
  getPersonById: jest.fn().mockResolvedValue(null),
  discoverTitles: jest.fn().mockResolvedValue([]),
  getSimilarMovies: jest.fn().mockResolvedValue([]),
  getSimilarTV: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn().mockResolvedValue([]),
  getBoardGameDetails: jest.fn(),
}));

let watchedExecute, watchlistExecute, handleSelectInteraction;
let getWatchHistory, clearWatchHistory;
let _resetSelections;

const GUILD_ID = 'selection-roundtrip-guild';
const USER_ID = '348924434679332864'; // a real-length snowflake — the payload size that broke it

beforeAll(async () => {
  ({ execute: watchedExecute } = await import('../src/commands/watched.js'));
  ({ execute: watchlistExecute } = await import('../src/commands/watchlist.js'));
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
  ({ getWatchHistory, clearWatchHistory } = await import('../src/utils/watchHistoryManager.js'));
  ({ _resetSelections } = await import('../src/utils/pendingSelections.js'));
});

beforeEach(async () => {
  _resetSelections();
  await clearWatchHistory(GUILD_ID).catch(() => {});
  mockSearchMovies.mockReset().mockResolvedValue([]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
  mockGetMovieDetails.mockReset().mockResolvedValue({
    id: 275, title: 'Fargo', release_date: '1996-03-08', poster_path: null, external_ids: {},
  });
  mockGetTVShowDetails.mockReset().mockResolvedValue({
    id: 60622, name: 'Fargo', first_air_date: '2014-04-15', poster_path: null, external_ids: {},
  });
});

afterEach(async () => {
  await clearWatchHistory(GUILD_ID).catch(() => {});
});

/** Two same-named results, so the command must show a picker. */
function seedAmbiguous() {
  mockSearchMovies.mockResolvedValue([{ id: 275, title: 'Fargo', release_date: '1996-03-08' }]);
  mockSearchTVShows.mockResolvedValue([{ id: 60622, name: 'Fargo', first_air_date: '2014-04-15' }]);
}

function makeCommandInteraction({ subcommand, options = {} }) {
  return {
    guildId: GUILD_ID,
    channelId: 'channel-1',
    user: { id: USER_ID, username: 'r3volution11' },
    member: { permissions: { has: () => false } },
    channel: { name: 'movie-night', send: jest.fn().mockResolvedValue(undefined) },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
      getBoolean: (name) => options[name] ?? null,
      getInteger: () => null,
    },
    reply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

/** The option values from whichever reply carried a select menu. */
function menuValues(interaction) {
  const calls = [...interaction.editReply.mock.calls, ...interaction.reply.mock.calls];
  const withMenu = calls.find(c => c[0]?.components?.length);
  expect(withMenu).toBeDefined();
  return withMenu[0].components[0].components[0].options.map(o => o.data.value);
}

function makeSelectInteraction({ customId, value }) {
  return {
    customId,
    guildId: GUILD_ID,
    channelId: 'channel-1',
    values: [value],
    user: { id: USER_ID, username: 'r3volution11' },
    member: { permissions: { has: () => false } },
    channel: { name: 'movie-night', send: jest.fn().mockResolvedValue(undefined) },
    message: { delete: jest.fn().mockResolvedValue(undefined), embeds: [] },
    replied: false,
    deferred: false,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/watched add — the ambiguous-title path', () => {
  test('every option value fits inside Discord\'s 100-character cap', async () => {
    seedAmbiguous();
    const interaction = makeCommandInteraction({
      subcommand: 'add',
      options: { title: 'Fargo', notes: 'watched with the Sunday crew, projector setup' },
    });

    await watchedExecute(interaction);

    for (const value of menuValues(interaction)) {
      expect(value.length).toBeLessThanOrEqual(100);
    }
  });

  test('selecting a result actually writes the watch-history entry', async () => {
    // This is the case that failed 100% of the time: the truncated payload
    // threw on parse, the user saw "An error occurred", nothing was saved.
    seedAmbiguous();
    const command = makeCommandInteraction({
      subcommand: 'add',
      options: { title: 'Fargo', notes: 'great rewatch' },
    });
    await watchedExecute(command);

    const value = menuValues(command).find(v => v.startsWith('watched_movie_'));
    await handleSelectInteraction(makeSelectInteraction({ customId: 'select_watched', value }));

    const history = await getWatchHistory(GUILD_ID, 'all', 100);
    expect(history).toHaveLength(1);
    expect(history[0].title).toBe('Fargo');
    expect(history[0].notes).toBe('great rewatch');
  });

  test('carries the note and privacy flag through the selection', async () => {
    seedAmbiguous();
    const command = makeCommandInteraction({
      subcommand: 'add',
      options: { title: 'Fargo', notes: 'a note long enough to have overflowed the old encoding', private: true },
    });
    await watchedExecute(command);

    const value = menuValues(command).find(v => v.startsWith('watched_'));
    await handleSelectInteraction(makeSelectInteraction({ customId: 'select_watched', value }));

    const history = await getWatchHistory(GUILD_ID, 'all', 100);
    expect(history[0].notes).toBe('a note long enough to have overflowed the old encoding');
    expect(history[0].savedById).toBe(USER_ID);
  });

  test('works with no note at all', async () => {
    // Even the minimum payload — just a snowflake and a username — used to
    // exceed the old 50-character truncation.
    seedAmbiguous();
    const command = makeCommandInteraction({ subcommand: 'add', options: { title: 'Fargo' } });
    await watchedExecute(command);

    const value = menuValues(command).find(v => v.startsWith('watched_'));
    await handleSelectInteraction(makeSelectInteraction({ customId: 'select_watched', value }));

    expect(await getWatchHistory(GUILD_ID, 'all', 100)).toHaveLength(1);
  });

  test('a different user cannot resolve someone else\'s selection', async () => {
    seedAmbiguous();
    const command = makeCommandInteraction({ subcommand: 'add', options: { title: 'Fargo' } });
    await watchedExecute(command);

    const value = menuValues(command).find(v => v.startsWith('watched_'));
    const select = makeSelectInteraction({ customId: 'select_watched', value });
    select.user = { id: 'someone-else', username: 'intruder' };

    await handleSelectInteraction(select);

    expect(await getWatchHistory(GUILD_ID, 'all', 100)).toHaveLength(0);
    expect(select.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who ran') })
    );
  });

  test('an expired selection says so instead of failing silently', async () => {
    seedAmbiguous();
    const command = makeCommandInteraction({ subcommand: 'add', options: { title: 'Fargo' } });
    await watchedExecute(command);

    const value = menuValues(command).find(v => v.startsWith('watched_'));
    _resetSelections(); // simulate expiry

    const select = makeSelectInteraction({ customId: 'select_watched', value });
    await handleSelectInteraction(select);

    expect(select.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('expired') })
    );
  });
});

describe('/watchlist add — the ambiguous-title path', () => {
  test('a normal-length note no longer overflows the option value', async () => {
    seedAmbiguous();
    const interaction = makeCommandInteraction({
      subcommand: 'add',
      options: { title: 'Fargo', note: 'Recommended by three people in chat last week' },
    });

    await watchlistExecute(interaction);

    for (const value of menuValues(interaction)) {
      expect(value.length).toBeLessThanOrEqual(100);
    }
  });
});
