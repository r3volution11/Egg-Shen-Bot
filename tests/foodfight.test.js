/**
 * /foodfight, and the targets it shares with /potion: a member, a role, or
 * @everyone. Members are pinged; a role or @everyone appears in the line but
 * notifies no one (Doug's call, 2026-10-02). Driven through the real
 * commands with the fake Discord (tests/harness/fakeDiscord.js); what's
 * checked is the message and the exact allowedMentions sent to Discord.
 *
 * Run with: npm test -- tests/foodfight.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';

let foodfight;
let potion;
let eggshenConfig;

beforeAll(async () => {
  foodfight = await import('../src/commands/foodfight.js');
  potion = await import('../src/commands/potion.js');
  eggshenConfig = await import('../src/commands/eggshen-config.js');
});

const GUILD = 'foodfight-guild';
let discord;
let friend;

beforeEach(() => {
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('thrower');
  friend = discord.addUser('friend');
});

afterEach(() => jest.restoreAllMocks());

const asMember = (user) => ({ user, member: discord.who(user.id).member });
const ROLE = { role: { id: 'role-mods', name: 'Mods' } };
const EVERYONE = () => ({ role: { id: GUILD, name: '@everyone' } });

/** Run a command; returns { message, payload } — what was posted and what was sent */
async function run(command, userId, { subcommand, group = null, options = {} }) {
  const i = discord.command(userId, command === foodfight ? 'foodfight' : command === potion ? 'potion' : 'eggshen-config', { subcommand, group, options });
  let payload = null;
  const reply = i.reply.bind(i);
  i.reply = async (p) => { payload = p; return reply(p); };
  await command.execute(i);
  return { message: i.replyMessage, payload, interaction: i };
}

const throwAt = (target, food, userId = 'thrower') =>
  run(foodfight, userId, { subcommand: 'throw', options: { target, ...(food ? { food } : {}) } });

describe('/foodfight throw', () => {
  test('at a member: names both, pings both, and nothing else', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { message, payload } = await throwAt(asMember(friend), 'pie');
    expect(message.ephemeralFor).toBeNull(); // public
    expect(message.content).toBe(foodfight.DEFAULT_FOODFIGHT_LINES.pie[0]
      .replace(/{thrower}/g, '<@thrower>').replace(/{target}/g, '<@friend>'));
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['thrower', 'friend'] });
  });

  test('at a role: shows the role, pings only the thrower', async () => {
    const { message, payload } = await throwAt(ROLE, 'pizza');
    expect(message.content).toContain('<@&role-mods>');
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['thrower'] });
  });

  test('at @everyone: says @everyone, pings only the thrower', async () => {
    const { message, payload } = await throwAt(EVERYONE(), 'taco');
    expect(message.content).toContain('@everyone');
    expect(message.content).not.toContain(`<@&${GUILD}>`);
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['thrower'] });
  });

  test('at yourself: one ping, not two', async () => {
    const { payload } = await throwAt(asMember(discord.who('thrower').user), 'jello');
    expect(payload.allowedMentions.users).toEqual(['thrower']);
  });

  test('at a bot: refused privately, nothing posted', async () => {
    const before = discord.channel.posted.length;
    const { message } = await throwAt({ user: { id: 'other-bot', username: 'Other', bot: true } }, 'pie');
    expect(message.ephemeralFor).toBe('thrower');
    expect(message.content).toMatch(/Bots have excellent reflexes/);
    expect(discord.channel.posted.length).toBe(before);
  });

  test('the food chosen decides the line; no food picks one', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const chosen = await throwAt(asMember(friend), 'meatloaf');
    expect(chosen.message.content).toBe(foodfight.DEFAULT_FOODFIGHT_LINES.meatloaf.at(-1)
      .replace(/{thrower}/g, '<@thrower>').replace(/{target}/g, '<@friend>'));
    // Unchosen: the last food on the menu, its last line
    const random = await throwAt(asMember(friend));
    const lastFood = foodfight.FOODS.at(-1).value;
    expect(random.message.content).toBe(foodfight.DEFAULT_FOODFIGHT_LINES[lastFood].at(-1)
      .replace(/{thrower}/g, '<@thrower>').replace(/{target}/g, '<@friend>'));
  });

  test('every built-in line names both the thrower and the target', () => {
    for (const [food, lines] of Object.entries(foodfight.DEFAULT_FOODFIGHT_LINES)) {
      for (const line of lines) {
        expect(`${food}: ${line.includes('{thrower}') && line.includes('{target}')}`).toBe(`${food}: true`);
      }
    }
    expect(foodfight.FOODS.every(f => foodfight.DEFAULT_FOODFIGHT_LINES[f.value]?.length >= 5)).toBe(true);
  });
});

describe('/foodfight lines (this server\'s own)', () => {
  const lines = (sub, userId, options) => run(foodfight, userId, { subcommand: sub, group: 'lines', options });

  test('an added line is used by the next throw, and can be removed', async () => {
    await lines('add', 'admin', { food: 'pie', line: '{thrower} hurls a key lime pie at {target}!' });
    jest.spyOn(Math, 'random').mockReturnValue(0); // custom lines come first
    expect((await throwAt(asMember(friend), 'pie')).message.content).toBe('<@thrower> hurls a key lime pie at <@friend>!');

    const listed = await lines('list', 'admin', { food: 'pie' });
    expect(listed.message.content).toContain('1. {thrower} hurls a key lime pie at {target}!');

    await lines('remove', 'admin', { food: 'pie', number: 1 });
    expect((await throwAt(asMember(friend), 'pie')).message.content).toBe(foodfight.DEFAULT_FOODFIGHT_LINES.pie[0]
      .replace(/{thrower}/g, '<@thrower>').replace(/{target}/g, '<@friend>'));
  });

  test('a line without both placeholders is refused', async () => {
    const r = await lines('add', 'admin', { food: 'pie', line: 'Pie everywhere!' });
    expect(r.message.content).toMatch(/needs both/);
    const listed = await lines('list', 'admin', { food: 'pie' });
    expect(listed.message.content).not.toContain('Pie everywhere!');
  });

  test('members can throw but not change the lines', async () => {
    const r = await lines('add', 'thrower', { food: 'pie', line: '{thrower} pies {target}' });
    expect(r.message.content).toMatch(/Only administrators and moderators/);
  });
});

describe('switched off with /eggshen-config commands toggle', () => {
  test('foodfight off: members are refused, and the reply names the command', async () => {
    const toggled = await run(eggshenConfig, 'admin', { subcommand: 'toggle', group: 'commands', options: { setting: 'foodfight', enabled: false } });
    expect(toggled.message.content).toContain('/foodfight command');
    const r = await throwAt(asMember(friend), 'pie');
    expect(r.message.ephemeralFor).toBe('thrower');
    expect(r.message.content).toMatch(/turned off/);
  });

  test('potion off: members are refused', async () => {
    await run(eggshenConfig, 'admin', { subcommand: 'toggle', group: 'commands', options: { setting: 'potion', enabled: false } });
    const r = await run(potion, 'thrower', { subcommand: 'give', options: { user: asMember(friend), type: 'health' } });
    expect(r.message.content).toMatch(/turned off/);
  });

  test('every toggle setting has a name in the reply (none says "undefined")', async () => {
    const setting = eggshenConfig.data.toJSON().options.find(o => o.name === 'commands').options.find(o => o.name === 'toggle').options.find(o => o.name === 'setting');
    for (const { value } of setting.choices) {
      const r = await run(eggshenConfig, 'admin', { subcommand: 'toggle', group: 'commands', options: { setting: value, enabled: true } });
      expect(r.message.content).not.toContain('undefined');
    }
  });
});

describe('/potion give: the same targets', () => {
  const give = (target) => run(potion, 'thrower', { subcommand: 'give', options: { user: target, type: 'love' } });

  test('a member is pinged; a role and @everyone are shown, not pinged', async () => {
    expect((await give(asMember(friend))).payload.allowedMentions).toEqual({ parse: [], users: ['thrower', 'friend'] });

    const role = await give(ROLE);
    expect(role.message.content).toContain('<@&role-mods>');
    expect(role.payload.allowedMentions).toEqual({ parse: [], users: ['thrower'] });

    const everyone = await give(EVERYONE());
    expect(everyone.message.content).toContain('@everyone');
    expect(everyone.payload.allowedMentions).toEqual({ parse: [], users: ['thrower'] });
  });

  test('the target option accepts members, roles and @everyone', () => {
    const give = potion.data.toJSON().options.find(o => o.name === 'give');
    expect(give.options.find(o => o.name === 'user').type).toBe(9); // Mentionable
  });

  test('responses list shows the default lines\' text, not [object Object]', async () => {
    const r = await run(potion, 'admin', { subcommand: 'list', group: 'responses', options: { type: 'health' } });
    expect(r.message.content).not.toContain('[object Object]');
    expect(r.message.content).toContain('Default Responses');
  });
});
