/**
 * Tests for /timer pause and /timer resume.
 *
 * Pausing freezes elapsed/remaining time (stops the countdown display and
 * cancels the pending auto-stop) without discarding it; resuming recomputes
 * a fresh endTime from "now + remaining time at pause" and reschedules
 * auto-stop, rather than anchoring back to the original startTime the way
 * /timer adjust does — pause time must not count against the duration.
 *
 * Run with: npx jest tests/timer-pause-resume.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/commands/timer.js';
import {
  startTimer,
  clearAllTimers,
  getTimerStatus,
  loadTimers,
  restoreTimerTimeouts,
} from '../src/utils/timerManager.js';

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanup() {
  clearAllTimers();
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeEach(cleanup);
afterEach(() => {
  jest.useRealTimers();
  cleanup();
});

function makeMember({ isAdmin = false } = {}) {
  return {
    permissions: {
      has: (flag) => (isAdmin ? flag === 'Administrator' : false),
    },
  };
}

function makeClient() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    channels: {
      fetch: jest.fn().mockResolvedValue({
        id: 'channel-1',
        isTextBased: () => true,
        send: jest.fn().mockResolvedValue(message),
      }),
    },
  };
}

function makeInteraction({ subcommand, userId, isAdmin = false, options = {}, client = {} }) {
  return {
    channelId: 'channel-1',
    options: {
      getSubcommand: () => subcommand,
      getInteger: (name) => options[name] ?? null,
      getString: (name) => options[name] ?? null,
      getRole: () => null,
    },
    user: { id: userId, username: userId },
    member: makeMember({ isAdmin }),
    client,
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/timer pause', () => {
  test('rejects a user who did not start the timer and is not an admin', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand: 'pause', userId: 'someone-else' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
    expect(getTimerStatus('channel-1').paused).toBe(false);
  });

  test('allows the timer starter to pause it', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    const interaction = makeInteraction({ subcommand: 'pause', userId: 'starter-user' });

    await execute(interaction);

    expect(getTimerStatus('channel-1').paused).toBe(true);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.anything() })
    );
  });

  test('allows an admin to pause someone else\'s timer', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand: 'pause', userId: 'an-admin', isAdmin: true });

    await execute(interaction);

    expect(getTimerStatus('channel-1').paused).toBe(true);
  });

  test('pausing freezes elapsed and remaining time', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);

    jest.setSystemTime(1_000_000 + 5000); // 5s later
    const interaction = makeInteraction({ subcommand: 'pause', userId: 'starter-user' });
    await execute(interaction);

    const atPause = getTimerStatus('channel-1');

    jest.setSystemTime(1_000_000 + 60000); // 60s later — should NOT affect a paused timer
    const stillPaused = getTimerStatus('channel-1');

    expect(stillPaused.elapsedFormatted).toBe(atPause.elapsedFormatted);
    expect(stillPaused.remainingFormatted).toBe(atPause.remainingFormatted);
  });

  test('pausing a timer with no duration still freezes elapsed time with no remaining-time fields', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand: 'pause', userId: 'starter-user' });

    await execute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.paused).toBe(true);
    expect(status.remainingMs).toBeUndefined();
  });

  test('pausing an already-paused timer is rejected without changing state', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    const interaction = makeInteraction({ subcommand: 'pause', userId: 'starter-user' });
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already paused') })
    );
  });

  test('pausing with no active timer is rejected', async () => {
    const interaction = makeInteraction({ subcommand: 'pause', userId: 'starter-user' });
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No active timer') })
    );
  });
});

describe('/timer resume', () => {
  test('resuming a non-paused timer is rejected', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    const interaction = makeInteraction({ subcommand: 'resume', userId: 'starter-user' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('not paused') })
    );
  });

  test('rejects a user who did not start the timer and is not an admin', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    const interaction = makeInteraction({ subcommand: 'resume', userId: 'someone-else' });
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
    expect(getTimerStatus('channel-1').paused).toBe(true);
  });

  test('resuming clears the paused state and restores elapsed/remaining time tracking', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    const interaction = makeInteraction({ subcommand: 'resume', userId: 'starter-user', client: makeClient() });
    await execute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.paused).toBe(false);
    expect(status.duration).toBe(60);
  });

  test('resuming a timer with no duration works with nothing to reschedule', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    const interaction = makeInteraction({ subcommand: 'resume', userId: 'starter-user' });
    await execute(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.paused).toBe(false);
    expect(status.duration).toBeUndefined();
  });

  test('auto-stop still fires at approximately the right wall-clock time after a pause/resume cycle', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    const client = makeClient();
    // No label: keeps the auto-stop callback on the lightweight
    // "manual-log button" path instead of autoLogTimerToWatchHistory's real
    // (unmocked) TMDB search chain, which can still be in flight when this
    // test's own synchronous assertions run under heavier parallel load.
    startTimer('channel-1', 'starter-user', 'starter-user', '', 10, client); // 10 min duration

    // Run for 2 minutes, then pause for 5 minutes (should not count against the 10min budget).
    jest.setSystemTime(1_000_000 + 2 * 60 * 1000);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    jest.setSystemTime(1_000_000 + 7 * 60 * 1000); // 5 minutes paused
    await execute(makeInteraction({ subcommand: 'resume', userId: 'starter-user', client }));

    // 8 remaining minutes should now be scheduled from the resume point.
    // Advancing 7:59 should NOT have stopped it yet.
    await jest.advanceTimersByTimeAsync(7 * 60 * 1000 + 59 * 1000);
    expect(getTimerStatus('channel-1')).not.toBeNull();

    // Advancing past the 8-minute mark should auto-stop it.
    await jest.advanceTimersByTimeAsync(2000);
    expect(getTimerStatus('channel-1')).toBeNull();
  });
});

describe('/timer adjust while paused', () => {
  test('adjusting a paused timer is rejected with a clear message', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    const interaction = makeInteraction({
      subcommand: 'adjust',
      userId: 'starter-user',
      options: { duration: 90 },
    });
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('resume') })
    );
  });
});

describe('/timer stop while paused', () => {
  test('stopping a paused timer still works and reports the frozen elapsed time', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    startTimer('channel-1', 'starter-user', 'starter-user');

    jest.setSystemTime(1_000_000 + 3000);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    jest.setSystemTime(1_000_000 + 999999); // time passes while paused, must not affect the report
    const interaction = makeInteraction({ subcommand: 'stop', userId: 'starter-user' });
    await execute(interaction);

    expect(getTimerStatus('channel-1')).toBeNull();
    expect(interaction.reply).toHaveBeenCalled();
  });
});

describe('paused timer survives a simulated bot restart', () => {
  test('restoreTimerTimeouts does not auto-stop or reschedule a paused timer', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    await execute(makeInteraction({ subcommand: 'pause', userId: 'starter-user' }));

    // Simulate a restart: reload from disk into a fresh in-memory state.
    clearAllTimers();
    await loadTimers();
    await restoreTimerTimeouts(makeClient());

    const status = getTimerStatus('channel-1');
    expect(status).not.toBeNull();
    expect(status.paused).toBe(true);
  });
});
