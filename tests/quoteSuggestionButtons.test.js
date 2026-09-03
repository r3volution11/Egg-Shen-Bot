/**
 * Tests for the quote-suggestion moderation buttons in buttonHandler.js:
 * approve_quote_, edit_quote_, reject_quote_ — mirrors the event-request
 * approval flow's button handling (see eventRequestDeny.test.js), adapted
 * for the pendingQuotesStore.js-backed suggestion queue.
 *
 * The edit_quote_modal_ submission handler itself lives inline in index.js's
 * interactionCreate listener and isn't independently exported — same
 * limitation eventRequestDeny.test.js notes for edit_event_modal_/
 * deny_event_modal_; see the plan's manual verification step for full
 * end-to-end coverage of that path.
 *
 * Run with: npx jest tests/quoteSuggestionButtons.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — see movieQuotesStore.test.js's comment for
// why (parallel Jest workers would otherwise race on the real file).
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.quoteSuggestionButtons.test.json');
const PENDING_FILE = path.join(process.cwd(), 'movie_quotes_pending.quoteSuggestionButtons.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;
process.env.MOVIE_QUOTES_PENDING_FILE = PENDING_FILE;

const { handleButtonInteraction } = await import('../src/handlers/buttonHandler.js');
const { addPending, loadPending } = await import('../src/utils/pendingQuotesStore.js');
const { loadQuotes } = await import('../src/utils/movieQuotesStore.js');

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) fs.rmSync(QUOTES_FILE);
  if (fs.existsSync(PENDING_FILE)) fs.rmSync(PENDING_FILE);
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

function makeInteraction({ customId, isAdmin = false }) {
  return {
    customId,
    user: { id: 'mod-1', tag: 'Mod#0001' },
    guild: { id: 'guild-1' },
    guildId: 'guild-1',
    member: makeMember({ isAdmin }),
    message: {
      embeds: [{ description: '*"Trust no one."*', footer: null }],
      edit: jest.fn().mockResolvedValue(undefined),
    },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  };
}

describe('approve_quote_ button', () => {
  test('a moderator approving moves the suggestion into the live rotation', async () => {
    const id = await addPending({ text: 'Trust no one.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `approve_quote_${id}`, isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(await loadPending()).toEqual([]);
    const quotes = await loadQuotes();
    expect(quotes.some(q => q.text === 'Trust no one.')).toBe(true);

    expect(interaction.message.edit).toHaveBeenCalledTimes(1);
    const editedEmbed = interaction.message.edit.mock.calls[0][0].embeds[0];
    expect(editedEmbed.data.title).toContain('Approved');
    expect(interaction.message.edit.mock.calls[0][0].components).toEqual([]);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('approved') })
    );
  });

  test('a non-admin is rejected without approving', async () => {
    const id = await addPending({ text: 'Trust no one.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `approve_quote_${id}`, isAdmin: false });

    await handleButtonInteraction(interaction);

    expect(await loadPending()).toHaveLength(1);
    expect(interaction.message.edit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('moderators and administrators') })
    );
  });

  test('approving an already-processed (missing) suggestion reports an error', async () => {
    const interaction = makeInteraction({ customId: 'approve_quote_does-not-exist', isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Failed to process') })
    );
  });
});

describe('reject_quote_ button', () => {
  test('a moderator rejecting removes the suggestion without adding it to the live list', async () => {
    const id = await addPending({ text: 'Trust no one.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `reject_quote_${id}`, isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(await loadPending()).toEqual([]);
    const quotes = await loadQuotes();
    expect(quotes.some(q => q.text === 'Trust no one.')).toBe(false);

    const editedEmbed = interaction.message.edit.mock.calls[0][0].embeds[0];
    expect(editedEmbed.data.title).toContain('Rejected');

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('rejected') })
    );
  });

  test('a non-admin is rejected without rejecting the suggestion', async () => {
    const id = await addPending({ text: 'Trust no one.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `reject_quote_${id}`, isAdmin: false });

    await handleButtonInteraction(interaction);

    expect(await loadPending()).toHaveLength(1);
  });
});

describe('edit_quote_ button', () => {
  test('a moderator clicking Edit is shown a modal pre-filled with the suggestion', async () => {
    const id = await addPending({ title: 'The Thing', text: 'Trust no one.', author: 'MacReady', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `edit_quote_${id}`, isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.data.custom_id).toBe(`edit_quote_modal_${id}`);

    const [titleRow, textRow, authorRow] = modal.components;
    expect(titleRow.components[0].data.value).toBe('The Thing');
    expect(textRow.components[0].data.value).toBe('Trust no one.');
    expect(authorRow.components[0].data.value).toBe('MacReady');
  });

  test('the suggestion is not removed from pending just from clicking Edit', async () => {
    const id = await addPending({ text: 'Trust no one.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `edit_quote_${id}`, isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(await loadPending()).toHaveLength(1);
  });

  test('a non-admin is rejected without seeing a modal', async () => {
    const id = await addPending({ text: 'Trust no one.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
    const interaction = makeInteraction({ customId: `edit_quote_${id}`, isAdmin: false });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('moderators and administrators') })
    );
  });

  test('editing an already-processed (missing) suggestion is rejected', async () => {
    const interaction = makeInteraction({ customId: 'edit_quote_does-not-exist', isAdmin: true });

    await handleButtonInteraction(interaction);

    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('expired or was already processed') })
    );
  });
});
