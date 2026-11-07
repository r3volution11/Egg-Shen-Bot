/**
 * Search pickers never offer more than 25 options, whatever max-results says.
 *
 * A Discord select menu holds 25 options at most; discord.js throws building
 * a 26th, and the command answers with its generic error. `/eggshen-config
 * settings max-results` accepted 1-50 and every picker sliced its results to
 * that number unchecked, so on a server set above 25 any search with more
 * than 25 matches failed. The option now stops at 25, and every picker reads
 * the setting through selectMenuLimits.searchResultLimit(), so a config saved
 * at 50 before the cap still works.
 *
 * Driven through the real commands with real recorded API responses
 * (tests/harness/httpReplay.js): BoardGameGeek's search for "catan" returns
 * 138 games.
 *
 * Run with: npm test -- tests/search-picker-limit.test.js
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { installHttpReplay } from './harness/httpReplay.js';
import { FakeDiscord } from './harness/fakeDiscord.js';

const GUILD = 'search-picker-limit-guild';
const CONFIG_FILE = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);

let boardgame;
let similar;
let eggshenConfig;
let config;
let savedBggId;

beforeAll(async () => {
  // Before any service is imported: each one's axios client copies the adapter
  installHttpReplay();
  ({ config } = await import('../src/config.js'));
  // /similar searches BoardGameGeek only when a client id is configured; the
  // recorded responses stand in for the network either way
  savedBggId = config.apis.bgg.clientId;
  config.apis.bgg.clientId = savedBggId || 'test-client-id';
  boardgame = await import('../src/commands/boardgame.js');
  similar = await import('../src/commands/similar.js');
  eggshenConfig = await import('../src/commands/eggshen-config.js');

  // A config saved when max-results still went up to 50
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ maxSearchResults: 50 }));
});

afterAll(() => {
  config.apis.bgg.clientId = savedBggId;
  if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
});

function setup() {
  const discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('member');
  discord.addUser('admin', { admin: true });
  return discord;
}

async function run(command, discord, userId, name, options) {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const i = discord.command(userId, name, options);
    await command.execute(i);
    return { reply: i.replyMessage, errors: errors.mock.calls.map(c => c.map(String).join(' ')) };
  } finally {
    errors.mockRestore();
  }
}

describe('a server whose saved max-results is 50', () => {
  test('/boardgame with 138 matches offers a picker of 25', async () => {
    const discord = setup();
    const { reply, errors } = await run(boardgame, discord, 'member', 'boardgame', { options: { query: 'catan' } });

    expect(errors).toEqual([]);
    expect(reply.text).not.toMatch(/error occurred/i);
    const menu = reply.findComponent('select_result');
    expect(menu).toBeTruthy();
    expect(menu.options).toHaveLength(25);
    expect(new Set(menu.options.map(o => o.value)).size).toBe(25);
    expect(menu.options[0].label).toMatch(/catan/i);
  });

  test('/similar with 138 matches offers a picker of 25', async () => {
    const discord = setup();
    const { reply, errors } = await run(similar, discord, 'member', 'similar', { options: { title: 'catan', type: 'boardgame' } });

    expect(errors).toEqual([]);
    const menu = reply.findComponent('select_similar');
    expect(menu).toBeTruthy();
    expect(menu.options).toHaveLength(25);
  });

  test('settings view shows the 25 the pickers really offer', async () => {
    const discord = setup();
    const { reply } = await run(eggshenConfig, discord, 'admin', 'eggshen-config', { group: 'settings', subcommand: 'view' });
    const field = reply.embeds[0].toJSON().fields.find(f => f.name === 'Max Search Results');
    expect(field.value).toMatch(/^🔢 \*\*25\*\* results/);
    expect(field.value).toContain('count:<1-25>');
  });
});

describe('/eggshen-config settings max-results', () => {
  test('stops at 25, the most a select menu holds', () => {
    const settings = eggshenConfig.data.toJSON().options.find(o => o.name === 'settings');
    const count = settings.options.find(o => o.name === 'max-results').options.find(o => o.name === 'count');
    expect(count.min_value).toBe(1);
    expect(count.max_value).toBe(25);
    expect(count.description).toContain('1-25');
  });
});

describe('every picker', () => {
  test('reads max-results only through searchResultLimit', () => {
    // The two commands above stand for the rest: /movie, /tv, /episode,
    // /episode-list, /game, /book, /soundtrack, /random episode, /watched add,
    // /watchlist add and the tournament title search slice their results the
    // same way. A direct read anywhere would let a saved 50 through again.
    const dir = path.join(process.cwd(), 'src');
    const files = fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js'));
    const direct = files.filter((f) => {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      return /\.maxSearchResults\b(?!\s*=[^=])/.test(text) && !f.endsWith('selectMenuLimits.js');
    });
    expect(direct).toEqual([]);
    const users = files.filter(f => fs.readFileSync(path.join(dir, f), 'utf8').includes('searchResultLimit(guildConfig)'));
    expect(users.length).toBeGreaterThanOrEqual(13);
  });
});
