/**
 * Tests for src/utils/timerScheduler.js — the timer expiry-warning sweep.
 *
 * Mirrors pollScheduler.test.js's shape: fake timers instead of waiting a
 * real minute, with getAllTimers mocked so each test controls exactly what
 * "active timers" look like without touching the real timerManager Map/file.
 *
 * Run with: npx jest tests/timerScheduler.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetAllTimers = jest.fn();

jest.unstable_mockModule('../src/utils/timerManager.js', () => ({
  getAllTimers: mockGetAllTimers,
}));

let timerScheduler;
beforeAll(async () => {
  timerScheduler = await import('../src/utils/timerScheduler.js');
});

function makeClient() {
  return {
    channels: {
      fetch: jest.fn().mockResolvedValue({
        send: jest.fn().mockResolvedValue(undefined),
      }),
    },
  };
}

function makeTimersMap(entries) {
  return new Map(entries);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockGetAllTimers.mockReset().mockReturnValue(new Map());
});

afterEach(() => {
  timerScheduler.shutdown();
  jest.useRealTimers();
});

describe('timerScheduler', () => {
  test('does not check timers before the interval elapses', async () => {
    timerScheduler.initialize(makeClient());
    await jest.advanceTimersByTimeAsync(59 * 1000);
    expect(mockGetAllTimers).not.toHaveBeenCalled();
  });

  test('checks timers once the 1-minute interval elapses', async () => {
    timerScheduler.initialize(makeClient());
    await jest.advanceTimersByTimeAsync(60 * 1000);
    expect(mockGetAllTimers).toHaveBeenCalledTimes(1);
  });

  test('sends a warning when a timer has 30 minutes left (inside the 1-hour window)', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', label: 'Movie Night', duration: 120, endTime: Date.now() + 30 * 60 * 1000 }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).toHaveBeenCalledWith('channel-1');
    const channel = await client.channels.fetch.mock.results[0].value;
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('user-1') })
    );
  });

  test('does not warn when more than an hour remains', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', label: 'Movie Night', duration: 300, endTime: Date.now() + 120 * 60 * 1000 }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  test('does not warn a second time for a timer already warned within the same window', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', label: 'Movie Night', duration: 120, endTime: Date.now() + 30 * 60 * 1000 }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000); // first check - warns
    await jest.advanceTimersByTimeAsync(60 * 1000); // second check - same endTime, no re-warn

    expect(client.channels.fetch).toHaveBeenCalledTimes(1);
  });

  test('does not warn for a paused timer', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', paused: true, duration: 120, endTime: Date.now() + 30 * 60 * 1000 }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  test('does not warn for a timer with no duration/endTime (auto-stop disabled)', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', label: 'Marathon' }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  test('does not warn for an already-expired timer', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', duration: 60, endTime: Date.now() - 1000 }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  test('clearWarning allows a fresh warning to fire again after being cleared', async () => {
    const client = makeClient();
    const timer = { userId: 'user-1', label: 'Movie Night', duration: 120, endTime: Date.now() + 30 * 60 * 1000 };
    mockGetAllTimers.mockReturnValue(makeTimersMap([['channel-1', timer]]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000); // warns once

    timerScheduler.clearWarning('channel-1');

    await jest.advanceTimersByTimeAsync(60 * 1000); // same endTime, but warning was cleared

    expect(client.channels.fetch).toHaveBeenCalledTimes(2);
  });

  test('re-entering the warning window after an extension warns again with the new endTime', async () => {
    const client = makeClient();
    const timer = { userId: 'user-1', label: 'Movie Night', duration: 120, endTime: Date.now() + 30 * 60 * 1000 };
    mockGetAllTimers.mockReturnValue(makeTimersMap([['channel-1', timer]]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000); // warns once for the original endTime

    // Simulate an extend pushing endTime back out past the warning window
    timer.endTime = Date.now() + 90 * 60 * 1000;
    await jest.advanceTimersByTimeAsync(60 * 1000); // still outside window, no warn

    // Time passes and it re-enters the window under the new endTime
    timer.endTime = Date.now() + 30 * 60 * 1000;
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).toHaveBeenCalledTimes(2);
  });

  test('cleans up sentWarnings entries for timers that no longer exist', async () => {
    const client = makeClient();
    mockGetAllTimers.mockReturnValue(makeTimersMap([
      ['channel-1', { userId: 'user-1', duration: 120, endTime: Date.now() + 30 * 60 * 1000 }],
    ]));

    timerScheduler.initialize(client);
    await jest.advanceTimersByTimeAsync(60 * 1000); // warns, records sentWarnings

    // Timer stopped — no longer in getAllTimers()
    mockGetAllTimers.mockReturnValue(new Map());
    await jest.advanceTimersByTimeAsync(60 * 1000);

    // clearWarning should be a no-op now, but re-adding the same channelId
    // with a fresh endTime should warn again rather than being stuck "already warned".
    const freshTimer = { userId: 'user-1', duration: 120, endTime: Date.now() + 30 * 60 * 1000 };
    mockGetAllTimers.mockReturnValue(makeTimersMap([['channel-1', freshTimer]]));
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(client.channels.fetch).toHaveBeenCalledTimes(2);
  });

  test('shutdown stops further checks', async () => {
    timerScheduler.initialize(makeClient());
    timerScheduler.shutdown();

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(mockGetAllTimers).not.toHaveBeenCalled();
  });

  test('re-initializing clears the previous interval instead of stacking two', async () => {
    const client = makeClient();
    timerScheduler.initialize(client);
    timerScheduler.initialize(client); // re-init, e.g. a hot-reload scenario

    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(mockGetAllTimers).toHaveBeenCalledTimes(1);
  });
});
