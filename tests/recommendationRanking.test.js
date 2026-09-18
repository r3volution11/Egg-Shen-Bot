/**
 * Tests for generateRecommendationRanking — the AI re-rank/annotate step.
 *
 * The model is only ever allowed to choose among and describe candidates
 * TMDB already returned, never to name titles itself. These tests pin that
 * boundary: every index it returns is validated against the candidate array,
 * and any failure (no key, network error, unparseable or malformed JSON)
 * degrades to null so the caller falls back to deterministic ranking.
 *
 * Run with: npm test -- tests/recommendationRanking.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';

const mockPost = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { create: () => ({ post: mockPost, get: jest.fn() }) },
}));

let generateRecommendationRanking;
const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeAll(async () => {
  // config.js reads the key at import time, so it must be set first.
  process.env.OPENAI_API_KEY = 'sk-test-key';
  ({ generateRecommendationRanking } = await import('../src/services/aiService.js'));
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

beforeEach(() => {
  mockPost.mockReset();
});

const CANDIDATES = [
  { title: 'The Witch', year: '2015', overview: 'A family in 1630s New England.', rating: 7.0 },
  { title: 'Hereditary', year: '2018', overview: 'A grieving family.', rating: 7.3 },
  { title: 'Halloween II', year: '1981', overview: 'The night he came home again.', rating: 6.0 },
];

const BASE = {
  watchedTitles: ['Suspiria (1977)', 'The Thing (1982)'],
  candidates: CANDIDATES,
  type: 'movie',
};

/** Wrap a JSON payload the way the OpenAI chat API returns it. */
function aiReply(payload) {
  return {
    data: { choices: [{ message: { content: JSON.stringify(payload) } }] },
  };
}

describe('happy path', () => {
  test('returns validated picks in the order the model gave', async () => {
    mockPost.mockResolvedValue(aiReply({
      picks: [
        { index: 1, reason: 'Slow-burn dread, like The Thing.' },
        { index: 0, reason: 'Folk horror in the same key as Suspiria.' },
      ],
    }));

    const picks = await generateRecommendationRanking(BASE);

    expect(picks).toEqual([
      { index: 1, reason: 'Slow-burn dread, like The Thing.' },
      { index: 0, reason: 'Folk horror in the same key as Suspiria.' },
    ]);
  });

  test('sends the watched titles and candidates to the model', async () => {
    mockPost.mockResolvedValue(aiReply({ picks: [{ index: 0, reason: 'x' }] }));

    await generateRecommendationRanking(BASE);

    const prompt = mockPost.mock.calls[0][1].messages[1].content;
    expect(prompt).toContain('Suspiria (1977)');
    expect(prompt).toContain('The Witch');
    expect(mockPost.mock.calls[0][1].response_format).toEqual({ type: 'json_object' });
  });

  test('includes the active filters as context when given', async () => {
    mockPost.mockResolvedValue(aiReply({ picks: [{ index: 0, reason: 'x' }] }));

    await generateRecommendationRanking({ ...BASE, filterSummary: 'Horror, 1980s' });

    expect(mockPost.mock.calls[0][1].messages[1].content).toContain('Horror, 1980s');
  });

  test('caps the result at 5 picks', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      title: `Film ${i}`, year: '2000', overview: '', rating: 7,
    }));
    mockPost.mockResolvedValue(aiReply({
      picks: many.map((_, i) => ({ index: i, reason: `reason ${i}` })),
    }));

    const picks = await generateRecommendationRanking({ ...BASE, candidates: many });

    expect(picks).toHaveLength(5);
  });
});

describe('the model is not trusted', () => {
  test('discards an index past the end of the candidate list', async () => {
    // The whole point of index-based picking is that the model cannot name a
    // title that does not exist — but it can still emit a bad index.
    mockPost.mockResolvedValue(aiReply({
      picks: [
        { index: 99, reason: 'Does not exist.' },
        { index: 0, reason: 'Valid.' },
      ],
    }));

    const picks = await generateRecommendationRanking(BASE);

    expect(picks).toEqual([{ index: 0, reason: 'Valid.' }]);
  });

  test.each([
    ['negative', -1],
    ['non-integer', 1.5],
    ['a string', 'two'],
    ['null', null],
    ['undefined', undefined],
  ])('discards a %s index', async (_label, index) => {
    mockPost.mockResolvedValue(aiReply({
      picks: [{ index, reason: 'bad' }, { index: 2, reason: 'good' }],
    }));

    expect(await generateRecommendationRanking(BASE)).toEqual([
      { index: 2, reason: 'good' },
    ]);
  });

  test('deduplicates a repeated index', async () => {
    mockPost.mockResolvedValue(aiReply({
      picks: [
        { index: 1, reason: 'first' },
        { index: 1, reason: 'again' },
        { index: 0, reason: 'other' },
      ],
    }));

    const picks = await generateRecommendationRanking(BASE);

    expect(picks.map(p => p.index)).toEqual([1, 0]);
  });

  test('truncates an over-long reason', async () => {
    mockPost.mockResolvedValue(aiReply({
      picks: [{ index: 0, reason: 'x'.repeat(500) }],
    }));

    const picks = await generateRecommendationRanking(BASE);

    expect(picks[0].reason).toHaveLength(140);
  });

  test('tolerates a missing reason', async () => {
    mockPost.mockResolvedValue(aiReply({ picks: [{ index: 0 }] }));

    expect(await generateRecommendationRanking(BASE)).toEqual([
      { index: 0, reason: '' },
    ]);
  });

  test('returns null when every pick is invalid', async () => {
    mockPost.mockResolvedValue(aiReply({ picks: [{ index: 42 }, { index: -3 }] }));

    expect(await generateRecommendationRanking(BASE)).toBeNull();
  });
});

describe('failures degrade to null, never throw', () => {
  test('unparseable JSON', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: 'Sure! Here are some picks:' } }] },
    });

    expect(await generateRecommendationRanking(BASE)).toBeNull();
  });

  test('valid JSON with no picks array', async () => {
    mockPost.mockResolvedValue(aiReply({ recommendations: ['The Witch'] }));

    expect(await generateRecommendationRanking(BASE)).toBeNull();
  });

  test('picks is not an array', async () => {
    mockPost.mockResolvedValue(aiReply({ picks: 'The Witch' }));

    expect(await generateRecommendationRanking(BASE)).toBeNull();
  });

  test('empty response body', async () => {
    mockPost.mockResolvedValue({ data: { choices: [{ message: { content: '' } }] } });

    expect(await generateRecommendationRanking(BASE)).toBeNull();
  });

  test('the API call rejects', async () => {
    mockPost.mockRejectedValue(new Error('rate limited'));

    await expect(generateRecommendationRanking(BASE)).resolves.toBeNull();
  });

  test('no candidates to rank', async () => {
    expect(await generateRecommendationRanking({ ...BASE, candidates: [] })).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
