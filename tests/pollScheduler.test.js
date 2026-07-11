/**
 * Tests for src/utils/pollScheduler.js — the survey auto-expiry sweep.
 *
 * The scheduler itself is thin orchestration (setInterval + logging), with
 * all real logic living in pollManager.js's getExpiredActivePolls and
 * closePollAndAnnounce (already covered in tests/pollManager.test.js).
 * These tests confirm the interval wiring actually calls that logic on
 * schedule, using fake timers rather than waiting a real minute.
 *
 * Run with: npx jest tests/pollScheduler.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetExpiredActivePolls = jest.fn();
const mockClosePollAndAnnounce = jest.fn();

jest.unstable_mockModule('../src/utils/pollManager.js', () => ({
  getExpiredActivePolls: mockGetExpiredActivePolls,
  closePollAndAnnounce: mockClosePollAndAnnounce,
}));

let pollScheduler;
beforeAll(async () => {
  pollScheduler = await import('../src/utils/pollScheduler.js');
});

beforeEach(() => {
  jest.useFakeTimers();
  mockGetExpiredActivePolls.mockReset().mockReturnValue([]);
  mockClosePollAndAnnounce.mockReset().mockResolvedValue({ success: true, poll: {} });
});

afterEach(() => {
  pollScheduler.shutdown();
  jest.useRealTimers();
});

function makeClient() {
  return { user: { id: 'bot-user-id' } };
}

describe('pollScheduler', () => {
  test('does not check for expired polls before the interval elapses', async () => {
    pollScheduler.initialize(makeClient());
    await jest.advanceTimersByTimeAsync(59 * 1000);
    expect(mockGetExpiredActivePolls).not.toHaveBeenCalled();
  });

  test('checks for expired polls once the 1-minute interval elapses', async () => {
    pollScheduler.initialize(makeClient());
    await jest.advanceTimersByTimeAsync(60 * 1000);
    expect(mockGetExpiredActivePolls).toHaveBeenCalledTimes(1);
  });

  test('closes each expired poll found, crediting the bot user as closer', async () => {
    mockGetExpiredActivePolls.mockReturnValue([
      { guildId: 'guild-1', poll: { pollId: 'poll-1', question: 'Q1?' } },
      { guildId: 'guild-2', poll: { pollId: 'poll-2', question: 'Q2?' } },
    ]);
    const client = makeClient();
    pollScheduler.initialize(client);

    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(mockClosePollAndAnnounce).toHaveBeenCalledWith(client, 'guild-1', 'poll-1', 'bot-user-id');
    expect(mockClosePollAndAnnounce).toHaveBeenCalledWith(client, 'guild-2', 'poll-2', 'bot-user-id');
  });

  test('a failure closing one expired poll does not stop the others from being checked', async () => {
    mockGetExpiredActivePolls.mockReturnValue([
      { guildId: 'guild-1', poll: { pollId: 'poll-1', question: 'Q1?' } },
      { guildId: 'guild-2', poll: { pollId: 'poll-2', question: 'Q2?' } },
    ]);
    mockClosePollAndAnnounce
      .mockResolvedValueOnce({ success: false, error: 'boom' })
      .mockResolvedValueOnce({ success: true, poll: {} });

    pollScheduler.initialize(makeClient());
    await jest.advanceTimersByTimeAsync(60 * 1000);

    expect(mockClosePollAndAnnounce).toHaveBeenCalledTimes(2);
  });

  test('shutdown stops further checks', async () => {
    pollScheduler.initialize(makeClient());
    pollScheduler.shutdown();

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(mockGetExpiredActivePolls).not.toHaveBeenCalled();
  });

  test('re-initializing clears the previous interval instead of stacking two', async () => {
    const client = makeClient();
    pollScheduler.initialize(client);
    pollScheduler.initialize(client); // re-init, e.g. a hot-reload scenario

    await jest.advanceTimersByTimeAsync(60 * 1000);

    // Exactly one interval firing once — not two stacked intervals both firing.
    expect(mockGetExpiredActivePolls).toHaveBeenCalledTimes(1);
  });
});
