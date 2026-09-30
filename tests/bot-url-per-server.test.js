/**
 * Per-server bot URL: `/eggshen-config-website bot-url` and getPublicBotUrl.
 *
 * One bot serves a test server (dev.eggshenbot.com) and a live one
 * (shudderdrivein.com); links it posts must go to each server's own domain,
 * so testing takes the same path the live server does. PUBLIC_BOT_URL stays
 * as the fallback for servers without one.
 *
 * The reachability check is driven with a mocked fetch: the cases that
 * matter are an address that is this bot, one whose proxy doesn't forward
 * the setup form (the site's own page comes back), and one that is some
 * other bot.
 *
 * Run with: npm test -- tests/bot-url-per-server.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';

const GUILD_ID = 'bot-url-per-server-guild';
const BOT_TAG = 'Egg Shen#1253';

let getPublicBotUrl;
let loadGuildConfig;
let saveGuildConfig;
let execute;

const ORIGINAL_URL = process.env.PUBLIC_BOT_URL;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  ({ getPublicBotUrl, loadGuildConfig, saveGuildConfig } = await import('../src/utils/guildConfig.js'));
  ({ execute } = await import('../src/commands/eggshen-config-website.js'));
});

beforeEach(async () => {
  process.env.PUBLIC_BOT_URL = 'https://live.example';
  await saveGuildConfig(GUILD_ID, {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (ORIGINAL_URL === undefined) delete process.env.PUBLIC_BOT_URL;
  else process.env.PUBLIC_BOT_URL = ORIGINAL_URL;
});

/** Pretend the address is: this bot, this bot without the setup route, or another bot. */
function serveAs({ bot = BOT_TAG, setupForwarded = true } = {}) {
  globalThis.fetch = jest.fn(async (url) => {
    if (url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', bot }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/tournament-setup')) {
      return setupForwarded
        ? new Response('This setup link is not valid.', { status: 403 })
        : new Response('<!DOCTYPE html><title>Request a Watch Party Event</title>', { status: 200 });
    }
    return new Response('', { status: 404 });
  });
}

function interaction(url) {
  return {
    guildId: GUILD_ID,
    client: { user: { tag: BOT_TAG } },
    member: { permissions: { has: () => true } },
    options: {
      getSubcommand: () => 'bot-url',
      getString: (name) => (name === 'url' ? url : null),
    },
    deferred: false,
    reply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
}

const replyText = (i) => [...i.reply.mock.calls, ...i.editReply.mock.calls].map(([p]) => (typeof p === 'string' ? p : p.content)).join('\n');

describe('getPublicBotUrl', () => {
  test('a server\'s own bot URL wins over PUBLIC_BOT_URL', () => {
    expect(getPublicBotUrl({ website: { botUrl: 'https://dev.example' } })).toBe('https://dev.example');
  });

  test('without one, PUBLIC_BOT_URL is used, minus any trailing slash', () => {
    process.env.PUBLIC_BOT_URL = 'https://live.example/';
    expect(getPublicBotUrl({})).toBe('https://live.example');
    expect(getPublicBotUrl(undefined)).toBe('https://live.example');
  });

  test('with neither, null — callers say what to set instead of building a broken link', () => {
    delete process.env.PUBLIC_BOT_URL;
    expect(getPublicBotUrl({})).toBeNull();
  });
});

describe('/eggshen-config-website bot-url', () => {
  test('saves the address (origin only) and confirms it reaches this bot', async () => {
    serveAs();
    const i = interaction('https://dev.example/some/path');
    await execute(i);

    expect((await loadGuildConfig(GUILD_ID)).website.botUrl).toBe('https://dev.example');
    expect(replyText(i)).toContain('✅');
    expect(replyText(i)).toContain('reaches this bot');
  });

  test('warns when the proxy doesn\'t forward the setup form, but still saves', async () => {
    serveAs({ setupForwarded: false });
    const i = interaction('https://dev.example');
    await execute(i);

    expect((await loadGuildConfig(GUILD_ID)).website.botUrl).toBe('https://dev.example');
    expect(replyText(i)).toContain("isn't forwarded to the bot");
  });

  test('warns when the address is a different bot', async () => {
    serveAs({ bot: 'Someone Else#0001' });
    const i = interaction('https://other.example');
    await execute(i);
    expect(replyText(i)).toContain('not this bot');
  });

  test('refuses something that isn\'t a web address, and saves nothing', async () => {
    const i = interaction('dev.example');
    await execute(i);
    expect(replyText(i)).toContain("isn't a web address");
    expect((await loadGuildConfig(GUILD_ID)).website?.botUrl).toBeUndefined();
  });

  test('leaving the address out clears it, back to PUBLIC_BOT_URL', async () => {
    await saveGuildConfig(GUILD_ID, { website: { botUrl: 'https://dev.example', theme: 'default' } });
    const i = interaction(null);
    await execute(i);

    const config = await loadGuildConfig(GUILD_ID);
    expect(config.website).toEqual({ theme: 'default' });
    expect(replyText(i)).toContain('https://live.example');
  });
});
