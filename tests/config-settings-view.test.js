/**
 * /eggshen-config settings view shows every command switch.
 *
 * It listed 8 of the 19 by hand — the master switch, /movie, /tv, /episode,
 * /survey, /soundtrack, /bracket and /watchlist — so a server that had
 * switched off /doom or /quote couldn't see that anywhere. Now it lists
 * every switch `commands toggle` offers, each read the way canUseCommand
 * enforces it, which is what the test checks: for each switch, what the
 * card says equals whether a plain member can actually use the command.
 *
 * Driven through the real command with the fake Discord, which rejects a
 * card over Discord's limits (1024 per field, 6000 per message) as Discord
 * would — checked with every custom emoji set and a long list of watch-party
 * channels, the two settings that grow the card.
 *
 * Run with: npm test -- tests/config-settings-view.test.js
 */

import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { loadGuildConfig, saveGuildConfig, canUseCommand } from '../src/utils/guildConfig.js';
import { embedTextLength } from '../src/utils/embedFit.js';

const GUILD = 'config-settings-view-guild';
const CONFIG_FILE = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
const FIELD = 'Command Permissions (for Regular Users)';

let configCommand;
let switches; // the toggle's own choices: [{ name, value }]
let discord;

beforeAll(async () => {
  configCommand = await import('../src/commands/eggshen-config.js');
  const group = configCommand.data.toJSON().options.find(o => o.name === 'commands');
  const toggle = group.options.find(o => o.name === 'toggle');
  switches = toggle.options.find(o => o.name === 'setting').choices;
});

beforeEach(() => {
  if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('member');
});

async function view() {
  const i = discord.command('admin', 'eggshen-config', { group: 'settings', subcommand: 'view' });
  await configCommand.execute(i);
  expect(discord.violations).toEqual([]);
  return i.replyMessage.embeds[0].toJSON();
}

/** The switches field as { label: on } */
function shown(embed) {
  const field = embed.fields.find(f => f.name === FIELD);
  return Object.fromEntries(field.value.split('\n').map(line => {
    const m = line.match(/^(✅|❌) \*\*(.+?):\*\* (Enabled|Disabled)$/);
    if (!m) throw new Error(`unexpected line: ${line}`);
    expect(m[1] === '✅').toBe(m[3] === 'Enabled');
    return [m[2], m[1] === '✅'];
  }));
}

/** The label a switch is shown under: its command, or "All Commands" for the master */
const label = (key) => ({ enabled: 'All Commands', suggestQuote: '/suggest-quote', magic: '/six-demon-bag' }[key] || `/${key}`);

describe('/eggshen-config settings view — command switches', () => {
  test('lists every switch, all 20, and every one the toggle offers', async () => {
    const defaults = Object.keys((await loadGuildConfig('settings-view-defaults-never-saved')).commandPermissions);
    expect(defaults).toHaveLength(20); // 2.76.0: + magic (/six-demon-bag)
    // The toggle offers exactly the switches the config has
    expect(switches.map(c => c.value).sort()).toEqual([...defaults].sort());

    const lines = shown(await view());
    expect(Object.keys(lines)).toHaveLength(20);
    expect(Object.keys(lines).sort()).toEqual(defaults.map(label).sort());
    expect(Object.values(lines).every(Boolean)).toBe(true); // all on by default
  });

  test('each switch shows what canUseCommand enforces: switched off, left on, or saved before the switch existed', async () => {
    const config = await loadGuildConfig(GUILD);
    for (const key of ['doom', 'quote', 'suggestQuote', 'escape', 'movie']) config.commandPermissions[key] = false;
    // A server configured before /siege, /rescue and /six-demon-bag existed has no such keys
    delete config.commandPermissions.siege;
    delete config.commandPermissions.rescue;
    delete config.commandPermissions.magic;
    await saveGuildConfig(GUILD, config);

    const lines = shown(await view());
    const { member } = discord.who('member');
    for (const key of switches.map(c => c.value).filter(k => k !== 'enabled')) {
      expect([key, lines[label(key)]]).toEqual([key, await canUseCommand(GUILD, member, key)]);
    }
    expect(lines['/doom']).toBe(false);
    expect(lines['/suggest-quote']).toBe(false);
    expect(lines['/siege']).toBe(true);
    expect(lines['/six-demon-bag']).toBe(true);
    expect(lines['/potion']).toBe(true);
  });

  test('the master switch off shows as off, and members are shut out of everything', async () => {
    const config = await loadGuildConfig(GUILD);
    config.commandPermissions.enabled = false;
    await saveGuildConfig(GUILD, config);

    const lines = shown(await view());
    expect(lines['All Commands']).toBe(false);
    expect(await canUseCommand(GUILD, discord.who('member').member, 'potion')).toBe(false);
  });

  test('stays inside Discord\'s limits with every emoji set and twenty watch-party channels', async () => {
    const config = await loadGuildConfig(GUILD);
    for (const key of Object.keys(config.emojis)) config.emojis[key] = `<:${key}_rating_logo_custom:123456789012345678>`;
    config.watchPartyChannels = Array.from({ length: 20 }, (_, n) => `12345678901234${String(n).padStart(5, '0')}`);
    await saveGuildConfig(GUILD, config);

    const embed = await view(); // view() fails on any violation the fake recorded
    const field = embed.fields.find(f => f.name === FIELD);
    expect(field.value.length).toBeLessThanOrEqual(1024);
    expect(embedTextLength(embed)).toBeLessThanOrEqual(6000);
  });
});
