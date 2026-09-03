/**
 * Tests for /eggshen-config-quotes — admin/moderator direct-add (bypasses
 * the /suggest-quote review queue), edit, delete, list, and the
 * quote-suggestion moderation-channel setting.
 *
 * Run with: npx jest tests/eggshen-config-quotes.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — see movieQuotesStore.test.js's comment for
// why (parallel Jest workers would otherwise race on the real file).
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.eggshen-config-quotes.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;

const { execute } = await import('../src/commands/eggshen-config-quotes.js');
const { setQuotes } = await import('../src/utils/movieQuotesStore.js');
const { loadGuildConfig } = await import('../src/utils/guildConfig.js');

const GUILD_ID = 'eggshen-config-quotes-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) fs.rmSync(QUOTES_FILE);
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.rmSync(GUILD_CONFIG_FILE);
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

function makeInteraction({ subcommand, options = {}, isAdmin = true, channel = null }) {
  const state = {};
  return {
    guildId: GUILD_ID,
    member: makeMember({ isAdmin }),
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
      getInteger: (name) => options[name] ?? null,
      getChannel: () => channel,
    },
    reply: async (payload) => { state.reply = payload; },
    get lastReply() { return state.reply; },
  };
}

describe('/eggshen-config-quotes quotes add', () => {
  test('a non-admin is rejected', async () => {
    const interaction = makeInteraction({ subcommand: 'add', options: { quote: 'Trust no one.' }, isAdmin: false });

    await execute(interaction);

    expect(interaction.lastReply.content).toMatch(/Administrator, Manage Server, or Moderator/);
  });

  test('an admin adds a quote directly to the live list, no review step', async () => {
    await setQuotes([]);
    const interaction = makeInteraction({
      subcommand: 'add',
      options: { quote: 'Trust no one.', title: 'The Thing', author: 'MacReady' },
    });

    await execute(interaction);

    const { loadQuotes } = await import('../src/utils/movieQuotesStore.js');
    const quotes = await loadQuotes();
    expect(quotes).toContainEqual({ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' });
    expect(interaction.lastReply.content).toMatch(/Quote added at index/);
  });
});

describe('/eggshen-config-quotes quotes edit', () => {
  test('updates the quote at the given index', async () => {
    await setQuotes([{ text: 'Original.' }]);
    const interaction = makeInteraction({
      subcommand: 'edit',
      options: { index: 0, quote: 'Edited.' },
    });

    await execute(interaction);

    const { loadQuotes } = await import('../src/utils/movieQuotesStore.js');
    const quotes = await loadQuotes();
    expect(quotes[0]).toEqual({ text: 'Edited.' });
    expect(interaction.lastReply.content).toMatch(/updated/);
  });

  test('reports an error for an out-of-range index', async () => {
    await setQuotes([{ text: 'Only one.' }]);
    const interaction = makeInteraction({
      subcommand: 'edit',
      options: { index: 5, quote: 'Nope.' },
    });

    await execute(interaction);

    expect(interaction.lastReply.content).toMatch(/❌/);
  });
});

describe('/eggshen-config-quotes quotes delete', () => {
  test('removes the quote at the given index', async () => {
    await setQuotes([{ text: 'One.' }, { text: 'Two.' }]);
    const interaction = makeInteraction({ subcommand: 'delete', options: { index: 0 } });

    await execute(interaction);

    const { loadQuotes } = await import('../src/utils/movieQuotesStore.js');
    const quotes = await loadQuotes();
    expect(quotes).toEqual([{ text: 'Two.' }]);
  });
});

describe('/eggshen-config-quotes quotes list', () => {
  test('lists quotes with their index and metadata', async () => {
    await setQuotes([
      { title: 'The Thing', text: 'Trust no one.', author: 'MacReady' },
      { text: 'No metadata.' },
    ]);
    const interaction = makeInteraction({ subcommand: 'list' });

    await execute(interaction);

    const embed = interaction.lastReply.embeds[0];
    expect(embed.data.description).toContain('0.');
    expect(embed.data.description).toContain('Trust no one.');
    expect(embed.data.description).toContain('The Thing — MacReady');
    expect(embed.data.description).toContain('1.');
    expect(embed.data.description).toContain('No metadata.');
  });

  test('reports no quotes yet when the list is empty', async () => {
    await setQuotes([]);
    const interaction = makeInteraction({ subcommand: 'list' });

    await execute(interaction);

    expect(interaction.lastReply.content).toMatch(/No quotes yet/);
  });
});

describe('/eggshen-config-quotes quotes moderation-channel', () => {
  test('sets the quote-suggestions moderation channel', async () => {
    const channel = { id: 'mod-channel-1', isTextBased: () => true, toString: () => '<#mod-channel-1>' };
    const interaction = makeInteraction({ subcommand: 'moderation-channel', channel });

    await execute(interaction);

    const config = await loadGuildConfig(GUILD_ID);
    expect(config.quoteSuggestions.moderationChannel).toBe('mod-channel-1');
    expect(interaction.lastReply.content).toMatch(/moderation channel set/);
  });

  test('rejects a non-text channel', async () => {
    const channel = { id: 'voice-1', isTextBased: () => false };
    const interaction = makeInteraction({ subcommand: 'moderation-channel', channel });

    await execute(interaction);

    expect(interaction.lastReply.content).toMatch(/select a text channel/);
  });
});
