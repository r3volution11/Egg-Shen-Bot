import { jest } from '@jest/globals';

const mockPost = jest.fn();
const mockGet = jest.fn();
const mockAxiosInstance = { post: mockPost, get: mockGet };

jest.unstable_mockModule('axios', () => ({
  default: { create: jest.fn(() => mockAxiosInstance) },
}));

// A mutable config object — tests toggle apiKey to flip isOpenAIAvailable().
const mockConfig = {
  apis: {
    openai: { apiKey: 'test-openai-key', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
    tmdb: { apiKey: 'test-tmdb-key', baseUrl: 'https://api.themoviedb.org/3' },
  },
};

jest.unstable_mockModule('../../src/config.js', () => ({ config: mockConfig }));

let aiService;
beforeAll(async () => {
  aiService = await import('../../src/services/aiService.js');
});

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  mockConfig.apis.openai.apiKey = 'test-openai-key';
});

describe('isOpenAIAvailable', () => {
  test('true when apiKey is set', () => {
    expect(aiService.isOpenAIAvailable()).toBe(true);
  });

  test.each([null, undefined, ''])('false when apiKey is %p', (value) => {
    mockConfig.apis.openai.apiKey = value;
    expect(aiService.isOpenAIAvailable()).toBe(false);
  });
});

describe('cosineSimilarity — pure', () => {
  test('returns 1 for identical vectors', () => {
    expect(aiService.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  test('returns 0 for orthogonal vectors', () => {
    expect(aiService.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test('throws when vector lengths differ', () => {
    expect(() => aiService.cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vectors must have the same length');
  });

  test('returns 0 when either magnitude is 0 (zero vector)', () => {
    expect(aiService.cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe('createSearchableText — pure', () => {
  test('builds "Title (Year) Overview" for a movie', () => {
    const item = { title: 'The Thing', release_date: '1982-06-25', overview: 'Arctic horror.' };
    expect(aiService.createSearchableText(item, 'movie')).toBe('The Thing (1982) Arctic horror.');
  });

  test('uses name/first_air_date for a TV show', () => {
    const item = { name: 'Severance', first_air_date: '2022-02-18', overview: 'Corporate horror.' };
    expect(aiService.createSearchableText(item, 'tv')).toBe('Severance (2022) Corporate horror.');
  });

  test('handles missing overview and release date gracefully', () => {
    const item = { title: 'Untitled' };
    expect(aiService.createSearchableText(item, 'movie')).toBe('Untitled');
  });
});

describe('generateEmbedding', () => {
  test('throws immediately when OpenAI is not configured, no request made', async () => {
    mockConfig.apis.openai.apiKey = null;
    await expect(aiService.generateEmbedding('some text')).rejects.toThrow('OpenAI API key not configured');
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('returns the embedding vector on success', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: [{ embedding: [0.1, 0.2, 0.3] }] } });
    const result = await aiService.generateEmbedding('some text');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  test('throws a wrapped error on request failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('rate limited'));
    await expect(aiService.generateEmbedding('some text')).rejects.toThrow('Failed to generate embedding');
  });
});

describe('reRankResults', () => {
  test('returns original results unchanged when OpenAI unavailable, no embedding calls made', async () => {
    mockConfig.apis.openai.apiKey = null;
    const results = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
    const result = await aiService.reRankResults('query', results, 'movie');
    expect(result).toBe(results);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('returns the (empty) input unchanged when results is empty', async () => {
    const result = await aiService.reRankResults('query', [], 'movie');
    expect(result).toEqual([]);
  });

  test('ranks results by similarity, scoring individual embedding failures as 0', async () => {
    const results = [
      { id: 1, title: 'Close Match', overview: 'x' },
      { id: 2, title: 'Bad Embedding', overview: 'y' },
    ];
    mockPost
      .mockResolvedValueOnce({ data: { data: [{ embedding: [1, 0] }] } }) // query embedding
      .mockResolvedValueOnce({ data: { data: [{ embedding: [1, 0] }] } }) // item 1: identical -> high score
      .mockRejectedValueOnce(new Error('embedding failed')); // item 2: fails -> score 0

    const result = await aiService.reRankResults('query', results, 'movie');

    expect(result[0].id).toBe(1);
    expect(result[0].semanticScore).toBeCloseTo(1);
    expect(result[1].id).toBe(2);
    expect(result[1].semanticScore).toBe(0);
  });

  test('falls back to original results when the query embedding itself fails', async () => {
    const results = [{ id: 1, title: 'A' }];
    mockPost.mockRejectedValueOnce(new Error('query embedding failed'));

    const result = await aiService.reRankResults('query', results, 'movie');

    expect(result).toBe(results);
  });
});

describe('discoverAndRank — light smoke coverage only (per test plan)', () => {
  test('returns [] when OpenAI is not configured', async () => {
    mockConfig.apis.openai.apiKey = null;
    const result = await aiService.discoverAndRank('a slow-burn arctic horror movie', 'movie');
    expect(result).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns [] when an error occurs partway through', async () => {
    mockGet.mockRejectedValueOnce(new Error('TMDB down'));
    const result = await aiService.discoverAndRank('a slow-burn arctic horror movie', 'movie');
    expect(result).toEqual([]);
  });
});

describe('hybridSearch', () => {
  test('returns keyword results as-is when OpenAI unavailable, no re-rank call', async () => {
    mockConfig.apis.openai.apiKey = null;
    const keywordResults = [{ id: 1, title: 'A' }];
    const keywordSearchFn = jest.fn().mockResolvedValue(keywordResults);

    const result = await aiService.hybridSearch('the thing', keywordSearchFn, 'movie');

    expect(result).toBe(keywordResults);
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('re-ranks keyword results when OpenAI is available', async () => {
    const keywordResults = [{ id: 1, title: 'A', overview: '' }];
    const keywordSearchFn = jest.fn().mockResolvedValue(keywordResults);
    mockPost
      .mockResolvedValueOnce({ data: { data: [{ embedding: [1, 0] }] } })
      .mockResolvedValueOnce({ data: { data: [{ embedding: [1, 0] }] } });

    const result = await aiService.hybridSearch('the thing', keywordSearchFn, 'movie');

    expect(result[0].semanticScore).toBeCloseTo(1);
  });

  test('falls through to discoverAndRank for a descriptive query with 0 keyword results', async () => {
    const keywordSearchFn = jest.fn().mockResolvedValue([]);
    mockGet.mockRejectedValueOnce(new Error('TMDB down')); // discoverAndRank will fail fast -> []

    const result = await aiService.hybridSearch(
      'a slow burn horror movie set in the arctic with practical effects',
      keywordSearchFn,
      'movie'
    );

    expect(keywordSearchFn).toHaveBeenCalled();
    expect(result).toEqual([]); // discoverAndRank's own error handling returns []
  });

  test('returns [] for a short query with 0 keyword results, without calling discoverAndRank', async () => {
    const keywordSearchFn = jest.fn().mockResolvedValue([]);

    const result = await aiService.hybridSearch('thing', keywordSearchFn, 'movie');

    expect(result).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
