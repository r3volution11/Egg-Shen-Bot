/**
 * Contract tests for every select-menu handler.
 *
 * Two of these handlers shipped a 100% failure rate because nothing
 * exercised them: /watched add and /watchlist add packed context into the
 * option value, truncated it to fit Discord's 100-character cap, and threw
 * on every parse. The user saw "An error occurred" and nothing was saved.
 *
 * Rather than only testing the two that broke, this pins the contract every
 * handler has to satisfy:
 *
 *   1. It is registered — an unregistered customId is silently dropped by
 *      the allowlist at the top of handleSelectInteraction, which fails with
 *      nothing in the logs.
 *   2. Malformed or unknown input is refused, not thrown on.
 *
 * Option-value length is checked where a command builds a menu, since that
 * is the limit the truncation bugs violated.
 *
 * Run with: npm test -- tests/select-handler-contract.test.js
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: jest.fn().mockResolvedValue([]),
  searchTVShows: jest.fn().mockResolvedValue([]),
  getMovieDetails: jest.fn().mockResolvedValue(null),
  getTVShowDetails: jest.fn().mockResolvedValue(null),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn().mockResolvedValue(null),
  sumEpisodeRuntimes: jest.fn(),
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
  getUnifiedTVWatchProviders: jest.fn().mockResolvedValue(null),
  getStreamingServices: jest.fn().mockResolvedValue([]),
  resolveStreamingServices: jest.fn().mockResolvedValue({ services: [], ids: [], unknown: [] }),
  getEpisodeDetails: jest.fn().mockResolvedValue(null),
  searchEpisodeByName: jest.fn().mockResolvedValue(null),
  discoverRandomMovie: jest.fn().mockResolvedValue(null),
  discoverRandomTV: jest.fn().mockResolvedValue(null),
  getSimilarMovies: jest.fn().mockResolvedValue([]),
  getSimilarTV: jest.fn().mockResolvedValue([]),
  getGenres: jest.fn().mockResolvedValue([]),
  searchPeople: jest.fn().mockResolvedValue([]),
  getPersonById: jest.fn().mockResolvedValue(null),
  discoverTitles: jest.fn().mockResolvedValue([]),
  buildDiscoverParams: jest.fn(() => ({})),
  getBackdropUrl: jest.fn(() => null),
}));

let handleSelectInteraction;

const HANDLER_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/handlers/selectHandler.js'),
  'utf8'
);

beforeAll(async () => {
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
});

/** Every customId the handler branches on. */
function declaredCustomIds() {
  return [...HANDLER_SOURCE.matchAll(/customId === '([a-z_]+)'/g)].map(m => m[1]);
}

/** The allowlist that gates the whole handler. */
function allowlistedIds() {
  const block = HANDLER_SOURCE.slice(
    HANDLER_SOURCE.indexOf('const handledIds'),
    HANDLER_SOURCE.indexOf('const isHandled')
  );
  return [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
}

function makeInteraction(customId, value) {
  return {
    customId,
    values: [value],
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1', username: 'tester' },
    member: { permissions: { has: () => false } },
    // channel.send must resolve to something editable — timer_select_runtime
    // falls through to starting a countdown, which edits the message it sent.
    channel: {
      name: 'general',
      send: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue(undefined) }),
    },
    message: {
      delete: jest.fn().mockResolvedValue(undefined),
      edit: jest.fn().mockResolvedValue(undefined),
      embeds: [],
      components: [],
    },
    replied: false,
    deferred: false,
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('every handler is reachable', () => {
  test('there are handlers to check', () => {
    expect(declaredCustomIds().length).toBeGreaterThan(3);
  });

  test.each(declaredCustomIds().map(id => [id]))(
    '%s is in the allowlist, so it is not silently dropped',
    (customId) => {
      // handleSelectInteraction returns early for anything not allowlisted,
      // with no log line — the user just sees "This interaction failed".
      expect(allowlistedIds()).toContain(customId);
    }
  );
});

describe('malformed input is refused, not thrown on', () => {
  // A handler that throws produces a generic error and, worse, can leave the
  // interaction unacknowledged. Every one of these should fail gracefully.
  const garbage = [
    ['empty', ''],
    ['no separators', 'garbage'],
    ['missing segments', 'watched_movie'],
    ['non-numeric id', 'similar_movie_notanumber'],
    ['unknown nonce', 'watched_movie_550_doesnotexist'],
  ];

  const ids = [...new Set(declaredCustomIds())];

  test.each(
    ids.flatMap(id => garbage.map(([label, value]) => [id, label, value]))
  )('%s survives %s', async (customId, _label, value) => {
    const interaction = makeInteraction(customId, value);

    await expect(handleSelectInteraction(interaction)).resolves.not.toThrow();
  });
});

describe('an unregistered customId is a no-op', () => {
  test('does nothing rather than erroring', async () => {
    const interaction = makeInteraction('not_a_real_handler', 'anything');

    await handleSelectInteraction(interaction);

    // The allowlist returns before deferring — nothing should have happened.
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });
});
