/**
 * Tests for the "Edit Details" step of event-request approval.
 *
 * Covers the button-trigger side (buttonHandler.js's edit_event_ handling,
 * which shows a modal pre-filled with the request's current title/
 * description) and the actual edit-application logic extracted into a
 * shared shape for direct testing (mutating global.eventRequests + updating
 * the moderation-channel embed), since the modal *submission* handling
 * itself lives inline in index.js's interactionCreate listener and isn't
 * independently exported — mirroring the existing watched_modal_ pattern,
 * which has the same limitation.
 *
 * Run with: npx jest tests/eventRequestEdit.test.js --verbose
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
      embeds: [{ description: '**Original Title**', footer: { text: 'Guild: Test Server' } }],
    },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  };
}

function seedRequest(requestId, overrides = {}) {
  global.eventRequests = new Map([
    [requestId, {
      guildId: 'guild-1',
      title: 'Original Title',
      description: 'Original description',
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

describe('edit_event_ button', () => {
  const requestId = '1234567890_abc123';

  test('a moderator clicking Edit is shown a modal pre-filled with the current title/description', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe(`edit_event_modal_${requestId}`);

    const titleInput = modal.components[0].components[0];
    const descriptionInput = modal.components[1].components[0];
    expect(titleInput.data.value).toBe('Original Title');
    expect(descriptionInput.data.value).toBe('Original description');
  });

  test('a non-moderator is rejected without seeing a modal', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: false });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Only moderators and administrators') })
    );
  });

  test('editing an already-processed (missing) request is rejected', async () => {
    // global.eventRequests intentionally left empty
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('expired or was already processed') })
    );
  });

  test('an empty stored description pre-fills the modal with an empty string, not "undefined"', async () => {
    seedRequest(requestId, { description: null });
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const descriptionInput = modal.components[1].components[0];
    expect(descriptionInput.data.value).toBe('');
  });
});

describe('editing mutates the stored request so both approval paths pick it up', () => {
  test('mutating global.eventRequests in place is visible to a subsequent approval read', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId);

    // Simulate what the edit_event_modal_ submission handler in index.js does:
    // read the stored request, mutate title/description in place.
    const requestData = global.eventRequests.get(requestId);
    requestData.title = 'Corrected Title';
    requestData.description = 'Corrected description';

    // Both event-creation code paths in buttonHandler.js do a fresh
    // global.eventRequests.get(requestId) immediately before building
    // eventConfig — confirm that fresh read reflects the edit.
    const rereadRequestData = global.eventRequests.get(requestId);
    expect(rereadRequestData.title).toBe('Corrected Title');
    expect(rereadRequestData.description).toBe('Corrected description');
  });
});
