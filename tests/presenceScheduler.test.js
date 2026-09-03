/**
 * Tests for src/utils/presenceScheduler.js — the hourly bot status rotation.
 *
 * Mirrors timerScheduler.test.js's shape: fake timers instead of waiting a
 * real hour, with movieQuotesStore.js mocked so each test controls exactly
 * what quote pool is available without touching the real quote file.
 *
 * Run with: npx jest tests/presenceScheduler.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ActivityType } from 'discord.js';

const mockLoadQuotes = jest.fn();

jest.unstable_mockModule('../src/utils/movieQuotesStore.js', () => ({
  loadQuotes: mockLoadQuotes,
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
  mockLoadQuotes.mockReset().mockResolvedValue([{ text: 'Quote one.' }, { text: 'Quote two.' }, { text: 'Quote three.' }]);
});

afterEach(() => {
  presenceScheduler.shutdown();
  jest.useRealTimers();
});

describe('presenceScheduler', () => {
  test('sets an initial status immediately on initialize, without waiting for the interval', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();

    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  test('the presence payload uses ActivityType.Custom with the quote on state, not name', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();

    const payload = client.user.setPresence.mock.calls[0][0];
    expect(payload.activities).toHaveLength(1);
    expect(payload.activities[0].type).toBe(ActivityType.Custom);
    expect(payload.activities[0].name).toEqual(expect.any(String));
    expect(['Quote one.', 'Quote two.', 'Quote three.']).toContain(payload.activities[0].state);
    expect(payload.status).toBe('online');
  });

  test('reads the quote list fresh from movieQuotesStore on every rotation, not a cached copy', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    expect(mockLoadQuotes).toHaveBeenCalledTimes(1);

    mockLoadQuotes.mockResolvedValue([{ text: 'Only quote now.' }]);
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(mockLoadQuotes).toHaveBeenCalledTimes(2);
    const latestPayload = client.user.setPresence.mock.calls.at(-1)[0];
    expect(latestPayload.activities[0].state).toBe('Only quote now.');
  });

  test('falls back to a built-in quote when the list is empty, instead of leaving no status', async () => {
    mockLoadQuotes.mockResolvedValue([]);
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();

    const payload = client.user.setPresence.mock.calls[0][0];
    expect(payload.activities[0].state).toEqual(expect.any(String));
    expect(payload.activities[0].state.length).toBeGreaterThan(0);
  });

  test('does not rotate again before the 1-hour interval elapses', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    client.user.setPresence.mockClear();

    await jest.advanceTimersByTimeAsync(59 * 60 * 1000);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  test('rotates to a new status once the 1-hour interval elapses', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    client.user.setPresence.mockClear();

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  test('shutdown stops further rotation', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    presenceScheduler.shutdown();
    client.user.setPresence.mockClear();

    await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(client.user.setPresence).not.toHaveBeenCalled();
  });

  test('re-initializing clears any previous interval instead of stacking a second one', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    client.user.setPresence.mockClear();

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    // If the first interval weren't cleared, this would fire twice.
    expect(client.user.setPresence).toHaveBeenCalledTimes(1);
  });

  test('never repeats the immediately-previous quote when more than one is available', async () => {
    const client = makeClient();
    presenceScheduler.initialize(client);
    await Promise.resolve(); await Promise.resolve();
    const firstQuote = client.user.setPresence.mock.calls[0][0].activities[0].state;

    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
      const latestCall = client.user.setPresence.mock.calls.at(-1);
      expect(latestCall[0].activities[0].state).not.toBe(
        client.user.setPresence.mock.calls.at(-2)[0].activities[0].state
      );
    }
    expect(firstQuote).toEqual(expect.any(String));
  });
});
