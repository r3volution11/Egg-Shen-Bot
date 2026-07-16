/**
 * Regression coverage for the visibility bug in selectHandler.js's
 * `select_result` branch (used by /movie, /tv, /game, /boardgame, /book
 * when a search returns multiple matches).
 *
 * Previously, choosing a result from the picker always ended with
 * interaction.editReply(), which can only ever edit the same ephemeral
 * picker message in place — so even though the picker looked "private for
 * disambiguation," the actual final answer nobody else could see either,
 * defeating the entire point of a channel-shared lookup command. It's now
 * routed through deliverResult(), which deletes the ephemeral picker and
 * posts a real public message in the channel unless the value was encoded
 * with isPrivate:true (the new /movie ... private:true option).
 *
 * Run with: npx jest tests/select-result-visibility.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import { encodePrivateFlag } from '../src/utils/interactionResponse.js';

const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetOMDBData = jest.fn();
const mockGetMovieRating = jest.fn();
const mockGetShowRating = jest.fn();
const mockGetLetterboxdRating = jest.fn();
const mockGetUnifiedMovieWatchProviders = jest.fn();
const mockGetUnifiedTVWatchProviders = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getUnifiedMovieWatchProviders: mockGetUnifiedMovieWatchProviders,
  getUnifiedTVWatchProviders: mockGetUnifiedTVWatchProviders,
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/services/omdbService.js', () => ({
  getOMDBData: mockGetOMDBData,
}));

jest.unstable_mockModule('../src/services/traktService.js', () => ({
  getMovieRating: mockGetMovieRating,
  getShowRating: mockGetShowRating,
}));

jest.unstable_mockModule('../src/services/letterboxdService.js', () => ({
  getLetterboxdRating: mockGetLetterboxdRating,
}));

jest.unstable_mockModule('../src/services/urlService.js', () => ({
  getIMDbUrl: () => 'https://imdb.com/x',
  getLetterboxdUrl: () => null,
  getTraktMovieUrl: () => null,
  getTraktShowUrl: () => null,
  getRottenTomatoesUrl: () => null,
  getJustWatchUrl: () => null,
}));

jest.unstable_mockModule('../src/utils/embedBuilder.js', () => ({
  createDetailedEmbed: jest.fn().mockResolvedValue({ embeds: [{ title: 'Result' }] }),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  getStatsConfig: jest.fn().mockResolvedValue({ enabled: false }),
  loadGuildConfig: jest.fn().mockResolvedValue({ region: 'US' }),
}));

jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  trackSearch: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../src/api/server.js', () => ({
  saveEventChannelSelections: jest.fn().mockResolvedValue(undefined),
}));

let handleSelectInteraction;

beforeAll(async () => {
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
});

beforeEach(() => {
  mockGetMovieDetails.mockReset().mockResolvedValue({
    id: 1, title: 'The Thing', release_date: '1982-06-25', external_ids: { imdb_id: 'tt0084787' },
  });
  mockGetTVShowDetails.mockReset().mockResolvedValue({
    id: 2, name: 'Severance', first_air_date: '2022-02-18', external_ids: { imdb_id: 'tt11280740' },
  });
  mockGetOMDBData.mockReset().mockResolvedValue(null);
  mockGetMovieRating.mockReset().mockResolvedValue(null);
  mockGetShowRating.mockReset().mockResolvedValue(null);
  mockGetLetterboxdRating.mockReset().mockResolvedValue(null);
  mockGetUnifiedMovieWatchProviders.mockReset().mockResolvedValue(null);
  mockGetUnifiedTVWatchProviders.mockReset().mockResolvedValue(null);
});

function makeInteraction(value) {
  return {
    customId: 'select_result',
    values: [value],
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    replied: false,
    deferred: false,
    deferUpdate: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    channel: { send: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('select_result — movie/tv visibility', () => {
  test('a public selection (isPrivate:false) deletes the ephemeral picker and posts to the channel', async () => {
    const interaction = makeInteraction(encodePrivateFlag('movie_1', false));

    await handleSelectInteraction(interaction);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  test('a private selection (isPrivate:true) edits the ephemeral picker in place instead', async () => {
    const interaction = makeInteraction(encodePrivateFlag('movie_1', true));

    await handleSelectInteraction(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });

  test('works the same way for a TV selection', async () => {
    const interaction = makeInteraction(encodePrivateFlag('tv_2', false));

    await handleSelectInteraction(interaction);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
  });
});
