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

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
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
