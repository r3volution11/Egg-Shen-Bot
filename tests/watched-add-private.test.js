/**
 * Regression coverage for /watched add's visibility bug: like /movie, /tv,
 * etc., the single-result fast path used to editReply() on the always-
 * ephemeral deferred reply, so the "Added to Watch History" confirmation
 * was only ever visible to whoever ran the command — even though logging
 * something to shared server watch history is meant to be visible to the
 * rest of the channel.
 *
 * Run with: npx jest tests/watched-add-private.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockSaveWatchHistory = jest.fn();

jest.unstable_mockModule('../src/utils/watchHistoryManager.js', () => ({
  saveWatchHistory: mockSaveWatchHistory,
  getWatchHistory: jest.fn(),
}));

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: jest.fn().mockResolvedValue([{ id: 1, title: 'The Thing', release_date: '1982-06-25' }]),
  searchTVShows: jest.fn().mockResolvedValue([]),
  getMovieDetails: jest.fn(),
  getTVShowDetails: jest.fn(),
  getPosterUrl: jest.fn().mockReturnValue(null),
}));

jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  trackSearch: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({ maxSearchResults: 20 }),
}));

let execute;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/watched.js'));
});

beforeEach(() => {
  mockSaveWatchHistory.mockReset().mockResolvedValue(undefined);
});

function makeInteraction({ isPrivate = false } = {}) {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    replied: false,
    deferred: false,
    options: {
      getSubcommand: () => 'add',
      getString: (name) => (name === 'title' ? 'the thing' : null),
      getBoolean: (name) => (name === 'private' ? isPrivate : null),
    },
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    channel: { send: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('/watched add — private option', () => {
  test('default: posts the "Added to Watch History" confirmation publicly', async () => {
    const interaction = makeInteraction();

    await execute(interaction);

    expect(mockSaveWatchHistory).toHaveBeenCalledTimes(1);
    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
  });

  test('private:true: confirmation stays on the ephemeral reply, nothing posted to the channel', async () => {
    const interaction = makeInteraction({ isPrivate: true });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.anything() }));
    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });
});
