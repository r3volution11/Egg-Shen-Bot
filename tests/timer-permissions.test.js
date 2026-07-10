/**
 * Regression test for missing permission checks on /timer stop, adjust, and
 * autostop. Previously any user could stop, retime, or toggle auto-stop on a
 * timer someone else started — only /timer start's follow-on actions had no
 * ownership check at all. Fixed by requiring the caller be either the timer's
 * starter (timer.userId) or pass guildConfig.js's isAdmin() check.
 *
 * Run with: npx jest tests/timer-permissions.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/commands/timer.js';
import { startTimer, clearAllTimers } from '../src/utils/timerManager.js';

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanup() {
  clearAllTimers();
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeMember({ isAdmin = false } = {}) {
  return {
    permissions: {
      has: (flag) => (isAdmin ? flag === 'Administrator' : false),
    },
  };
}

function makeInteraction({ subcommand, userId, isAdmin = false, options = {} }) {
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
    client: {},
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/timer stop', () => {
  test('rejects a user who did not start the timer and is not an admin', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand: 'stop', userId: 'someone-else' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });

  test('allows the timer starter to stop it', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand: 'stop', userId: 'starter-user' });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });

  test('allows an admin to stop someone else\'s timer', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand: 'stop', userId: 'an-admin', isAdmin: true });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });
});

describe('/timer adjust', () => {
  test('rejects a user who did not start the timer and is not an admin', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    const interaction = makeInteraction({
      subcommand: 'adjust',
      userId: 'someone-else',
      options: { duration: 90 },
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });

  test('allows the timer starter to adjust it', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    const interaction = makeInteraction({
      subcommand: 'adjust',
      userId: 'starter-user',
      options: { duration: 90 },
    });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });
});

describe('/timer autostop', () => {
  test('rejects a user who did not start the timer and is not an admin', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    const interaction = makeInteraction({
      subcommand: 'autostop',
      userId: 'someone-else',
      options: { autostop: 'disable' },
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });

  test('allows an admin to change auto-stop for someone else\'s timer', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user', '', 60);
    const interaction = makeInteraction({
      subcommand: 'autostop',
      userId: 'an-admin',
      isAdmin: true,
      options: { autostop: 'disable' },
    });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });
});
