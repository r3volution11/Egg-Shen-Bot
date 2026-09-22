/**
 * Tests for pendingSelections — side storage for data too big for a Discord
 * customId.
 *
 * Discord caps a select-menu option `value` at 100 characters. /watched log
 * and /watchlist add were base64-ing their context (user id, note, privacy
 * flag) straight into that value and truncating it to fit, which produced
 * base64 that JSON.parse always threw on. /watched failed on EVERY ambiguous
 * title; /watchlist failed once a note pushed it over the limit.
 *
 * Run with: npm test -- tests/pendingSelections.test.js
 */

import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { stashSelection, readSelection, _resetSelections } from '../src/utils/pendingSelections.js';

beforeEach(() => {
  _resetSelections();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('round-tripping a payload', () => {
  test('returns exactly what was stashed', () => {
    const payload = { notes: 'great film', userId: '348924434679332864', isPrivate: true };

    expect(readSelection(stashSelection(payload))).toEqual(payload);
  });

  test('handles the payloads that used to overflow the customId', () => {
    // A user snowflake alone is 18 digits; base64 of this JSON is ~130 chars,
    // well past Discord's 100-char cap on an option value.
    const realistic = {
      notes: 'Watched with the Sunday crew, projector setup',
      userId: '348924434679332864',
      username: 'r3volution11',
      isPrivate: false,
    };

    const nonce = stashSelection(realistic);

    expect(nonce.length).toBeLessThan(20);
    expect(readSelection(nonce)).toEqual(realistic);
  });

  test('a nonce fits inside a customId with room to spare', () => {
    // `watched_movie_12345_<nonce>` must stay under 100 characters.
    const nonce = stashSelection({ any: 'payload' });
    const customId = `watched_movie_1234567_${nonce}`;

    expect(customId.length).toBeLessThan(100);
  });

  test('contains no underscore, since handlers split customIds on it', () => {
    for (let i = 0; i < 50; i++) {
      expect(stashSelection({ i })).not.toContain('_');
    }
  });

  test('gives every stash its own key', () => {
    const keys = new Set(Array.from({ length: 200 }, (_, i) => stashSelection({ i })));
    expect(keys.size).toBe(200);
  });

  test('keeps separate payloads separate', () => {
    const a = stashSelection({ who: 'alice' });
    const b = stashSelection({ who: 'bob' });

    expect(readSelection(a)).toEqual({ who: 'alice' });
    expect(readSelection(b)).toEqual({ who: 'bob' });
  });
});

describe('reading is non-destructive', () => {
  test('the same nonce can be read twice', () => {
    // Discord can deliver a component interaction more than once on retry —
    // a selection that silently did nothing the second time would be worse
    // than repeating it.
    const nonce = stashSelection({ notes: 'keep me' });

    expect(readSelection(nonce)).toEqual({ notes: 'keep me' });
    expect(readSelection(nonce)).toEqual({ notes: 'keep me' });
  });
});

describe('unknown and expired keys', () => {
  test('an unknown nonce reads as null rather than throwing', () => {
    expect(readSelection('never-stashed')).toBeNull();
    expect(readSelection('')).toBeNull();
    expect(readSelection(undefined)).toBeNull();
  });

  test('a payload expires, so an abandoned menu cannot leak memory', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const nonce = stashSelection({ notes: 'stale' });

    jest.setSystemTime(1_000_000 + 16 * 60 * 1000); // past Discord's own ~15min token life

    expect(readSelection(nonce)).toBeNull();
  });

  test('a payload survives right up to its expiry', () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const nonce = stashSelection({ notes: 'still good' });

    jest.setSystemTime(1_000_000 + 14 * 60 * 1000);

    expect(readSelection(nonce)).toEqual({ notes: 'still good' });
  });
});
