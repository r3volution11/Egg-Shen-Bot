/**
 * Tests for /suggest-quote — writes a candidate quote to the pending review
 * queue and, if a moderation channel is configured for the guild, posts a
 * notification there with Approve/Edit/Reject buttons. Never touches the
 * live quote list directly.
 *
 * Run with: npx jest tests/suggest-quote-command.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — see movieQuotesStore.test.js's comment for
// why (parallel Jest workers would otherwise race on the real file).
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.suggest-quote-command.test.json');
const PENDING_FILE = path.join(process.cwd(), 'movie_quotes_pending.suggest-quote-command.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;
process.env.MOVIE_QUOTES_PENDING_FILE = PENDING_FILE;

const { execute } = await import('../src/commands/suggest-quote.js');
const { loadGuildConfig, saveGuildConfig } = await import('../src/utils/guildConfig.js');
const { loadPending } = await import('../src/utils/pendingQuotesStore.js');
const { loadQuotes } = await import('../src/utils/movieQuotesStore.js');

const GUILD_ID = 'suggest-quote-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);

function cleanup() {
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.rmSync(GUILD_CONFIG_FILE);
  if (fs.existsSync(PENDING_FILE)) fs.rmSync(PENDING_FILE);
  if (fs.existsSync(QUOTES_FILE)) fs.rmSync(QUOTES_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeInteraction({ quote = 'A suggested line.', title = null, author = null, guild = null, userId = 'suggester-1' } = {}) {
  const options = {
    getString: (name) => (name === 'quote' ? quote : name === 'title' ? title : name === 'author' ? author : null),
  };
  const state = {};
  return {
    guildId: GUILD_ID,
    guild,
    user: { id: userId, tag: 'tester#0001' },
    member: { permissions: { has: () => false } },
    options,
    deferReply: async () => { state.deferred = true; },
    editReply: async (payload) => { state.reply = payload; },
    get lastReply() { return state.reply; },
  };
}

describe('/suggest-quote', () => {
  test('writes the suggestion to the pending queue without touching the live list', async () => {
    const interaction = makeInteraction({ quote: 'Trust no one.', title: 'The Thing', author: 'MacReady' });

    await execute(interaction);

    const pending = await loadPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      text: 'Trust no one.',
      title: 'The Thing',
      author: 'MacReady',
      suggestedBy: 'tester#0001',
      suggestedById: 'suggester-1',
      guildId: GUILD_ID,
    });

    const liveQuotes = await loadQuotes();
    expect(liveQuotes.some(q => q.text === 'Trust no one.')).toBe(false);
  });

  test('replies ephemerally confirming submission when no moderation channel is configured', async () => {
    const interaction = makeInteraction();

    await execute(interaction);

    expect(interaction.lastReply.content).toMatch(/submitted for review/i);
  });

  test('posts a moderation-channel notification with Approve/Edit/Reject buttons when configured', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.quoteSuggestions.moderationChannel = 'mod-channel-1';
    await saveGuildConfig(GUILD_ID, config);

    const sendMock = jest.fn().mockResolvedValue({ id: 'msg-1' });
    const guild = {
      channels: {
        cache: new Map([
          ['mod-channel-1', { id: 'mod-channel-1', isTextBased: () => true, send: sendMock }],
        ]),
      },
    };

    const interaction = makeInteraction({ quote: 'Trust no one.', guild });
    await execute(interaction);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload] = sendMock.mock.calls[0];
    expect(payload.embeds[0].data.description).toContain('Trust no one.');

    const buttons = payload.components[0].components.map(b => b.data.custom_id);
    const pending = await loadPending();
    const id = pending[0].id;
    expect(buttons).toEqual([`approve_quote_${id}`, `edit_quote_${id}`, `reject_quote_${id}`]);

    expect(interaction.lastReply.content).toMatch(/sent to the moderators/i);
  });

  test('still queues the suggestion (with a generic confirmation) when the configured channel no longer exists', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.quoteSuggestions.moderationChannel = 'missing-channel';
    await saveGuildConfig(GUILD_ID, config);

    const guild = { channels: { cache: new Map() } };
    const interaction = makeInteraction({ quote: 'Trust no one.', guild });

    await execute(interaction);

    const pending = await loadPending();
    expect(pending).toHaveLength(1);
    expect(interaction.lastReply.content).toMatch(/submitted for review/i);
  });
});

describe('/suggest-quote per-user pending cap', () => {
  test('rejects a new suggestion once the user hits maxPendingPerUser (default 3)', async () => {
    for (let i = 0; i < 3; i++) {
      await execute(makeInteraction({ quote: `Suggestion ${i}.` }));
    }
    expect(await loadPending()).toHaveLength(3);

    const interaction = makeInteraction({ quote: 'One too many.' });
    await execute(interaction);

    expect(await loadPending()).toHaveLength(3);
    expect(interaction.lastReply.content).toMatch(/already have 3 suggestion/i);
  });

  test('a different user is not affected by another user\'s pending count', async () => {
    for (let i = 0; i < 3; i++) {
      await execute(makeInteraction({ quote: `Suggestion ${i}.`, userId: 'suggester-1' }));
    }

    const interaction = makeInteraction({ quote: 'From someone else.', userId: 'suggester-2' });
    await execute(interaction);

    const pending = await loadPending();
    expect(pending).toHaveLength(4);
    expect(pending.some(p => p.text === 'From someone else.')).toBe(true);
  });

  test('respects a configured maxPendingPerUser override', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.quoteSuggestions.maxPendingPerUser = 1;
    await saveGuildConfig(GUILD_ID, config);

    await execute(makeInteraction({ quote: 'First.' }));
    const interaction = makeInteraction({ quote: 'Second.' });
    await execute(interaction);

    expect(await loadPending()).toHaveLength(1);
    expect(interaction.lastReply.content).toMatch(/already have 1 suggestion/i);
  });

  test('approving/rejecting a suggestion frees up a slot for that user', async () => {
    const { approvePending } = await import('../src/utils/pendingQuotesStore.js');

    for (let i = 0; i < 3; i++) {
      await execute(makeInteraction({ quote: `Suggestion ${i}.` }));
    }
    const pendingBefore = await loadPending();
    await approvePending(pendingBefore[0].id);

    const interaction = makeInteraction({ quote: 'Now there is room.' });
    await execute(interaction);

    expect(await loadPending()).toHaveLength(3);
  });
});
