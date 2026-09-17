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

describe('pickLandslideWinner — exact title match', () => {
  test('wins for the real production case the scores rejected', () => {
    // Measured on the live bot. The top result is exactly right, but 0.738
    // is under the 0.80 floor and the runner-up is a near-identical sibling
    // title, so the score path declined and users got a picker.
    const results = [
      result('Tales from the Crypt', 0.738),
      result('Tales from the Cryptkeeper', 0.667),
    ];

    expect(pickLandslideWinner(results)).toBeNull(); // scores alone: no winner
    expect(pickLandslideWinner(results, 'Tales From the Crypt'))
      .toEqual(result('Tales from the Crypt', 0.738));
  });

  test('wins when a "Collection" sibling scores almost identically', () => {
    // The other measured case: a 0.007 gap, which no threshold tuning fixes.
    const results = [
      result('Tales from the Crypt', 0.740),
      result('Tales From The Crypt Collection', 0.734),
    ];

    expect(pickLandslideWinner(results, 'Tales From the Crypt'))
      .toEqual(result('Tales from the Crypt', 0.740));
  });

  test('ignores case, punctuation and spacing differences', () => {
    // normalizeTitle turns each punctuation run into a space, so an
    // apostrophe typed or omitted the same way on both sides still matches,
    // as does differing case and extra whitespace.
    const results = [result("Schindler's List", 0.5), result('Another Film', 0.4)];
    expect(pickLandslideWinner(results, "  SCHINDLER'S   LIST ")).toEqual(results[0]);
    expect(pickLandslideWinner(results, 'Schindler s List')).toEqual(results[0]);

    const colon = [result('Alien: Romulus', 0.5), result('Alien', 0.4)];
    expect(pickLandslideWinner(colon, 'Alien Romulus')).toEqual(colon[0]);
  });

  test('matches a TV result by its name field', () => {
    const results = [{ name: 'Severance', semanticScore: 0.5 }, { name: 'Severance Package', semanticScore: 0.4 }];
    expect(pickLandslideWinner(results, 'Severance')).toEqual(results[0]);
  });

  test('picks the exact match even when it is not the top-ranked result', () => {
    const results = [result('Alien Nation', 0.7), result('Alien', 0.65)];
    expect(pickLandslideWinner(results, 'Alien')).toEqual(result('Alien', 0.65));
  });

  test('declines when two results share the queried title (a genuine remake)', () => {
    // "Suspiria" (1977) and (2018) are both exactly right — this IS ambiguous,
    // so it must still fall through to the picker.
    const results = [result('Suspiria', 0.7), result('Suspiria', 0.69)];
    expect(pickLandslideWinner(results, 'Suspiria')).toBeNull();
  });

  test('works with no semantic scores at all (OpenAI unavailable)', () => {
    const results = [{ title: 'Tales from the Crypt' }, { title: 'Tales from the Cryptkeeper' }];
    expect(pickLandslideWinner(results)).toBeNull();
    expect(pickLandslideWinner(results, 'Tales from the Crypt')).toEqual(results[0]);
  });

  test('falls through to the scores when nothing matches exactly', () => {
    const results = [result('Something Else Entirely', 0.95), result('Also Not It', 0.4)];
    expect(pickLandslideWinner(results, 'My Query')).toEqual(result('Something Else Entirely', 0.95));
  });

  test('an empty or missing query is just score-only behavior', () => {
    const results = [result('A Title', 0.5), result('Another', 0.4)];
    expect(pickLandslideWinner(results, '')).toBeNull();
    expect(pickLandslideWinner(results, null)).toBeNull();
  });

  test('logs that scores were bypassed', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    pickLandslideWinner([result('Juno', 0.5), result('Other', 0.4)], 'Juno');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('exact title match'));
    logSpy.mockRestore();
  });
});
