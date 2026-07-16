/**
 * Regression coverage for the "everyone should see /movie results" bug:
 * search commands' single-result fast path used to call
 * interaction.editReply() on the always-ephemeral deferred reply, so even
 * though /movie, /tv, etc. are meant to be shared lookups, the actual
 * answer was only ever visible to the person who ran the command.
 *
 * Commands now default to posting the final result publicly (deleting the
 * ephemeral reply and sending a fresh message to the channel via
 * deliverResult), unless the new `private:true` option is set, in which
 * case the old editReply-in-place behavior is kept intentionally.
 *
 * Run with: npx jest tests/private-option-visibility.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGetMovieDetails = jest.fn();
const mockGetMovieAlternativeTitlesDetailed = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: jest.fn().mockResolvedValue([{ id: 1, title: 'The Thing', release_date: '1982-06-25' }]),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getMovieAlternativeTitlesDetailed: mockGetMovieAlternativeTitlesDetailed,
  pickKnownAsTitle: jest.fn().mockReturnValue(null),
  getMovieDetails: mockGetMovieDetails,
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  hybridSearch: jest.fn(async (query, searchFn) => searchFn(query)),
}));

jest.unstable_mockModule('../src/services/omdbService.js', () => ({
  getOMDBData: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/traktService.js', () => ({
  getMovieRating: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/letterboxdService.js', () => ({
  getLetterboxdRating: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/urlService.js', () => ({
  getIMDbUrl: () => null,
  getLetterboxdUrl: () => null,
  getTraktMovieUrl: () => null,
  getRottenTomatoesUrl: () => null,
  getJustWatchUrl: () => null,
}));

jest.unstable_mockModule('../src/utils/embedBuilder.js', () => ({
  createDetailedEmbed: jest.fn().mockResolvedValue({ embeds: [{ title: 'The Thing' }] }),
  createSearchResults: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  canUseCommand: jest.fn().mockResolvedValue(true),
  loadGuildConfig: jest.fn().mockResolvedValue({ region: 'US', maxSearchResults: 20 }),
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  getStatsConfig: jest.fn().mockResolvedValue({ enabled: false }),
}));

jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  trackSearch: jest.fn().mockResolvedValue(undefined),
}));

let execute;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/movie.js'));
});

beforeEach(() => {
  mockGetMovieDetails.mockReset().mockResolvedValue({
    id: 1, title: 'The Thing', release_date: '1982-06-25', external_ids: {},
  });
  mockGetMovieAlternativeTitlesDetailed.mockReset().mockResolvedValue([]);
});

function makeInteraction({ isPrivate = false } = {}) {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1', username: 'tester' },
    member: {},
    replied: false,
    deferred: false,
    options: {
      getString: (name) => (name === 'query' ? 'the thing' : null),
      getBoolean: (name) => (name === 'private' ? isPrivate : null),
    },
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    channel: { send: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('/movie — private option', () => {
  test('default (no private flag): single-result posts publicly, ephemeral reply is deleted', async () => {
    const interaction = makeInteraction();

    await execute(interaction);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).not.toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.anything() }));
  });

  test('private:true: single-result stays on the ephemeral reply, nothing posted to the channel', async () => {
    const interaction = makeInteraction({ isPrivate: true });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.anything() }));
    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });
});

