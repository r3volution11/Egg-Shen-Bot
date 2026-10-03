/**
 * /doom: deal someone, a role, or @everyone a horror-movie fate. Built like
 * /foodfight (tests/foodfight.test.js covers the shared target rules too):
 * members are pinged; a role or @everyone appears in the line but notifies
 * no one. Driven through the real command with the fake Discord
 * (tests/harness/fakeDiscord.js); what's checked is the message and the
 * exact allowedMentions sent to Discord.
 *
 * Run with: npm test -- tests/doom.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { resetPlayLimits, deleteScores } from '../src/utils/gameScores.js';

let doom;
let eggshenConfig;

beforeAll(async () => {
  doom = await import('../src/commands/doom.js');
  eggshenConfig = await import('../src/commands/eggshen-config.js');
});

const GUILD = 'doom-guild';
let discord;
let friend;

beforeEach(() => {
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // /doom is a game now: each test starts with no cooldowns and no scores
  resetPlayLimits();
  deleteScores(GUILD);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('doomer');
  friend = discord.addUser('friend');
});

afterEach(() => jest.restoreAllMocks());

const asMember = (user) => ({ user, member: discord.who(user.id).member });
const ROLE = { role: { id: 'role-campers', name: 'Camp Counselors' } };
const EVERYONE = () => ({ role: { id: GUILD, name: '@everyone' } });
const fill = (line, user = 'doomer', target = '<@friend>') =>
  (line.text ?? line).replace(/{user}/g, `<@${user}>`).replace(/{target}/g, target);

/** Run a command; returns { message, payload } — what was posted and what was sent */
async function run(command, name, userId, { subcommand, group = null, options = {} }) {
  const i = discord.command(userId, name, { subcommand, group, options });
  let payload = null;
  const reply = i.reply.bind(i);
  i.reply = async (p) => { payload = p; return reply(p); };
  await command.execute(i);
  return { message: i.replyMessage, payload };
}

/** The line itself; the points line follows it */
const said = (message) => message.content.split('\n')[0];

const fate = (target, trope, userId = 'doomer') =>
  run(doom, 'doom', userId, { subcommand: 'fate', options: { target, ...(trope ? { trope } : {}) } });
const lines = (sub, userId, options) => run(doom, 'doom', userId, { subcommand: sub, group: 'lines', options });

describe('/doom fate', () => {
  test('at a member: names both, pings both, and nothing else', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { message, payload } = await fate(asMember(friend), 'zombie');
    expect(message.ephemeralFor).toBeNull(); // public
    expect(said(message)).toBe(fill(doom.DEFAULT_DOOM_LINES.zombie[0]));
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['doomer', 'friend'] });
  });

  test('at a role: shows the role, pings only the user', async () => {
    const { message, payload } = await fate(ROLE, 'slasher');
    expect(message.content).toContain('<@&role-campers>');
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['doomer'] });
  });

  test('at @everyone: says @everyone, pings only the user', async () => {
    const { message, payload } = await fate(EVERYONE(), 'cursed-tape');
    expect(message.content).toContain('@everyone');
    expect(message.content).not.toContain(`<@&${GUILD}>`);
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['doomer'] });
  });

  test('at yourself: one ping, not two', async () => {
    const { payload } = await fate(asMember(discord.who('doomer').user), 'ouija');
    expect(payload.allowedMentions.users).toEqual(['doomer']);
  });

  test('at a bot: refused privately, nothing posted', async () => {
    const before = discord.channel.posted.length;
    const { message } = await fate({ user: { id: 'other-bot', username: 'Other', bot: true } }, 'vampire');
    expect(message.ephemeralFor).toBe('doomer');
    expect(message.content).toMatch(/already undead/);
    expect(discord.channel.posted.length).toBe(before);
  });

  test('the trope chosen decides the line; no trope lets fate pick one', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(said((await fate(asMember(friend), 'monkey-paw')).message)).toBe(fill(doom.DEFAULT_DOOM_LINES['monkey-paw'].at(-1)));
    resetPlayLimits(); // the same player again, inside the cooldown
    const lastTrope = doom.TROPES.at(-1).value;
    expect(said((await fate(asMember(friend))).message)).toBe(fill(doom.DEFAULT_DOOM_LINES[lastTrope].at(-1)));
  });

  test('every built-in line names both the user and the target; every trope has lines', () => {
    for (const [trope, list] of Object.entries(doom.DEFAULT_DOOM_LINES)) {
      for (const { text } of list) {
        expect(`${trope}: ${text.includes('{user}') && text.includes('{target}')}`).toBe(`${trope}: true`);
      }
    }
    expect(doom.TROPES.every(t => doom.DEFAULT_DOOM_LINES[t.value]?.length >= 5)).toBe(true);
  });

  test('`fate` is listed first: Discord sorts subcommands alphabetically', () => {
    // /foodfight's `lines` entries sort ahead of `throw`; `fate` comes before `lines`
    const names = doom.data.toJSON().options.map(o => o.name);
    expect([...names].sort()[0]).toBe('fate');
  });
});

describe('/doom lines (this server\'s own)', () => {
  test('an added line is used by the next fate, and can be removed', async () => {
    await lines('add', 'admin', { trope: 'zombie', outcome: 'doomed', line: '{user} serves {target} brain casserole!' });
    jest.spyOn(Math, 'random').mockReturnValue(0); // custom lines come first
    expect(said((await fate(asMember(friend), 'zombie')).message)).toBe('<@doomer> serves <@friend> brain casserole!');

    const listed = await lines('list', 'admin', { trope: 'zombie' });
    expect(listed.message.content).toContain('1. [doomed] {user} serves {target} brain casserole!');

    await lines('remove', 'admin', { trope: 'zombie', number: 1 });
    resetPlayLimits(); // the same player again, inside the cooldown
    expect(said((await fate(asMember(friend), 'zombie')).message)).toBe(fill(doom.DEFAULT_DOOM_LINES.zombie[0]));
  });

  test('a line without both placeholders is refused', async () => {
    const r = await lines('add', 'admin', { trope: 'zombie', outcome: 'doomed', line: 'Braaaains!' });
    expect(r.message.content).toMatch(/needs both/);
    expect((await lines('list', 'admin', { trope: 'zombie' })).message.content).not.toContain('Braaaains!');
  });

  test('members can deal fates but not change the lines', async () => {
    const r = await lines('add', 'doomer', { trope: 'zombie', outcome: 'doomed', line: '{user} bites {target}' });
    expect(r.message.content).toMatch(/Only administrators and moderators/);
  });
});

describe('switched off with /eggshen-config commands toggle', () => {
  test('doom off: members are refused, and the reply names the command', async () => {
    const toggled = await run(eggshenConfig, 'eggshen-config', 'admin', { subcommand: 'toggle', group: 'commands', options: { setting: 'doom', enabled: false } });
    expect(toggled.message.content).toContain('/doom command');
    const r = await fate(asMember(friend), 'zombie');
    expect(r.message.ephemeralFor).toBe('doomer');
    expect(r.message.content).toMatch(/turned off/);
  });
});
