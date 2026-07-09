import { jest } from '@jest/globals';

const mockGet = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: mockGet },
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    apis: {
      omdb: { apiKey: 'test-omdb-key', baseUrl: 'https://www.omdbapi.com/' },
    },
  },
}));

let omdbService;
beforeAll(async () => {
  omdbService = await import('../../src/services/omdbService.js');
});

beforeEach(() => {
  mockGet.mockReset();
});

describe('getOMDBData', () => {
  test('returns null immediately for a falsy imdbId, without calling the API', async () => {
    const result = await omdbService.getOMDBData(null);
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns response.data on success', async () => {
    const data = { Response: 'True', Title: 'The Thing', imdbRating: '8.2' };
    mockGet.mockResolvedValueOnce({ data });

    const result = await omdbService.getOMDBData('tt0084787');

    expect(result).toEqual(data);
    expect(mockGet).toHaveBeenCalledWith(
      'https://www.omdbapi.com/',
      expect.objectContaining({ params: expect.objectContaining({ i: 'tt0084787', apikey: 'test-omdb-key' }) })
    );
  });

  test('returns null when OMDB reports Response: False', async () => {
    mockGet.mockResolvedValueOnce({ data: { Response: 'False', Error: 'Incorrect IMDb ID.' } });

    const result = await omdbService.getOMDBData('tt0000000');

    expect(result).toBeNull();
  });

  test('returns null (does not throw) when the request rejects', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));

    const result = await omdbService.getOMDBData('tt0084787');

    expect(result).toBeNull();
  });
});

describe('extractOMDBRatings', () => {
  test('returns nulls when omdbData is null', () => {
    expect(omdbService.extractOMDBRatings(null)).toEqual({
      imdb: null,
      rottenTomatoes: { critics: null, audience: null },
    });
  });

  test('returns nulls when omdbData has no Ratings array', () => {
    expect(omdbService.extractOMDBRatings({ imdbRating: '7.5' })).toEqual({
      imdb: null,
      rottenTomatoes: { critics: null, audience: null },
    });
  });

  test('parses imdbRating and Rotten Tomatoes critics score', () => {
    const omdbData = {
      imdbRating: '8.2',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.2/10' },
        { Source: 'Rotten Tomatoes', Value: '92%' },
      ],
    };

    expect(omdbService.extractOMDBRatings(omdbData)).toEqual({
      imdb: '8.2',
      rottenTomatoes: { critics: '92%', audience: null },
    });
  });

  test("maps imdbRating of 'N/A' to null", () => {
    const omdbData = { imdbRating: 'N/A', Ratings: [] };
    expect(omdbService.extractOMDBRatings(omdbData).imdb).toBeNull();
  });

  test('leaves critics null when no Rotten Tomatoes entry is present', () => {
    const omdbData = { imdbRating: '6.0', Ratings: [{ Source: 'Metacritic', Value: '55/100' }] };
    expect(omdbService.extractOMDBRatings(omdbData).rottenTomatoes.critics).toBeNull();
  });
});
