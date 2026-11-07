/**
 * /eggshen-config commands toggle on a server configured before the game
 * commands existed.
 *
 * There are no config migrations, so such a server's saved commandPermissions
 * has no `doom`, `foodfight` or `escape` key. The toggle used to validate the
 * setting against the SAVED keys, so it answered "Failed to update" for those
 * games on every older server — while working on a fresh one, which is the
 * only place anyone had tried it.
 *
 * Run with: npm test -- tests/command-permission-toggle.test.js
 */

import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { loadGuildConfig, updateCommandPermission, canUseCommand } from '../src/utils/guildConfig.js';

const GUILD = 'perm-toggle-guild';
let configCommand;
let discord;

beforeAll(async () => {
  configCommand = await import('../src/commands/eggshen-config.js');
});

const CONFIG_FILE = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);

/** A config as an older release wrote it: none of the later games' keys */
function writeLegacyConfig() {
  const file = CONFIG_FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    commandPermissions: { enabled: true, movie: true, tv: false, potion: true },
  }));
}

async function toggle(setting, enabled) {
  const i = discord.command('admin', 'eggshen-config', { group: 'commands', subcommand: 'toggle', options: { setting, enabled } });
  await configCommand.execute(i);
  return i.replyMessage;
}

beforeEach(() => {
  writeLegacyConfig();
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('sam', { nickname: 'Sam' });
});

describe('/eggshen-config commands toggle on an older server', () => {
  test.each(['doom', 'foodfight', 'rescue'])('%s can be switched off, and is stored', async (setting) => {
    // The file lacks the key (loading it now reads the default, true, in
    // its place: guildConfig.withDefaults)
    expect(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).commandPermissions).not.toHaveProperty(setting);
    expect((await loadGuildConfig(GUILD)).commandPermissions[setting]).toBe(true);

    const m = await toggle(setting, false);

    expect(m.content).toBe(`❌ **/${setting} command** has been disabled for regular users.`);
    const stored = (await loadGuildConfig(GUILD)).commandPermissions;
    expect(stored[setting]).toBe(false);
    // The rest of what the server had saved is untouched
    expect(stored).toMatchObject({ enabled: true, movie: true, tv: false, potion: true });
  });

  test.each([
    ['escape', '/escape command'],
    ['quote', '/quote command'],
    ['suggestQuote', '/suggest-quote command'],
  ])('%s is offered as a choice and switches its command', async (setting, label) => {
    // Their keys gated /escape, /quote and /suggest-quote from the start,
    // but the toggle never offered them
    const toggleJson = configCommand.data.toJSON().options
      .find(o => o.name === 'commands').options.find(o => o.name === 'toggle');
    const choices = toggleJson.options.find(o => o.name === 'setting').choices.map(c => c.value);
    expect(choices).toContain(setting);

    const m = await toggle(setting, false);
    expect(m.content).toBe(`❌ **${label}** has been disabled for regular users.`);
    expect(await canUseCommand(GUILD, discord.who('sam').member, setting)).toBe(false);
  });

  test('a member is then refused the command; the others stay open', async () => {
    await toggle('doom', false);
    const sam = discord.who('sam').member;
    expect(await canUseCommand(GUILD, sam, 'doom')).toBe(false);
    expect(await canUseCommand(GUILD, sam, 'foodfight')).toBe(true);
  });

  test('switching it back on stores true', async () => {
    await toggle('doom', false);
    await toggle('doom', true);
    expect((await loadGuildConfig(GUILD)).commandPermissions.doom).toBe(true);
  });

  test('escape, a key the picker does not list yet, still toggles', async () => {
    expect(await updateCommandPermission(GUILD, 'escape', false)).toBe(true);
    expect((await loadGuildConfig(GUILD)).commandPermissions.escape).toBe(false);
  });

  test('a made-up setting is still refused, and nothing is stored', async () => {
    expect(await updateCommandPermission(GUILD, 'nonsense', false)).toBe(false);
    expect(await updateCommandPermission(GUILD, '__proto__', false)).toBe(false);
    expect((await loadGuildConfig(GUILD)).commandPermissions).not.toHaveProperty('nonsense');
  });
});
