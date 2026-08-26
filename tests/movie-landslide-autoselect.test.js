/**
 * Regression/behavior coverage for /movie's landslide auto-select: when
 * hybridSearch's top result is decisively ahead of the runner-up
 * (semanticScore), the command should skip the multi-result picker and go
 * straight to the detailed embed — same as the existing single-result fast
 * path, just triggered by score instead of array length. Ambiguous/close
 * results must still show the picker, unchanged from today.
 *
 * Run with: npx jest tests/movie-landslide-autoselect.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGetMovieDetails = jest.fn();
const mockCreateSearchResults = jest.fn().mockResolvedValue({ embeds: [{ title: 'picker' }], components: [] });
const mockPickLandslideWinner = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: jest.fn(),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getMovieAlternativeTitlesDetailed: jest.fn().mockResolvedValue([]),
  pickKnownAsTitle: jest.fn().mockReturnValue(null),
  getMovieDetails: mockGetMovieDetails,
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  hybridSearch: jest.fn(),
  pickLandslideWinner: mockPickLandslideWinner,
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
  createDetailedEmbed: jest.fn().mockResolvedValue({ embeds: [{ title: 'detail' }] }),
  createSearchResults: mockCreateSearchResults,
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
let hybridSearch;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/movie.js'));
  ({ hybridSearch } = await import('../src/services/aiService.js'));
});

beforeEach(() => {
  mockGetMovieDetails.mockReset().mockResolvedValue({
    id: 1, title: 'The Thing', release_date: '1982-06-25', external_ids: {},
  });
  mockCreateSearchResults.mockClear();
  mockPickLandslideWinner.mockReset();
  hybridSearch.mockReset();
});

function makeInteraction() {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1', username: 'tester' },
    member: {},
    replied: false,
    deferred: false,
    options: {
      getString: (name) => (name === 'query' ? 'the thing' : null),
      getBoolean: () => false,
    },
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    channel: { send: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('/movie — landslide auto-select', () => {
  test('multiple results with a landslide winner: skips the picker, shows the winner directly', async () => {
    const results = [
      { id: 1, title: 'The Thing', release_date: '1982-06-25', semanticScore: 0.93 },
      { id: 2, title: 'Unrelated Movie', release_date: '2010-01-01', semanticScore: 0.40 },
    ];
    hybridSearch.mockResolvedValue(results);
    mockPickLandslideWinner.mockReturnValue(results[0]);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(mockGetMovieDetails).toHaveBeenCalledWith(1);
    expect(mockCreateSearchResults).not.toHaveBeenCalled();
  });

  test('multiple close results with no landslide winner: shows the picker as today', async () => {
    const results = [
      { id: 1, title: 'It (2017)', release_date: '2017-09-08', semanticScore: 0.91 },
      { id: 2, title: 'It (1990)', release_date: '1990-11-18', semanticScore: 0.89 },
    ];
    hybridSearch.mockResolvedValue(results);
    mockPickLandslideWinner.mockReturnValue(null);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(mockCreateSearchResults).toHaveBeenCalledWith(results, 'movie', 'the thing', false);
    expect(mockGetMovieDetails).not.toHaveBeenCalled();
  });

  test('a single result never even calls pickLandslideWinner (unambiguous already)', async () => {
    const results = [{ id: 1, title: 'The Thing', release_date: '1982-06-25' }];
    hybridSearch.mockResolvedValue(results);

    const interaction = makeInteraction();
    await execute(interaction);

    expect(mockPickLandslideWinner).not.toHaveBeenCalled();
    expect(mockGetMovieDetails).toHaveBeenCalledWith(1);
  });
});
