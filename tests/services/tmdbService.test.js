import { jest } from '@jest/globals';

const mockGet = jest.fn();
const mockAxiosInstance = { get: mockGet };
const mockGetWatchmodeProviders = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { create: jest.fn(() => mockAxiosInstance) },
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    apis: {
      tmdb: {
        apiKey: 'test-tmdb-key',
        baseUrl: 'https://api.themoviedb.org/3',
        imageBaseUrl: 'https://image.tmdb.org/t/p',
      },
    },
  },
}));

jest.unstable_mockModule('../../src/services/watchmodeService.js', () => ({
  getWatchmodeProvidersByImdbId: mockGetWatchmodeProviders,
}));

let tmdbService;
beforeAll(async () => {
  tmdbService = await import('../../src/services/tmdbService.js');
});

beforeEach(() => {
  mockGet.mockReset();
  mockGetWatchmodeProviders.mockReset();
});

describe('searchMovies / searchTVShows', () => {
  test('searchMovies returns top-50 slice on success', async () => {
    const results = Array.from({ length: 60 }, (_, i) => ({ id: i, title: `Movie ${i}` }));
    mockGet.mockResolvedValueOnce({ data: { results } });

    const result = await tmdbService.searchMovies('the thing');

    expect(result).toHaveLength(50);
  });

  test('searchMovies throws a wrapped error on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(tmdbService.searchMovies('the thing')).rejects.toThrow('Failed to search for movies');
  });

  test('searchTVShows returns top-50 slice on success', async () => {
    const results = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Show ${i}` }));
    mockGet.mockResolvedValueOnce({ data: { results } });

    const result = await tmdbService.searchTVShows('severance');

    expect(result).toHaveLength(5);
  });

  test('searchTVShows throws a wrapped error on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(tmdbService.searchTVShows('severance')).rejects.toThrow('Failed to search for TV shows');
  });
});

describe('getMovieDetails / getTVShowDetails', () => {
  test('getMovieDetails merges details + external_ids', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 1, title: 'The Thing' } })
      .mockResolvedValueOnce({ data: { imdb_id: 'tt0084787' } });

    const result = await tmdbService.getMovieDetails(1);

    expect(result).toEqual({ id: 1, title: 'The Thing', external_ids: { imdb_id: 'tt0084787' } });
  });

  test('getMovieDetails throws a wrapped error if either call rejects', async () => {
    mockGet.mockResolvedValueOnce({ data: { id: 1 } }).mockRejectedValueOnce(new Error('network down'));
    await expect(tmdbService.getMovieDetails(1)).rejects.toThrow('Failed to get movie details');
  });

  test('getTVShowDetails merges details + external_ids', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { id: 2, name: 'Severance' } })
      .mockResolvedValueOnce({ data: { tvdb_id: 12345 } });

    const result = await tmdbService.getTVShowDetails(2);

    expect(result).toEqual({ id: 2, name: 'Severance', external_ids: { tvdb_id: 12345 } });
  });

  test('getTVShowDetails throws a wrapped error if either call rejects', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: {} });
    await expect(tmdbService.getTVShowDetails(2)).rejects.toThrow('Failed to get TV show details');
  });
});

describe('getSeasonDetails — returns null on failure, unlike getMovieDetails', () => {
  test('returns response.data on success', async () => {
    const data = { season_number: 1, episodes: [{ name: 'Pilot' }] };
    mockGet.mockResolvedValueOnce({ data });
    const result = await tmdbService.getSeasonDetails(2, 1);
    expect(result).toEqual(data);
  });

  test('returns null (not throw) on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    const result = await tmdbService.getSeasonDetails(2, 1);
    expect(result).toBeNull();
  });
});

describe('getEpisodeDetails', () => {
  test('swallows an external_ids failure and still succeeds with external_ids: {}', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { name: 'Pilot', episode_number: 1 } }) // details
      .mockRejectedValueOnce(new Error('external_ids unavailable')); // external_ids

    const result = await tmdbService.getEpisodeDetails(2, 1, 1);

    expect(result).toEqual({ name: 'Pilot', episode_number: 1, external_ids: {} });
  });

  test('propagates a wrapped error when the details call itself fails', async () => {
    // Promise.all fires both calls regardless; external_ids has its own internal
    // .catch(), so it still needs a queued response even though it's irrelevant here.
    mockGet.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: {} });
    await expect(tmdbService.getEpisodeDetails(2, 1, 1)).rejects.toThrow('Failed to get episode details');
  });
});

describe('searchEpisodeByName', () => {
  test('returns null when the show has no seasons', async () => {
    // getTVShowDetails: details + external_ids, with no number_of_seasons
    mockGet.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: {} });

    const result = await tmdbService.searchEpisodeByName(2, 'Pilot');

    expect(result).toBeNull();
  });

  test('finds a matching episode across seasons and fetches its full details', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { number_of_seasons: 1, name: 'Severance' } }) // show details
      .mockResolvedValueOnce({ data: {} }) // show external_ids
      .mockResolvedValueOnce({
        data: { episodes: [{ name: 'The We We Are', episode_number: 9 }] },
      }) // season 1 details
      .mockResolvedValueOnce({ data: { name: 'The We We Are', episode_number: 9 } }) // episode details
      .mockResolvedValueOnce({ data: {} }); // episode external_ids

    const result = await tmdbService.searchEpisodeByName(2, 'we we are');

    expect(result.name).toBe('The We We Are');
    expect(result.season_number).toBe(1);
  });

  test('returns null (not throw) on any downstream error', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    const result = await tmdbService.searchEpisodeByName(2, 'Pilot');
    expect(result).toBeNull();
  });
});

describe('getPosterUrl / getBackdropUrl — pure functions', () => {
  test('getPosterUrl returns null for a falsy path', () => {
    expect(tmdbService.getPosterUrl(null)).toBeNull();
  });

  test('getPosterUrl builds the default-size URL', () => {
    expect(tmdbService.getPosterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
  });

  test('getPosterUrl respects a custom size', () => {
    expect(tmdbService.getPosterUrl('/abc.jpg', 'original')).toBe(
      'https://image.tmdb.org/t/p/original/abc.jpg'
    );
  });

  test('getBackdropUrl returns null for a falsy path', () => {
    expect(tmdbService.getBackdropUrl(undefined)).toBeNull();
  });

  test('getBackdropUrl builds the default-size URL', () => {
    expect(tmdbService.getBackdropUrl('/backdrop.jpg')).toBe(
      'https://image.tmdb.org/t/p/w1280/backdrop.jpg'
    );
  });
});

describe('getMovieWatchProviders / getTVWatchProviders', () => {
  test('returns null when the region has no providers entry', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: { GB: { flatrate: [] } } } });
    const result = await tmdbService.getMovieWatchProviders(1, 'US');
    expect(result).toBeNull();
  });

  test('returns normalized provider data on success', async () => {
    mockGet.mockResolvedValueOnce({
      data: { results: { US: { link: 'https://tmdb.org/watch', flatrate: [{ provider_name: 'Netflix' }] } } },
    });

    const result = await tmdbService.getMovieWatchProviders(1, 'US');

    expect(result).toEqual({
      link: 'https://tmdb.org/watch',
      flatrate: [{ provider_name: 'Netflix' }],
      rent: [],
      buy: [],
    });
  });

  test('returns null (not throw) on request failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    const result = await tmdbService.getMovieWatchProviders(1, 'US');
    expect(result).toBeNull();
  });

  test('getTVWatchProviders returns normalized provider data on success', async () => {
    mockGet.mockResolvedValueOnce({
      data: { results: { US: { flatrate: [{ provider_name: 'Hulu' }] } } },
    });
    const result = await tmdbService.getTVWatchProviders(2, 'US');
    expect(result.flatrate).toEqual([{ provider_name: 'Hulu' }]);
  });
});

describe('getUnifiedMovieWatchProviders / getUnifiedTVWatchProviders', () => {
  test('merges TMDB and Watchmode providers, deduping by normalized name (TMDB wins)', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        results: {
          US: {
            link: 'https://tmdb.org/watch',
            flatrate: [{ provider_name: 'Netflix', logo: 'tmdb-logo.png' }],
          },
        },
      },
    });
    mockGetWatchmodeProviders.mockResolvedValueOnce({
      flatrate: [
        { provider_name: 'netflix', logo: 'watchmode-logo.png' }, // dupe of TMDB's Netflix (different case)
        { provider_name: 'Hulu', logo: 'watchmode-hulu.png' },
      ],
    });

    const result = await tmdbService.getUnifiedMovieWatchProviders(1, 'tt0084787', 'US');

    expect(result.flatrate).toHaveLength(2);
    expect(result.flatrate[0]).toEqual({ provider_name: 'Netflix', logo: 'tmdb-logo.png' }); // TMDB's version kept
    expect(result.flatrate[1].provider_name).toBe('Hulu');
    expect(mockGetWatchmodeProviders).toHaveBeenCalledWith('tt0084787', 'US');
  });

  test('skips the Watchmode call entirely when imdbId is falsy', async () => {
    mockGet.mockResolvedValueOnce({
      data: { results: { US: { flatrate: [{ provider_name: 'Netflix' }] } } },
    });

    const result = await tmdbService.getUnifiedMovieWatchProviders(1, null, 'US');

    expect(mockGetWatchmodeProviders).not.toHaveBeenCalled();
    expect(result.flatrate).toEqual([{ provider_name: 'Netflix' }]);
  });

  test('returns null when both sources have no providers', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: {} } });
    mockGetWatchmodeProviders.mockResolvedValueOnce(null);

    const result = await tmdbService.getUnifiedMovieWatchProviders(1, 'tt0084787', 'US');

    expect(result).toBeNull();
  });

  test('getUnifiedTVWatchProviders merges the same way for TV', async () => {
    mockGet.mockResolvedValueOnce({
      data: { results: { US: { flatrate: [{ provider_name: 'Hulu' }] } } },
    });
    mockGetWatchmodeProviders.mockResolvedValueOnce({ flatrate: [{ provider_name: 'Peacock' }] });

    const result = await tmdbService.getUnifiedTVWatchProviders(2, 'tt1234567', 'US');

    expect(result.flatrate.map((p) => p.provider_name)).toEqual(['Hulu', 'Peacock']);
  });
});
