/**
 * Tests for the "Extend Timer" button (timer_extend_<channelId>), posted by
 * timerScheduler.js's expiry warning. Clicking it should open a modal to
 * collect additional minutes, gated to the timer's starter or an admin/mod —
 * mirroring the existing log_watched_ button's permission pattern.
 *
 * Run with: npx jest tests/timer-extend-button.test.js --verbose
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockGetTimerStatus = jest.fn();

jest.unstable_mockModule('../src/utils/timerManager.js', () => ({
  getTimerStatus: mockGetTimerStatus,
}));

let handleButtonInteraction;
beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
});

beforeEach(() => {
  mockGetTimerStatus.mockReset();
});

function createMockInteraction({ customId, userId = 'starter-user', isAdmin = false }) {
  return {
    customId,
    user: { id: userId },
    guild: { id: 'guild-1' },
    member: {
      permissions: {
        has: (flag) => {
          if (!isAdmin) return false;
          return ['Administrator', 'ManageGuild', 'ModerateMembers', 'KickMembers', 'BanMembers'].includes(flag);
        },
      },
    },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  };
}

describe('timer_extend_ button dispatch', () => {
  test('opens a modal for the timer starter', async () => {
    mockGetTimerStatus.mockReturnValue({ userId: 'starter-user', label: 'Movie Night', duration: 120 });
    const interaction = createMockInteraction({ customId: 'timer_extend_channel-1', userId: 'starter-user' });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();

    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('timer_extend_modal_channel-1');
  });

  test('allows an admin to extend someone else\'s timer', async () => {
    mockGetTimerStatus.mockReturnValue({ userId: 'starter-user', label: 'Movie Night', duration: 120 });
    const interaction = createMockInteraction({ customId: 'timer_extend_channel-1', userId: 'an-admin', isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  test('rejects a non-starter, non-admin user', async () => {
    mockGetTimerStatus.mockReturnValue({ userId: 'starter-user', label: 'Movie Night', duration: 120 });
    const interaction = createMockInteraction({ customId: 'timer_extend_channel-1', userId: 'someone-else' });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only the person who started the timer') })
    );
  });

  test('replies with an error if the timer no longer exists', async () => {
    mockGetTimerStatus.mockReturnValue(null);
    const interaction = createMockInteraction({ customId: 'timer_extend_channel-1', userId: 'starter-user' });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer active') })
    );
  });

  test('extracts the channelId correctly even though channel IDs are purely numeric', async () => {
    mockGetTimerStatus.mockReturnValue({ userId: 'starter-user', duration: 60 });
    const interaction = createMockInteraction({ customId: 'timer_extend_1234567890123456789', userId: 'starter-user' });

    await handleButtonInteraction(interaction);

    expect(mockGetTimerStatus).toHaveBeenCalledWith('1234567890123456789');
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('timer_extend_modal_1234567890123456789');
  });
});
