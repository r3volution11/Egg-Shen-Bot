/**
 * Unit tests for aiService.js's pickLandslideWinner — decides whether a
 * ranked results list has a top result decisively ahead of the runner-up,
 * safe to auto-select instead of showing a picker. Requires BOTH a strong
 * absolute score (floor) AND a clear lead over #2 (gap) — see the function's
 * own docblock for why either alone isn't sufficient.
 *
 * Run with: npx jest tests/pickLandslideWinner.test.js --verbose
 */

import { describe, test, expect, jest } from '@jest/globals';

let pickLandslideWinner;

beforeAll(async () => {
  ({ pickLandslideWinner } = await import('../src/services/aiService.js'));
});

function result(title, semanticScore) {
  return { title, semanticScore };
}

describe('pickLandslideWinner', () => {
  test('returns the top result when it clears both the floor and the gap', () => {
    const results = [result('The Right One', 0.92), result('Something Else', 0.60)];
    expect(pickLandslideWinner(results)).toEqual(result('The Right One', 0.92));
  });

  test('returns null when top score is high but the gap to #2 is too small', () => {
    // Both plausible, close candidates — e.g. two versions of the same show.
    const results = [result('It (2017)', 0.91), result('It (1990)', 0.89)];
    expect(pickLandslideWinner(results)).toBeNull();
  });

  test('returns null when the gap is large but the top score itself is weak', () => {
    // Nothing here is a good match — a big gap over a bad #2 doesn't make #1 good.
    const results = [result('Loosely Related', 0.35), result('Barely Related', 0.10)];
    expect(pickLandslideWinner(results)).toBeNull();
  });

  test('returns null when fewer than 2 results are given', () => {
    expect(pickLandslideWinner([result('Solo', 0.95)])).toBeNull();
    expect(pickLandslideWinner([])).toBeNull();
    expect(pickLandslideWinner(null)).toBeNull();
    expect(pickLandslideWinner(undefined)).toBeNull();
  });

  test('returns null when semanticScore is missing (OpenAI unavailable or re-ranking fell back)', () => {
    const results = [{ title: 'No Score A' }, { title: 'No Score B' }];
    expect(pickLandslideWinner(results)).toBeNull();
  });

  test('returns null when only the second result is missing a score', () => {
    const results = [result('Has Score', 0.95), { title: 'No Score' }];
    expect(pickLandslideWinner(results)).toBeNull();
  });

  test('only ever compares #1 against #2, ignoring how close #3+ are', () => {
    const results = [
      result('Winner', 0.95),
      result('Distant Second', 0.50),
      result('Also Close To Second', 0.49),
    ];
    expect(pickLandslideWinner(results)).toEqual(result('Winner', 0.95));
  });

  test('boundary: exactly at the floor and gap thresholds counts as a landslide', () => {
    const results = [result('Exactly At Floor', 0.80), result('Exactly At Gap', 0.65)];
    expect(pickLandslideWinner(results)).toEqual(result('Exactly At Floor', 0.80));
  });

  test('boundary: just under the floor is not a landslide even with a huge gap', () => {
    const results = [result('Just Under Floor', 0.79), result('Way Behind', 0.10)];
    expect(pickLandslideWinner(results)).toBeNull();
  });

  test('logs the decision for future threshold tuning', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    pickLandslideWinner([result('A', 0.9), result('B', 0.5)]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[LandslideCheck]'));
    logSpy.mockRestore();
  });
});
