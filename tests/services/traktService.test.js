import { jest } from '@jest/globals';

const mockGet = jest.fn();
const mockAxiosInstance = { get: mockGet };

jest.unstable_mockModule('axios', () => ({
  default: { create: jest.fn(() => mockAxiosInstance) },
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    apis: {
      trakt: { clientId: 'test-trakt-key', baseUrl: 'https://api.trakt.tv' },
    },
  },
}));

let traktService;
beforeAll(async () => {
  traktService = await import('../../src/services/traktService.js');
});

beforeEach(() => {
  mockGet.mockReset();
});

describe('searchMoviesOnTrakt / searchShowsOnTrakt', () => {
  test('searchMoviesOnTrakt returns response.data on success', async () => {
    const data = [{ movie: { title: 'The Thing' } }];
    mockGet.mockResolvedValueOnce({ data });

    const result = await traktService.searchMoviesOnTrakt('the thing');

    expect(result).toEqual(data);
    expect(mockGet).toHaveBeenCalledWith('/search/movie', { params: { query: 'the thing' } });
  });

  test('searchMoviesOnTrakt returns null (not throw) on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const result = await traktService.searchMoviesOnTrakt('the thing');
    expect(result).toBeNull();
  });

  test('searchShowsOnTrakt returns response.data on success', async () => {
    const data = [{ show: { title: 'Severance' } }];
    mockGet.mockResolvedValueOnce({ data });

    const result = await traktService.searchShowsOnTrakt('severance');

    expect(result).toEqual(data);
    expect(mockGet).toHaveBeenCalledWith('/search/show', { params: { query: 'severance' } });
  });

  test('searchShowsOnTrakt returns null (not throw) on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const result = await traktService.searchShowsOnTrakt('severance');
    expect(result).toBeNull();
  });
});

describe('getMovieRating', () => {
  test('returns null immediately for falsy imdbId, no API call made', async () => {
    const result = await traktService.getMovieRating(null);
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns response.data on success', async () => {
    mockGet.mockResolvedValueOnce({ data: { rating: 7.8, votes: 5000 } });
    const result = await traktService.getMovieRating('tt0084787');
    expect(result).toEqual({ rating: 7.8, votes: 5000 });
    expect(mockGet).toHaveBeenCalledWith('/movies/tt0084787/ratings');
  });

  test('returns null (not throw) on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const result = await traktService.getMovieRating('tt0084787');
    expect(result).toBeNull();
  });
});

describe('getShowRating', () => {
  test('returns null immediately for falsy identifier', async () => {
    const result = await traktService.getShowRating(undefined);
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns response.data on success', async () => {
    mockGet.mockResolvedValueOnce({ data: { rating: 8.9 } });
    const result = await traktService.getShowRating('severance');
    expect(result).toEqual({ rating: 8.9 });
    expect(mockGet).toHaveBeenCalledWith('/shows/severance/ratings');
  });

  test('returns null (not throw) on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const result = await traktService.getShowRating('severance');
    expect(result).toBeNull();
  });
});

describe('getEpisodeRating', () => {
  test('returns null immediately for falsy showId', async () => {
    const result = await traktService.getEpisodeRating(null, 1, 1);
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns response.data on success', async () => {
    mockGet.mockResolvedValueOnce({ data: { rating: 9.1 } });
    const result = await traktService.getEpisodeRating('severance', 1, 6);
    expect(result).toEqual({ rating: 9.1 });
    expect(mockGet).toHaveBeenCalledWith('/shows/severance/seasons/1/episodes/6/ratings');
  });

  test('returns null (not throw) on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const result = await traktService.getEpisodeRating('severance', 1, 6);
    expect(result).toBeNull();
  });
});
