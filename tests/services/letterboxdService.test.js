import { jest } from '@jest/globals';

const mockGetFilm = jest.fn();

jest.unstable_mockModule('letterboxd-retriever', () => ({
  getFilm: mockGetFilm,
}));

let letterboxdService;
beforeAll(async () => {
  letterboxdService = await import('../../src/services/letterboxdService.js');
});

beforeEach(() => {
  mockGetFilm.mockReset();
});

describe('getLetterboxdRating', () => {
  test('returns null immediately for a falsy imdbId, without calling getFilm', async () => {
    const result = await letterboxdService.getLetterboxdRating(null);
    expect(result).toBeNull();
    expect(mockGetFilm).not.toHaveBeenCalled();
  });

  test('returns rating and ratingCount when aggregateRating is present', async () => {
    mockGetFilm.mockResolvedValueOnce({
      ldJson: { aggregateRating: { ratingValue: 4.2, ratingCount: 123456 } },
    });

    const result = await letterboxdService.getLetterboxdRating('tt0111161');

    expect(result).toEqual({ rating: 4.2, ratingCount: 123456 });
    expect(mockGetFilm).toHaveBeenCalledWith({ imdbId: 'tt0111161' });
  });

  test('returns null when ldJson is missing', async () => {
    mockGetFilm.mockResolvedValueOnce({});
    const result = await letterboxdService.getLetterboxdRating('tt0111161');
    expect(result).toBeNull();
  });

  test('returns null when aggregateRating is missing', async () => {
    mockGetFilm.mockResolvedValueOnce({ ldJson: {} });
    const result = await letterboxdService.getLetterboxdRating('tt0111161');
    expect(result).toBeNull();
  });

  test('returns null (does not throw) when getFilm rejects', async () => {
    mockGetFilm.mockRejectedValueOnce(new Error('scrape failed'));
    const result = await letterboxdService.getLetterboxdRating('tt0111161');
    expect(result).toBeNull();
  });
});
