/**
 * Regression test for the ephemeral-error-after-public-defer bug in
 * watchparty.js (/watchparty remind) and timer.js (/timer remind).
 *
 * Both handlers call `interaction.deferReply()` with no `ephemeral` flag
 * (correct — a successful /remind posts a public announcement), but their
 * error paths used to call `interaction.editReply({ ephemeral: true, ... })`.
 * Discord.js silently ignores `ephemeral` on editReply — you cannot change
 * an already-deferred reply's visibility — so these "error" messages were
 * posted publicly in the channel instead of privately to the user. Fixed by
 * deleting the public deferred placeholder and sending the error via
 * `followUp({ ephemeral: true })` instead.
 *
 * Run with: npx jest tests/ephemeral-error-followup.test.js --verbose
 */

import { describe, test, expect, jest } from '@jest/globals';
import { Collection, GuildScheduledEventStatus } from 'discord.js';
import { execute as watchpartyExecute } from '../src/commands/watchparty.js';
import { execute as timerExecute } from '../src/commands/timer.js';

function makeInteraction({ subcommand, options = {} }) {
  const noEvents = new Collection();

  return {
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
      getRole: (name) => options[name] ?? null,
    },
    guild: {
      scheduledEvents: {
        fetch: jest.fn().mockResolvedValue(noEvents),
      },
    },
    channel: { id: 'channel-1' },
    user: { username: 'tester' },
    deferred: false,
    deferReply: jest.fn(async function () {
      this.deferred = true;
    }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/watchparty remind — no scheduled event found', () => {
  test('deletes the public placeholder and sends the error as an ephemeral followUp', async () => {
    const interaction = makeInteraction({ subcommand: 'remind' });

    await watchpartyExecute(interaction);

    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        content: expect.stringContaining('No scheduled event found'),
      })
    );
    // The bug: editReply() must never be used to try to send an ephemeral error.
    expect(interaction.editReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true })
    );
  });
});

describe('/timer remind — no scheduled event found', () => {
  test('deletes the public placeholder and sends the error as an ephemeral followUp', async () => {
    const interaction = makeInteraction({ subcommand: 'remind' });

    await timerExecute(interaction);

    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        content: expect.stringContaining('No scheduled event found'),
      })
    );
    expect(interaction.editReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true })
    );
  });
});
