/**
 * Tests for the "Edit Details" step of event-request approval.
 *
 * Covers the button-trigger side (buttonHandler.js's edit_event_ handling,
 * which shows a modal pre-filled with the request's current title/
 * description/start-end time) and the actual edit-application logic
 * extracted into a shared shape for direct testing (mutating
 * global.eventRequests + updating the moderation-channel embed), since the
 * modal *submission* handling itself lives inline in index.js's
 * interactionCreate listener and isn't independently exported — mirroring
 * the existing watched_modal_ pattern, which has the same limitation.
 *
 * The start/end time editing logic is the one exception: unlike the
 * title/description/imageUrl handling (still inline-only in index.js, so
 * this file reimplements applyEditedImageUrl locally to test it),
 * applyEventTimeEdits() lives as an independently exported function in
 * eventRequestApproval.js, so the tests below import and call the real
 * function directly rather than reimplementing its logic here.
 *
 * Saving the edit now also immediately approves the request (creating the
 * real Discord scheduled event) instead of just updating the stored
 * title/description and leaving it pending — see tests/eventRequestApproval.
 * test.js for coverage of the shared createScheduledEventFromRequest/
 * buildApprovedEmbed/cleanupEventRequestState/applyEventTimeEdits logic
 * that drives that, reused from the same code path the Approve buttons use.
 *
 * Run with: npx jest tests/eventRequestEdit.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';
import { applyEventTimeEdits } from '../src/utils/eventRequestApproval.js';
import { formatUtcForInput } from '../src/utils/eventTimeInput.js';

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

  test('the modal includes an optional Image URL field pre-filled with the current value', async () => {
    seedRequest(requestId, { imageUrl: 'https://example.com/poster.png' });
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const imageUrlInput = modal.components[2].components[0];
    expect(imageUrlInput.data.custom_id).toBe('imageUrl');
    expect(imageUrlInput.data.value).toBe('https://example.com/poster.png');
    expect(imageUrlInput.data.required).toBeFalsy();
  });

  test('the Image URL field pre-fills empty when the request has no imageUrl yet', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const imageUrlInput = modal.components[2].components[0];
    expect(imageUrlInput.data.value).toBe('');
  });

  test('the modal includes Start Time and End Time fields pre-filled from the current schedule', async () => {
    seedRequest(requestId, { startTime: '2026-09-15T20:00:00.000Z', endTime: '2026-09-15T22:00:00.000Z' });
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const startTimeInput = modal.components[3].components[0];
    const endTimeInput = modal.components[4].components[0];

    expect(startTimeInput.data.custom_id).toBe('startTime');
    expect(startTimeInput.data.label).toBe('Start Time (UTC)');
    expect(startTimeInput.data.value).toBe('2026-09-15 20:00');
    expect(endTimeInput.data.custom_id).toBe('endTime');
    expect(endTimeInput.data.label).toBe('End Time (UTC, optional)');
    expect(endTimeInput.data.value).toBe('2026-09-15 22:00');
  });

  test('the End Time field pre-fills empty when the request has no end time yet', async () => {
    seedRequest(requestId, { startTime: '2026-09-15T20:00:00.000Z', endTime: null });
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const endTimeInput = modal.components[4].components[0];
    expect(endTimeInput.data.value).toBe('');
  });

  test('Start Time is required, End Time is not', async () => {
    seedRequest(requestId);
    const interaction = makeInteraction({ customId: `edit_event_${requestId}`, isModerator: true });

    await handleButtonInteraction(interaction);

    const modal = interaction.showModal.mock.calls[0][0];
    const startTimeInput = modal.components[3].components[0];
    const endTimeInput = modal.components[4].components[0];
    expect(startTimeInput.data.required).toBe(true);
    expect(endTimeInput.data.required).toBeFalsy();
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

describe('imageUrl field submission logic (mirrors index.js edit_event_modal_ handling)', () => {
  // index.js's modal-submission handler isn't independently exported (same
  // limitation noted above for title/description), so this exercises the
  // exact conditional it runs: `if (editedImageUrl) { requestData.imageUrl =
  // editedImageUrl; requestData.hasUploadedImage = false; }` — a non-blank
  // submission overrides, a blank one is left alone (no "clear" action).
  function applyEditedImageUrl(requestData, editedImageUrl) {
    if (editedImageUrl) {
      requestData.imageUrl = editedImageUrl;
      requestData.hasUploadedImage = false;
    }
  }

  test('a non-blank Image URL overrides any prior imageUrl and clears hasUploadedImage', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { imageUrl: 'https://example.com/old.png' });
    const requestData = global.eventRequests.get(requestId);

    applyEditedImageUrl(requestData, 'https://example.com/new.png');

    expect(requestData.imageUrl).toBe('https://example.com/new.png');
    expect(requestData.hasUploadedImage).toBe(false);
  });

  test('a non-blank Image URL overrides a prior uploaded image', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { hasUploadedImage: true });
    const requestData = global.eventRequests.get(requestId);

    applyEditedImageUrl(requestData, 'https://example.com/override.png');

    expect(requestData.imageUrl).toBe('https://example.com/override.png');
    expect(requestData.hasUploadedImage).toBe(false);
  });

  test('submitting the field blank does not clear an existing uploaded image', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { hasUploadedImage: true });
    const requestData = global.eventRequests.get(requestId);

    applyEditedImageUrl(requestData, '');

    expect(requestData.hasUploadedImage).toBe(true);
    expect(requestData.imageUrl).toBeUndefined();
  });

  test('submitting the field blank does not clear an existing imageUrl', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { imageUrl: 'https://example.com/keep-me.png' });
    const requestData = global.eventRequests.get(requestId);

    applyEditedImageUrl(requestData, '');

    expect(requestData.imageUrl).toBe('https://example.com/keep-me.png');
  });
});

describe('time edit application logic (mirrors index.js edit_event_modal_ handling)', () => {
  // Unlike applyEditedImageUrl above, applyEventTimeEdits is independently
  // exported from eventRequestApproval.js, so these call the real function
  // directly against a seedRequest-shaped requestData rather than
  // reimplementing index.js's inline logic locally.
  const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

  test('a valid start+end edit updates a seeded request correctly', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { startTime: '2020-01-01T00:00:00.000Z', endTime: null });
    const requestData = global.eventRequests.get(requestId);

    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', '2026-09-15 22:00', FIXED_NOW);

    expect(result.ok).toBe(true);
    expect(requestData.startTime).toBe('2026-09-15T20:00:00.000Z');
    expect(requestData.endTime).toBe('2026-09-15T22:00:00.000Z');
  });

  test('blanking End Time clears it on a request that previously had one set', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { startTime: '2020-01-01T00:00:00.000Z', endTime: '2020-01-01T01:00:00.000Z' });
    const requestData = global.eventRequests.get(requestId);

    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', '', FIXED_NOW);

    expect(result.ok).toBe(true);
    expect(requestData.endTime).toBeNull();
  });

  test('an unedited resubmit (formatted value fed straight back in) produces the exact same stored instant', () => {
    const requestId = '1234567890_abc123';
    seedRequest(requestId, { startTime: '2026-09-15T20:00:00.000Z', endTime: '2026-09-15T22:00:00.000Z' });
    const requestData = global.eventRequests.get(requestId);

    // Simulate a moderator who opened the modal and submitted without
    // touching the pre-filled Start/End Time fields.
    const startTimeInput = formatUtcForInput(requestData.startTime);
    const endTimeInput = formatUtcForInput(requestData.endTime);
    const result = applyEventTimeEdits(requestData, startTimeInput, endTimeInput, FIXED_NOW);

    expect(result.ok).toBe(true);
    expect(requestData.startTime).toBe('2026-09-15T20:00:00.000Z');
    expect(requestData.endTime).toBe('2026-09-15T22:00:00.000Z');
  });
});
