/**
 * Regression coverage for /timer status and /timer check's default
 * visibility. People mostly run these to glance at their own progress on
 * a movie/episode, so unlike the search commands (public by default,
 * private:true to opt out), /timer status and /timer check default to
 * private (ephemeral) and take a public:true option to announce the
 * status to the whole channel instead.
 *
 * Run with: npx jest tests/timer-status-visibility.test.js --verbose
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

function makeInteraction({ subcommand, isPublic = null }) {
  return {
    channelId: 'channel-1',
    options: {
      getSubcommand: () => subcommand,
      getBoolean: (name) => (name === 'public' ? isPublic : null),
      getInteger: () => null,
      getString: () => null,
      getRole: () => null,
    },
    user: { id: 'user-1', username: 'tester' },
    member: { permissions: { has: () => false } },
    client: {},
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

describe.each(['status', 'check'])('/timer %s — visibility', (subcommand) => {
  test('defaults to ephemeral (private) when no public option is given', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true })
    );
  });

  test('public:true replies visibly to the whole channel (ephemeral: false)', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand, isPublic: true });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: false })
    );
  });

  test('public:false explicitly still stays ephemeral', async () => {
    startTimer('channel-1', 'starter-user', 'starter-user');
    const interaction = makeInteraction({ subcommand, isPublic: false });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true })
    );
  });

  test('the "no active timer" error always stays ephemeral, regardless of the public flag', async () => {
    const interaction = makeInteraction({ subcommand, isPublic: true });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, content: expect.stringContaining('No active timer') })
    );
  });
});
