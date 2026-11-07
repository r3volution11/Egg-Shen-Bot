/**
 * /eggshen-help lists every command the bot registers.
 *
 * /watchlist was missing — a whole user-facing command, behind its own
 * command switch, that help never mentioned. The seven split-out
 * /eggshen-config-* admin commands were missing from the admin section too
 * (it named only /eggshen-config), as was /eggshen-ask from the list itself.
 *
 * Compared against src/commands/ as deploy-commands registers it, so a new
 * command that isn't added to help fails here — help.js is maintained by
 * hand (CLAUDE.md: "Add it to src/commands/help.js by hand").
 *
 * Driven through the real command with the fake Discord, which rejects an
 * embed over Discord's limits the way Discord would.
 *
 * Run with: npm test -- tests/eggshen-help-every-command.test.js
 */

import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { updateCommandPermission } from '../src/utils/guildConfig.js';

const GUILD = 'eggshen-help-every-command-guild';
const CONFIG_FILE = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);

let help;
let registered; // [{ name, type }] for every command file
let discord;

beforeAll(async () => {
  help = await import('../src/commands/help.js');
  registered = [];
  const dir = path.join(process.cwd(), 'src/commands');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = await import(path.join(dir, file));
    if (!mod.data) continue;
    const json = mod.data.toJSON();
    registered.push({ name: json.name, type: json.type ?? 1 });
  }
});

beforeEach(() => {
  if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('member');
});

/** Everything the help card says, as one string */
async function helpText(userId) {
  const i = discord.command(userId, 'eggshen-help');
  await help.execute(i);
  expect(discord.violations).toEqual([]);
  return i.replyMessage.text;
}

/** Every `/command` named in some text (a slash starting a word, not a URL's) */
const named = (text) => new Set([...text.matchAll(/(?:^|[\s`*(])\/([a-z][a-z0-9-]*)/gm)].map(m => m[1]));

describe('/eggshen-help', () => {
  test('an admin sees every registered command, slash and right-click', async () => {
    const text = await helpText('admin');
    const mentioned = named(text);

    const slash = registered.filter(c => c.type === 1).map(c => c.name);
    expect(slash.length).toBeGreaterThan(30); // really read src/commands
    expect(slash.filter(name => !mentioned.has(name))).toEqual([]);

    // Right-click (context menu) commands have no slash: listed by name
    const menus = registered.filter(c => c.type !== 1).map(c => c.name);
    expect(menus.filter(name => !text.includes(name))).toEqual([]);
  });

  test('/watchlist is listed for a member, and follows its command switch', async () => {
    expect(named(await helpText('member')).has('watchlist')).toBe(true);

    await updateCommandPermission(GUILD, 'watchlist', false);
    expect(named(await helpText('member')).has('watchlist')).toBe(false);
    // An admin can still use it, so still sees it
    expect(named(await helpText('admin')).has('watchlist')).toBe(true);
  });
});
