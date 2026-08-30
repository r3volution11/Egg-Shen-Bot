/**
 * Tests for the "🔎 Search" button (timer_retype_<theme>), shown on
 * /timer start's auto-detect picker/zero-results recovery screens. Clicking
 * it opens a modal to type a corrected title — unlike "Extend Timer", there
 * is no ownership/permission gate: the picker it lives on is ephemeral, so
 * only the original /timer start invoker can see or click it at all, and
 * opening a modal doesn't mutate anything.
 *
 * Run with: npx jest tests/timer-retype-button.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';

jest.unstable_mockModule('../src/utils/timerManager.js', () => ({
  getTimerStatus: jest.fn(),
}));

let handleButtonInteraction;
beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
});

function createMockInteraction({ customId, userId = 'some-user' }) {
  return {
    customId,
    user: { id: userId },
    guild: { id: 'guild-1' },
    member: { permissions: { has: () => false } },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  };
}

describe('timer_retype_ button dispatch', () => {
  test('opens a modal with the correct customId and text input', async () => {
    const interaction = createMockInteraction({ customId: 'timer_retype_modern' });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('timer_retype_modal_modern');

    const textInput = modal.components[0].components[0];
    expect(textInput.data.custom_id).toBe('retypedTitle');
    expect(textInput.data.required).toBe(true);
  });

  test('extracts theme correctly from the customId', async () => {
    const interaction = createMockInteraction({ customId: 'timer_retype_scary' });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe('timer_retype_modal_scary');
  });

  test('opens the modal regardless of which user clicks — no ownership gate', async () => {
    // Intentional: the picker this button lives on is ephemeral, so only
    // the original /timer start invoker can see/click it at all — there's
    // no separate "who started this" state to check against (contrast with
    // timer_extend_, which does check against the running timer's userId).
    const interaction = createMockInteraction({ customId: 'timer_retype_modern', userId: 'a-completely-different-user' });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
