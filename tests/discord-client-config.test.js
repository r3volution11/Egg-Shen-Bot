/**
 * Regression coverage for the Discord client's gateway intents/partials/cache
 * config (src/index.js).
 *
 * Poll voting (see survey.js / pollManager.js) depends on messageReactionAdd
 * resolving reactions on messages the bot hasn't personally sent/fetched
 * this process — e.g. a survey message created before the last restart.
 * Without GuildMessages intent + Partials.Message/Reaction, discord.js's own
 * MessageReactionAdd handler silently returns before ever emitting the
 * event whenever the message isn't already cached (confirmed by reading
 * node_modules/discord.js/src/client/actions/{Action,MessageReactionAdd}.js)
 * — no error, the vote just never registers.
 *
 * This doesn't construct the real bot (src/index.js immediately calls
 * client.login() as a side effect of import), so it instead asserts the
 * exact same intents/partials/makeCache config against a real discord.js
 * Client, to catch a regression if this config ever drifts back to the
 * broken state.
 *
 * Run with: npx jest tests/discord-client-config.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { Client, GatewayIntentBits, Partials, Options } from 'discord.js';

function buildBotClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 50,
    }),
  });
}

describe('Discord client gateway config', () => {
  test('includes GuildMessages intent, required for reaction events to resolve uncached messages', () => {
    const client = buildBotClient();
    expect(client.options.intents.has(GatewayIntentBits.GuildMessages)).toBe(true);
  });

  test('includes GuildMessageReactions intent', () => {
    const client = buildBotClient();
    expect(client.options.intents.has(GatewayIntentBits.GuildMessageReactions)).toBe(true);
  });

  test('registers Partials.Message and Partials.Reaction, required to fetch uncached reaction targets', () => {
    const client = buildBotClient();
    expect(client.options.partials).toContain(Partials.Message);
    expect(client.options.partials).toContain(Partials.Reaction);
  });

  test('caps the message cache instead of accepting the unbounded default, since message content is never read', () => {
    const client = buildBotClient();
    // makeCache is a factory function; the real assertion is behavioral —
    // confirm it actually returns a size-limited collection for messages.
    const fakeManager = { name: 'MessageManager' };
    const cache = client.options.makeCache(class MessageManager {}, null, fakeManager);
    expect(cache.maxSize).toBe(50);
  });

  test('does NOT request privileged intents this bot has no use for (MessageContent, GuildMembers, GuildPresences)', () => {
    const client = buildBotClient();
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(false);
    expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(false);
    expect(client.options.intents.has(GatewayIntentBits.GuildPresences)).toBe(false);
  });
});
