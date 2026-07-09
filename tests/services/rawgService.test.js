import { jest } from '@jest/globals';

const mockGet = jest.fn();
const mockAxiosInstance = { get: mockGet };

jest.unstable_mockModule('axios', () => ({
  default: { create: jest.fn(() => mockAxiosInstance) },
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    apis: {
      rawg: { apiKey: 'test-rawg-key', baseUrl: 'https://api.rawg.io/api' },
    },
  },
}));

let rawgService;
beforeAll(async () => {
  rawgService = await import('../../src/services/rawgService.js');
});

beforeEach(() => {
  mockGet.mockReset();
});

describe('searchGames', () => {
  test('returns top-50 slice of results on success', async () => {
    const results = Array.from({ length: 60 }, (_, i) => ({ id: i, name: `Game ${i}` }));
    mockGet.mockResolvedValueOnce({ data: { results } });

    const result = await rawgService.searchGames('zelda');

    expect(result).toHaveLength(50);
    expect(result[0]).toEqual({ id: 0, name: 'Game 0' });
  });

  test('throws a wrapped error on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(rawgService.searchGames('zelda')).rejects.toThrow('Failed to search for games');
  });
});

describe('getGameDetails', () => {
  test('returns response.data on success', async () => {
    const data = { id: 1, name: 'Hades' };
    mockGet.mockResolvedValueOnce({ data });
    const result = await rawgService.getGameDetails(1);
    expect(result).toEqual(data);
    expect(mockGet).toHaveBeenCalledWith('/games/1');
  });

  test('throws a wrapped error on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(rawgService.getGameDetails(1)).rejects.toThrow('Failed to get game details');
  });
});

describe('discoverRandomGame', () => {
  test('throws when results.length === 0', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: [] } });
    await expect(rawgService.discoverRandomGame({})).rejects.toThrow(
      'No games found matching the specified filters'
    );
  });

  test('picks a random result and fetches its full details', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { results: [{ id: 42, name: 'Hades' }] } }) // discovery page
      .mockResolvedValueOnce({ data: { id: 42, name: 'Hades', description: 'full details' } }); // getGameDetails

    const result = await rawgService.discoverRandomGame({});

    expect(result).toEqual({ id: 42, name: 'Hades', description: 'full details' });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/games/42');
  });

  test('throws a wrapped error when the underlying request fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(rawgService.discoverRandomGame({})).rejects.toThrow(/Failed to discover random game|network down/);
  });
});

describe('getSimilarGames', () => {
  test('filters out the original game and caps at 10', async () => {
    const details = { id: 5, genres: [{ id: 1 }], tags: [{ id: 9 }] };
    const similarResults = Array.from({ length: 12 }, (_, i) => ({ id: i })); // includes id:5 (the original)

    mockGet
      .mockResolvedValueOnce({ data: details }) // getGameDetails(5)
      .mockResolvedValueOnce({ data: { results: similarResults } }); // similar search

    const result = await rawgService.getSimilarGames(5);

    expect(result).toHaveLength(10);
    expect(result.some((g) => g.id === 5)).toBe(false);
  });

  test('throws a wrapped error when the underlying getGameDetails call fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(rawgService.getSimilarGames(5)).rejects.toThrow('Failed to get similar games');
  });
});
