/**
 * Regression test for the "Log to Watch History" button.
 *
 * handleWatchHistoryButton() was fully implemented but never wired into
 * handleButtonInteraction()'s dispatch — clicking the button in production
 * always fell through to the "Unknown button interaction" branch, which
 * doesn't reply at all, surfacing Discord's generic "This interaction
 * failed" to the user. This covers the fix: the dispatcher now recognizes
 * `log_watched_` customIds and routes them to the modal-opening handler.
 *
 * Run with: npx jest tests/buttonHandler.test.js --verbose
 */

import { describe, test, expect, jest } from '@jest/globals';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';

function createMockInteraction({ customId, userId = 'starter-user', isModerator = false }) {
  return {
    customId,
    user: { id: userId },
    guild: { id: 'guild-1' },
    member: {
      permissions: {
        has: (flag) => {
          if (!isModerator) return false;
          return ['Administrator', 'ManageGuild', 'ModerateMembers'].includes(flag);
        },
      },
    },
    message: {
      embeds: [{ description: '**The Thing**\nSome other line' }],
    },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  };
}

describe('log_watched_ button dispatch', () => {
  test('is routed to handleWatchHistoryButton instead of falling through as unknown', async () => {
    const interaction = createMockInteraction({
      customId: 'log_watched_channel123_starter-user',
      userId: 'starter-user',
    });

    await handleButtonInteraction(interaction);

    // The bug: previously nothing would be called at all (silent "Unknown button" warn).
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();

    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toContain('watched_modal_channel123_starter-user_');
  });

  test('rejects a non-starter, non-moderator user with a friendly ephemeral message', async () => {
    const interaction = createMockInteraction({
      customId: 'log_watched_channel123_starter-user',
      userId: 'someone-else',
      isModerator: false,
    });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });

  test('allows a moderator to log on behalf of the timer starter', async () => {
    const interaction = createMockInteraction({
      customId: 'log_watched_channel123_starter-user',
      userId: 'a-moderator',
      isModerator: true,
    });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
