/**
 * Tests for src/utils/presenceScheduler.js — the hourly bot status rotation.
 *
 * Mirrors timerScheduler.test.js's shape: fake timers instead of waiting a
 * real hour, with movieQuotes.js mocked so each test controls exactly what
 * quote pool is available without depending on the real content.
 *
 * Run with: npx jest tests/presenceScheduler.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ActivityType } from 'discord.js';

jest.unstable_mockModule('../src/utils/movieQuotes.js', () => ({
  MOVIE_QUOTES: ['Quote one.', 'Quote two.', 'Quote three.'],
}));

let presenceScheduler;
beforeAll(async () => {
  presenceScheduler = await import('../src/utils/presenceScheduler.js');
});

function makeClient() {
  return {
    user: {
      setPresence: jest.fn(),
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  presenceScheduler.shutdown();
  jest.useRealTimers();
});

describe('presenceScheduler', () => {
  test('sets an initial status immediately on initialize, without waiting for the interval', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);

    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  test('the presence payload uses ActivityType.Custom with the quote on state, not name', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);

    const payload = client.user.setPresence.mock.calls[0][0];
    expect(payload.activities).toHaveLength(1);
    expect(payload.activities[0].type).toBe(ActivityType.Custom);
    expect(payload.activities[0].name).toEqual(expect.any(String));
    expect(['Quote one.', 'Quote two.', 'Quote three.']).toContain(payload.activities[0].state);
    expect(payload.status).toBe('online');
  });

  test('does not rotate again before the 1-hour interval elapses', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    client.user.setPresence.mockClear();

    jest.advanceTimersByTime(59 * 60 * 1000);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  test('rotates to a new status once the 1-hour interval elapses', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    client.user.setPresence.mockClear();

    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  test('shutdown stops further rotation', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    presenceScheduler.shutdown();
    client.user.setPresence.mockClear();

    jest.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  test('re-initializing clears any previous interval instead of stacking a second one', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    presenceScheduler.initialize(client);
    client.user.setPresence.mockClear();

    jest.advanceTimersByTime(60 * 60 * 1000);
    // If the first interval weren't cleared, this would fire twice.
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  test('never repeats the immediately-previous quote when more than one is available', () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    const firstQuote = client.user.setPresence.mock.calls[0][0].activities[0].state;

    for (let i = 0; i < 20; i++) {
      jest.advanceTimersByTime(60 * 60 * 1000);
      const latestCall = client.user.setPresence.mock.calls.at(-1);
      expect(latestCall[0].activities[0].state).not.toBe(
        client.user.setPresence.mock.calls.at(-2)[0].activities[0].state
      );
    }
    expect(firstQuote).toEqual(expect.any(String));
  });
});
