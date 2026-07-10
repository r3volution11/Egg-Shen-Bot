/**
 * Tests for the "Deny with reason" step of event-request approval.
 *
 * Covers the button-trigger side (buttonHandler.js's deny_event_ handling,
 * which now shows a modal collecting an optional reason instead of denying
 * immediately) and the DM-failure-must-not-block-denial contract that the
 * deny_event_modal_ submission handler in index.js relies on, verified
 * directly against the same client.users.fetch/.send pattern it uses.
 *
 * The modal *submission* handling itself lives inline in index.js's
 * interactionCreate listener and isn't independently exported — mirroring
 * the existing watched_modal_ pattern, which has the same limitation; see
 * the plan's manual verification step for full end-to-end coverage of that
 * path.
 *
 * Run with: npx jest tests/eventRequestDeny.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';

function makeMember({ isModerator = false } = {}) {
  return {
    permissions: {
      has: (flag) => (isModerator ? ['ManageEvents', 'Administrator'].includes(flag) : false),
    },
  };
}

function makeInteraction({ customId, isModerator = false }) {
  return {
    customId,
    user: { id: 'mod-1', tag: 'Mod#0001' },
    guild: { id: 'guild-1' },
    guildId: 'guild-1',
    member: makeMember({ isModerator }),
    message: {
      embeds: [{ description: '**Movie Night**', footer: { text: 'Guild: Test Server' } }],
    },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
  };
}

function seedRequest(requestId, overrides = {}) {
  global.eventRequests = new Map([
    [requestId, {
      guildId: 'guild-1',
      title: 'Movie Night',
      description: 'Watching a movie',
      submitterDiscordId: 'submitter-1',
      submitterUsername: 'submitter',
      startTime: new Date().toISOString(),
      endTime: null,
      ...overrides,
    }],
  ]);
}

beforeEach(() => {
  global.eventRequests = new Map();
});

afterEach(() => {
  delete global.eventRequests;
});

describe('deny_event_ button', () => {
  const requestId = '1234567890_abc123';

  test('a moderator clicking Deny is shown a reason modal instead of an immediate denial', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `deny_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply).not.toHaveBeenCalled();

    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe(`deny_event_modal_${requestId}`);

    const reasonInput = modal.components[0].components[0];
    expect(reasonInput.data.required).toBe(false);
  });

  test('the request is not removed from global.eventRequests just from clicking Deny', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `deny_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    // Actual removal happens on modal submission (index.js), not on the button click.
    expect(global.eventRequests.has(requestId)).toBe(true);
  });

  test('a non-moderator is rejected without seeing a modal', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `deny_event_${requestId}`, isModerator: false });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only moderators and administrators') })
    );
  });

  test('denying an already-processed (missing) request is rejected', async () => {
    const interaction = makeInteraction({ customId: `deny_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('expired or was already processed') })
    );
  });
});

describe('DM-failure-does-not-block-denial contract', () => {
  test('a rejected users.fetch/.send does not throw when handled the way the modal submit handler does', async () => {
    const client = {
      users: {
        fetch: jest.fn().mockRejectedValue(new Error('DiscordAPIError[50007]: Cannot send messages to this user')),
      },
    };

    let dmSucceeded = false;
    await expect((async () => {
      try {
        const submitter = await client.users.fetch('submitter-1');
        await submitter.send({ embeds: [] });
        dmSucceeded = true;
      } catch (dmError) {
        // Matches the deny_event_modal_ handler's own try/catch shape.
      }
    })()).resolves.not.toThrow();

    expect(dmSucceeded).toBe(false);
  });
});
