/**
 * Every permission check must read a member discord.js hasn't cached.
 *
 * When the guild isn't in discord.js's cache, `interaction.member` is the
 * raw APIInteractionGuildMember Discord sent, not a GuildMember: its
 * `permissions` is a bitfield STRING with no `.has()`, its `roles` an array
 * of ids, and it has no `id`. The rate limiter called
 * `member.permissions.has(...)` before every command, so for those members
 * every command failed — production logged "Command execution error:
 * TypeError: member.permissions.has is not a function" five times in two
 * hundred lines (2026-11).
 *
 * Each test runs twice: for a cached member, which must be answered exactly
 * as before, and for the raw API member (tests/harness/fakeDiscord.js
 * apiMember). An admin must still be an admin, a moderator a moderator, and
 * a plain member neither.
 *
 * src/index.js's two event-request pop-up gates use the same memberHas as
 * the button gates below but can't be loaded here: importing index.js logs a
 * bot in.
 *
 * Run with: npm test -- tests/uncached-member-permissions.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { dispatchCommand } from '../src/handlers/commandDispatch.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, isTrueAdmin, isModerator, canUseCommand } from '../src/utils/guildConfig.js';
import { canManagePoll } from '../src/utils/pollManager.js';
import { permissionsOf, memberRoleIds, memberId } from '../src/utils/memberPermissions.js';

const GENERIC_ERROR = 'There was an error executing this command!';
const SHAPES = [['a cached', false], ['an uncached', true]];

let guildCounter = 0;
let discord;
let GUILD;

/**
 * A fresh guild per test: the rate limiter keeps per-guild state in memory
 * (per-user windows and a guild-wide count), so reusing one would let an
 * earlier test's commands decide a later test's answer.
 */
async function freshGuild(shapeUncached, edit = () => {}) {
  GUILD = `uncached-perm-guild-${++guildCounter}`;
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const config = await loadGuildConfig(GUILD);
  edit(config);
  await saveGuildConfig(GUILD, config);

  discord = new FakeDiscord({ guildId: GUILD });
  const uncachedMember = shapeUncached;
  discord.addUser('admin', { admin: true, uncachedMember });
  // ModerateMembers: what isAdmin/isModerator and the tournament gates call a mod
  discord.addUser('mod', { permissions: ['ModerateMembers'], uncachedMember });
  // ManageMessages: a moderator to the rate limiter only
  discord.addUser('janitor', { permissions: ['ManageMessages'], uncachedMember });
  // ManageEvents: the event-request moderators
  discord.addUser('events', { permissions: ['ManageEvents'], uncachedMember });
  discord.addUser('regular', { roles: ['role-regulars'], uncachedMember });
  discord.addUser('stranger', { roles: ['role-other'], uncachedMember });
}

beforeEach(() => {
  jest.restoreAllMocks();
  // The logger prints every command it records
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

/** Everything this interaction said, as one string */
const said = (i) => i.responses.map(m => m.text).join('\n');

/** A stub command that records who it ran for */
function stubCommands() {
  const ran = [];
  const execute = async (i) => { ran.push(i.user.id); await i.reply({ content: `ran for ${i.user.id}`, ephemeral: true }); };
  return { ran, commands: new Map([['lookup', { execute }]]) };
}

describe('the fake really builds both shapes', () => {
  test('an uncached member has a bitfield string and role ids, as Discord sends them', async () => {
    await freshGuild(true);
    const { member } = discord.who('mod');
    expect(typeof member.permissions).toBe('string');
    expect(typeof member.permissions.has).toBe('undefined');
    expect(BigInt(member.permissions)).toBe(PermissionFlagsBits.ModerateMembers);
    expect(member.id).toBeUndefined();
    expect(member.user.id).toBe('mod');
    expect(discord.who('regular').member.roles).toEqual(['role-regulars']);
  });
});

describe.each(SHAPES)('%s member through the real dispatcher: the rate limiter', (shape, uncached) => {
  test('a plain member runs a command once, then is limited (no moderator bypass)', async () => {
    await freshGuild(uncached);
    const { ran, commands } = stubCommands();

    const first = discord.command('regular', 'lookup');
    await dispatchCommand(first, commands);
    const second = discord.command('regular', 'lookup');
    await dispatchCommand(second, commands);

    expect(ran).toEqual(['regular']);
    expect(first.replyMessage.content).toBe('ran for regular');
    expect(second.replyMessage.content).toMatch(/You're using commands too quickly/);
    expect(second.replyMessage.ephemeralFor).toBe('regular');
    expect(discord.violations).toEqual([]);
  });

  test.each(['admin', 'janitor'])('%s bypasses the limit as a moderator: both commands run', async (who) => {
    await freshGuild(uncached);
    const { ran, commands } = stubCommands();

    const first = discord.command(who, 'lookup');
    await dispatchCommand(first, commands);
    const second = discord.command(who, 'lookup');
    await dispatchCommand(second, commands);

    expect(ran).toEqual([who, who]);
    expect(second.replyMessage.content).toBe(`ran for ${who}`);
    expect(discord.violations).toEqual([]);
  });

  test('whitelist mode: a member with an allowed role runs; one without is refused', async () => {
    await freshGuild(uncached, (config) => {
      config.moderation.enabled = true;
      config.moderation.whitelist = { enabled: true, allowedRoles: ['role-regulars'], allowedUsers: [] };
    });
    const { ran, commands } = stubCommands();

    const allowed = discord.command('regular', 'lookup');
    await dispatchCommand(allowed, commands);
    const refused = discord.command('stranger', 'lookup');
    await dispatchCommand(refused, commands);

    expect(ran).toEqual(['regular']);
    expect(allowed.replyMessage.content).toBe('ran for regular');
    expect(refused.replyMessage.content).toMatch(/whitelist mode/);
    expect(refused.replyMessage.content).not.toBe(GENERIC_ERROR);
  });
});

describe.each(SHAPES)('%s member through the real dispatcher: admin gates', (shape, uncached) => {
  let website;
  let bracket;
  let logs;
  beforeAll(async () => {
    website = await import('../src/commands/eggshen-config-website.js');
    bracket = await import('../src/commands/bracket.js');
    logs = await import('../src/commands/eggshen-logs.js');
  });

  // Rate limits off: these are about the commands' own gates, and must
  // fail on those alone if they can't read the member
  const noLimits = (config) => { config.rateLimits.enabled = false; };

  test.each(['admin', 'mod'])('isAdmin lets %s into /eggshen-config-website', async (who) => {
    await freshGuild(uncached, noLimits);
    const i = discord.command(who, 'eggshen-config-website', { subcommand: 'view' });
    await dispatchCommand(i, new Map([['eggshen-config-website', website]]));

    expect(i.replyMessage.embeds[0].title).toContain('Website Configuration');
  });

  test('isAdmin keeps a plain member out of /eggshen-config-website', async () => {
    await freshGuild(uncached, noLimits);
    const i = discord.command('regular', 'eggshen-config-website', { subcommand: 'view' });
    await dispatchCommand(i, new Map([['eggshen-config-website', website]]));

    expect(i.replyMessage.content).toMatch(/You need Administrator, Manage Server, or Moderator permissions/);
    expect(i.replyMessage.embeds ?? []).toEqual([]);
  });

  test('/bracket switched off for members: an admin still gets in (canUseCommand); a member does not', async () => {
    await freshGuild(uncached, (config) => { noLimits(config); config.commandPermissions.bracket = false; });
    const commands = new Map([['bracket', bracket]]);

    const asAdmin = discord.command('admin', 'bracket', { subcommand: 'cancel' });
    await dispatchCommand(asAdmin, commands);
    const asMember = discord.command('regular', 'bracket', { subcommand: 'cancel' });
    await dispatchCommand(asMember, commands);

    // Past both gates to cancel itself, which finds nothing to cancel
    expect(said(asAdmin)).not.toMatch(/disabled for regular users|Only administrators and moderators/);
    expect(said(asAdmin)).not.toContain(GENERIC_ERROR);
    expect(said(asAdmin)).toContain('No tournament found');
    expect(asMember.replyMessage.content).toMatch(/currently disabled for regular users/);
  });

  test('/bracket cancel: a moderator passes the manager gate; a plain member is told why not', async () => {
    await freshGuild(uncached, noLimits);
    const commands = new Map([['bracket', bracket]]);

    const asMod = discord.command('mod', 'bracket', { subcommand: 'cancel' });
    await dispatchCommand(asMod, commands);
    const asMember = discord.command('regular', 'bracket', { subcommand: 'cancel' });
    await dispatchCommand(asMember, commands);

    expect(said(asMod)).not.toMatch(/Only administrators and moderators/);
    expect(said(asMod)).not.toContain(GENERIC_ERROR);
    expect(said(asMod)).toContain('No tournament found');
    expect(asMember.replyMessage.content).toBe('❌ Only administrators and moderators can manage tournaments.');
  });

  test('/eggshen-logs: an Administrator sees the log stats; a moderator does not', async () => {
    await freshGuild(uncached, noLimits);
    const commands = new Map([['eggshen-logs', logs]]);

    const asAdmin = discord.command('admin', 'eggshen-logs', { subcommand: 'stats' });
    await dispatchCommand(asAdmin, commands);
    const asMod = discord.command('mod', 'eggshen-logs', { subcommand: 'stats' });
    await dispatchCommand(asMod, commands);

    expect(said(asAdmin)).not.toMatch(/Only administrators can view bot logs/);
    expect(said(asAdmin)).not.toContain(GENERIC_ERROR);
    expect(said(asAdmin)).toContain('📊 Log Statistics');
    expect(asMod.replyMessage.content).toBe('❌ Only administrators can view bot logs.');
  });
});

describe.each(SHAPES)('%s member on public buttons', (shape, uncached) => {
  let handleButtonInteraction;
  beforeAll(async () => {
    ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  });

  beforeEach(async () => {
    await freshGuild(uncached);
    // No such request: a click that passes the permission gate is then told
    // it expired, which is how these tests see that it got past
    global.eventRequests = new Map();
  });

  /** A message the bot posted with these buttons on it */
  async function postButtons(customIds, embed = null) {
    const row = new ActionRowBuilder().addComponents(
      customIds.map(id => new ButtonBuilder().setCustomId(id).setLabel(id.slice(0, 20)).setStyle(ButtonStyle.Secondary)),
    );
    return discord.channel.send({ components: [row], ...(embed ? { embeds: [embed] } : {}) });
  }

  // Each event-request gate, and the refusal it gives
  const EVENT_GATES = [
    ['crop_event_req1', 'change an event request\'s image'],
    ['edit_event_req1', 'edit event requests'],
    ['approve_event_req1', 'approve/deny event requests'],
    ['deny_event_req1', 'approve/deny event requests'],
    ['confirm_event_channels_req1_full', 'approve event requests'],
  ];

  /**
   * One click on a fresh copy of the button; what the clicker was told.
   * Fresh, because confirm_event_channels_ answers by updating the message
   * it's on, buttons and all.
   */
  async function click(who, customId) {
    const message = await postButtons([customId]);
    const i = discord.button(who, message, customId);
    await handleButtonInteraction(i);
    return [said(i), i.edited.includes(message) ? message.content : ''].join('\n');
  }

  test.each(EVENT_GATES)('%s: a ManageEvents moderator passes; a plain member is refused', async (customId, refusal) => {
    const modSaw = await click('events', customId);
    const memberSaw = await click('regular', customId);

    expect(modSaw).toMatch(/expired or was already processed/);
    expect(modSaw).not.toMatch(/Only moderators and administrators/);
    expect(memberSaw).toContain(`Only moderators and administrators can ${refusal}.`);
    expect(discord.violations).toEqual([]);
  });

  test('Log to Watch History: a moderator who didn\'t start the timer gets the form; a plain member is refused', async () => {
    const customId = 'log_watched_chan1_starter';
    const message = await postButtons([customId], new EmbedBuilder().setDescription('**Alien**\nfinished'));

    const asMod = discord.button('mod', message, customId);
    await handleButtonInteraction(asMod);
    const asMember = discord.button('regular', message, customId);
    await handleButtonInteraction(asMember);

    expect(asMod.modal?.title).toBe('Log to Watch History');
    expect(asMember.modal).toBeUndefined();
    expect(asMember.replyMessage.content).toMatch(/Only the person who started the timer/);
    expect(discord.violations).toEqual([]);
  });
});

describe.each(SHAPES)('%s member: the guildConfig and survey checks', (shape, uncached) => {
  beforeEach(async () => { await freshGuild(uncached); });
  const m = (who) => discord.who(who).member;

  test('isAdmin, isTrueAdmin and isModerator tell admin, moderator and member apart', () => {
    expect([isAdmin(m('admin')), isTrueAdmin(m('admin')), isModerator(m('admin'))]).toEqual([true, true, false]);
    expect([isAdmin(m('mod')), isTrueAdmin(m('mod')), isModerator(m('mod'))]).toEqual([true, false, true]);
    expect([isAdmin(m('regular')), isTrueAdmin(m('regular')), isModerator(m('regular'))]).toEqual([false, false, false]);
  });

  test('canUseCommand: a switched-off command stays open to an admin only', async () => {
    const config = await loadGuildConfig(GUILD);
    config.commandPermissions.movie = false;
    await saveGuildConfig(GUILD, config);

    expect(await canUseCommand(GUILD, m('admin'), 'movie')).toBe(true);
    expect(await canUseCommand(GUILD, m('regular'), 'movie')).toBe(false);
  });

  test('canManagePoll: the admin and the poll\'s creator may; anyone else may not', () => {
    const poll = { creatorId: 'regular' };
    expect(canManagePoll(poll, m('admin'))).toBe(true);
    // The creator is matched by id, which the raw member keeps only on .user
    expect(canManagePoll(poll, m('regular'))).toBe(true);
    expect(canManagePoll(poll, m('stranger'))).toBe(false);
    expect(canManagePoll(poll, m('mod'))).toBe(false); // ModerateMembers isn't ManageGuild
  });
});

describe('memberPermissions helpers', () => {
  test('a cached member\'s own permissions object is used as is', () => {
    const perms = { has: () => true };
    expect(permissionsOf({ permissions: perms })).toBe(perms);
  });

  test('a bitfield string becomes a PermissionsBitField; Administrator implies every flag', () => {
    const perms = permissionsOf({ permissions: String(PermissionFlagsBits.Administrator) });
    expect(perms.has('BanMembers')).toBe(true);
    expect(permissionsOf({ permissions: '0' }).has('BanMembers')).toBe(false);
  });

  test('no member, or no bitfield, holds nothing', () => {
    expect(permissionsOf(null)).toBeNull();
    expect(permissionsOf({})).toBeNull();
    expect(permissionsOf({ permissions: 'not-a-number' })).toBeNull();
  });

  test('role ids and the user id, from either shape', () => {
    expect(memberRoleIds({ roles: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(memberRoleIds({ roles: { cache: new Map([['a', { id: 'a' }]]) } })).toEqual(['a']);
    expect(memberRoleIds(null)).toEqual([]);
    expect(memberId({ id: 'x', user: { id: 'y' } })).toBe('x');
    expect(memberId({ user: { id: 'y' } })).toBe('y');
  });
});
