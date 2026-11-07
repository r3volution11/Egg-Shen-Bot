/**
 * Whitelist mode: only listed users, and members holding a listed role, may
 * use commands.
 *
 * With users listed and no roles, a member who wasn't listed was let in:
 * rateLimiter.js refused only when roles were listed (and the member held
 * none) or when nobody at all was listed, and the remaining case — users
 * listed, roles not, this member not among them — fell through every branch.
 * A server that whitelisted three people by name was open to everyone.
 *
 * Driven through the real command dispatcher with the fake Discord, for a
 * cached member and for the raw API member discord.js passes on when it
 * hasn't cached the guild. The stub command records who it actually ran for.
 *
 * Run with: npm test -- tests/whitelist-mode.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { dispatchCommand } from '../src/handlers/commandDispatch.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';

const USERS_ONLY = '⏱️ 🔒 This server is in whitelist mode. Only approved users can use bot commands.';
const USERS_AND_ROLES = '⏱️ 🔒 This server is in whitelist mode. Only approved users and roles can use bot commands.';

let guildCounter = 0;
let discord;

/**
 * A fresh guild per test: the rate limiter keeps per-guild windows in
 * memory, so a reused one would let an earlier test's commands decide this
 * one's answers.
 */
async function guildWithWhitelist({ allowedUsers = [], allowedRoles = [] }, uncachedMember) {
  const guild = `whitelist-mode-guild-${++guildCounter}`;
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${guild}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const config = await loadGuildConfig(guild);
  config.moderation.enabled = true;
  config.moderation.whitelist = { enabled: true, allowedUsers, allowedRoles };
  await saveGuildConfig(guild, config);

  discord = new FakeDiscord({ guildId: guild });
  discord.addUser('listed', { roles: ['role-other'], uncachedMember });
  discord.addUser('regular', { roles: ['role-regulars'], uncachedMember });
  discord.addUser('stranger', { roles: ['role-other'], uncachedMember });
  // ManageMessages: a moderator to the rate limiter, which bypasses it
  discord.addUser('janitor', { permissions: ['ManageMessages'], uncachedMember });
}

/** Run a stub command as each user in turn: who it ran for, and what each was told */
async function runAs(...users) {
  const ran = [];
  const execute = async (i) => { ran.push(i.user.id); await i.reply({ content: `ran for ${i.user.id}`, ephemeral: true }); };
  const commands = new Map([['lookup', { execute }]]);
  const told = {};
  for (const user of users) {
    const i = discord.command(user, 'lookup');
    await dispatchCommand(i, commands);
    told[user] = i.replyMessage.content;
  }
  expect(discord.violations).toEqual([]);
  return { ran, told };
}

beforeEach(() => {
  jest.restoreAllMocks();
  // The logger prints every command it records
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe.each([['a cached', false], ['an uncached', true]])('whitelist mode, %s member', (shape, uncached) => {
  test('users listed, no roles: the listed user runs; anyone else is refused', async () => {
    await guildWithWhitelist({ allowedUsers: ['listed'] }, uncached);

    const { ran, told } = await runAs('listed', 'regular', 'stranger');

    expect(ran).toEqual(['listed']);
    expect(told.regular).toBe(USERS_ONLY);
    expect(told.stranger).toBe(USERS_ONLY);
  });

  test('roles listed, no users: a member with the role runs; one without is refused', async () => {
    await guildWithWhitelist({ allowedRoles: ['role-regulars'] }, uncached);

    const { ran, told } = await runAs('regular', 'stranger');

    expect(ran).toEqual(['regular']);
    expect(told.stranger).toBe(USERS_AND_ROLES);
  });

  test('both listed: a listed user without the role runs, so does a role holder; neither is refused', async () => {
    await guildWithWhitelist({ allowedUsers: ['listed'], allowedRoles: ['role-regulars'] }, uncached);

    const { ran, told } = await runAs('listed', 'regular', 'stranger');

    expect(ran).toEqual(['listed', 'regular']);
    expect(told.stranger).toBe(USERS_AND_ROLES);
  });

  test('nobody listed: every member is refused', async () => {
    await guildWithWhitelist({}, uncached);

    const { ran, told } = await runAs('regular', 'stranger');

    expect(ran).toEqual([]);
    expect(told.regular).toBe(USERS_ONLY);
  });

  test('a moderator is let in without being listed (the rate limiter\'s moderator bypass)', async () => {
    await guildWithWhitelist({ allowedUsers: ['listed'] }, uncached);

    const { ran } = await runAs('janitor');

    expect(ran).toEqual(['janitor']);
  });
});

// ── 2.75.1: whitelist mode and cooldowns don't need rate limiting ────────
//
// Both sat behind the rate-limiting switch: with rate limiting off, the
// limiter returned before reading them, so whitelist mode and every manual
// cooldown silently stopped while /eggshen-config-moderation still showed
// them on. And admins and moderators passed the whitelist only through
// moderator bypass: with bypass off, an admin who wasn't listed was refused
// every command, the one that turns whitelist mode off included — though
// the whitelist-toggle reply says "Administrators and moderators are always
// allowed". Doug's decision (2026-11-07): both work whether rate limiting is
// on or off, admins and moderators always pass the whitelist, and they still
// follow moderator bypass for the rate limit itself.

describe.each([['a cached', false], ['an uncached', true]])('2.75.1: moderation without rate limiting, %s member', (shape, uncached) => {
  let moderation;
  let watchParty;
  beforeAll(async () => {
    moderation = await import('../src/commands/eggshen-config-moderation.js');
    watchParty = await import('../src/commands/eggshen-config-watch-party.js');
  });

  /** A fresh guild with moderation on and `edit` applied; the cast below */
  async function guild(edit) {
    const id = `whitelist-mode-guild-${++guildCounter}`;
    const file = path.join(process.env.GUILD_CONFIGS_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    const config = await loadGuildConfig(id);
    config.moderation.enabled = true;
    edit(config);
    await saveGuildConfig(id, config);
    discord = new FakeDiscord({ guildId: id });
    discord.addUser('listed', { roles: ['role-other'], uncachedMember: uncached });
    discord.addUser('stranger', { roles: ['role-other'], uncachedMember: uncached });
    discord.addUser('boss', { admin: true, uncachedMember: uncached });
    // Timeout Members only: enough for /eggshen-config-moderation (isAdmin)
    discord.addUser('timeout-mod', { permissions: ['ModerateMembers'], uncachedMember: uncached });
    return id;
  }

  /** The stub command plus the real config commands, through the real dispatcher */
  async function run(user, name = 'lookup', opts = {}) {
    const ran = [];
    const commands = new Map([
      ['lookup', { execute: async (i) => { ran.push(i.user.id); await i.reply({ content: `ran for ${i.user.id}`, ephemeral: true }); } }],
      ['eggshen-config-moderation', moderation],
      ['eggshen-config-watch-party', watchParty],
    ]);
    const i = discord.command(user, name, opts);
    await dispatchCommand(i, commands);
    expect(discord.violations).toEqual([]);
    return { ran: ran.length > 0, text: i.replyMessage.content };
  }

  test('rate limiting off, whitelist on: the unlisted member is still refused, the listed one runs', async () => {
    await guild((c) => {
      c.rateLimits.enabled = false;
      c.moderation.whitelist = { enabled: true, allowedUsers: ['listed'], allowedRoles: [] };
    });

    expect(await run('stranger')).toEqual({ ran: false, text: USERS_ONLY });
    expect(await run('listed')).toEqual({ ran: true, text: 'ran for listed' });
    // Rate limiting really is off: the listed member runs again at once
    expect(await run('listed')).toEqual({ ran: true, text: 'ran for listed' });
  });

  test('an unlisted admin and a Timeout Members moderator, moderator bypass off: both let in but still rate limited, and the moderator turns whitelist mode off', async () => {
    const id = await guild((c) => {
      c.rateLimits.bypassForModerators = false;
      c.moderation.whitelist = { enabled: true, allowedUsers: ['listed'], allowedRoles: [] };
    });

    expect(await run('timeout-mod')).toEqual({ ran: true, text: 'ran for timeout-mod' });
    expect(await run('boss')).toEqual({ ran: true, text: 'ran for boss' });
    // Bypass off: the rate limit itself still holds them (1 per 20 seconds)
    expect(await run('boss')).toMatchObject({ ran: false, text: expect.stringMatching(/^⏱️ You're using commands too quickly!/) });

    // The command that turns whitelist mode off, run by an unlisted moderator
    const off = await run('timeout-mod', 'eggshen-config-moderation', { group: 'moderation', subcommand: 'whitelist-toggle', options: { enabled: false } });
    expect(off.text).toBe('✅ Whitelist mode has been **disabled**.\n\nEveryone can use bot commands again, within the rate limits.');
    expect((await loadGuildConfig(id)).moderation.whitelist.enabled).toBe(false);
    expect(await run('stranger')).toEqual({ ran: true, text: 'ran for stranger' });
  });

  test('rate limiting off: a manual cooldown, applied through the real command, still holds — and lifts when removed', async () => {
    await guild((c) => { c.rateLimits.enabled = false; });
    const target = discord.who('stranger').user;

    const applied = await run('boss', 'eggshen-config-moderation', { group: 'moderation', subcommand: 'user-cooldown', options: { user: target, duration: 30, reason: 'Spamming' } });
    expect(applied.text).toMatch(/^🛑 Applied temporary cooldown to/);

    expect(await run('stranger')).toEqual({ ran: false, text: '⏱️ 🛑 You have been temporarily restricted from using commands.\n**Reason:** Spamming\n**Time remaining:** 30 minutes' });

    await run('boss', 'eggshen-config-moderation', { group: 'moderation', subcommand: 'user-cooldown-remove', options: { user: target } });
    expect(await run('stranger')).toEqual({ ran: true, text: 'ran for stranger' });
  });

  test('a cooldown on a moderator follows moderator bypass, rate limiting on or off', async () => {
    await guild((c) => { c.rateLimits.enabled = false; });
    const target = discord.who('timeout-mod').user;
    await run('boss', 'eggshen-config-moderation', { group: 'moderation', subcommand: 'user-cooldown', options: { user: target, duration: 5, reason: 'Testing' } });

    // Bypass on (the default): they skip it
    expect(await run('timeout-mod')).toEqual({ ran: true, text: 'ran for timeout-mod' });
    // Bypass off: it holds them
    const bypass = await run('boss', 'eggshen-config-watch-party', { group: 'rate-limit', subcommand: 'bypass', options: { enabled: false } });
    expect(bypass.text).toBe('❌ Admins and moderators **can no longer** skip rate limits and manual cooldowns. Whitelist mode always lets them in.');
    expect(await run('timeout-mod')).toMatchObject({ ran: false, text: expect.stringMatching(/^⏱️ 🛑 You have been temporarily restricted/) });
  });

  test('the replies say what now happens: rate limiting off keeps whitelist mode and cooldowns; whitelist off with rate limiting off', async () => {
    await guild(() => {});
    const rl = await run('boss', 'eggshen-config-watch-party', { group: 'rate-limit', subcommand: 'toggle', options: { enabled: false } });
    expect(rl.text).toBe('❌ Rate limiting has been **disabled** for this server.\n\nAll users can now use commands without rate limiting. Whitelist mode and manual cooldowns still apply: they\'re moderation features, with their own switch.');

    const on = await run('boss', 'eggshen-config-moderation', { group: 'moderation', subcommand: 'whitelist-toggle', options: { enabled: true } });
    expect(on.text).toContain('Administrators and moderators are always allowed.');
    const off = await run('boss', 'eggshen-config-moderation', { group: 'moderation', subcommand: 'whitelist-toggle', options: { enabled: false } });
    expect(off.text).toBe('✅ Whitelist mode has been **disabled**.\n\nEveryone can use bot commands again.');
  });
});
