/**
 * The games end to end: /foodfight, /doom, /rescue and /potion through the
 * real commands and the fake Discord (tests/harness/fakeDiscord.js), then
 * /scoreboard, the right-click Game card, /leaderboard and
 * /eggshen-config-games reading and changing what those plays stored.
 * What's checked is the posted text, the stored points, and every line of
 * the cards — not that "something was sent". The cards' layouts and limits
 * are covered on their own in tests/game-card.test.js and
 * tests/leaderboard-card.test.js.
 *
 * Lines are chosen by stubbing Math.random onto a line with the outcome
 * under test, found in the real line data, so a reshuffled data file
 * doesn't break the tests.
 *
 * Run with: npm test -- tests/game-commands.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { resetPlayLimits, deleteScores, loadScores, recordPlay, POINTS } from '../src/utils/gameScores.js';
import { saveGuildConfig, loadGuildConfig } from '../src/utils/guildConfig.js';
import { checkRateLimit } from '../src/utils/rateLimiter.js';
import { FOODFIGHT_LINES } from '../src/data/foodfightLines.js';
import { FOODFIGHT_FEED_LINES } from '../src/data/foodfightFeedLines.js';
import { DOOM_LINES } from '../src/data/doomLines.js';
import { RESCUE_LINES, DOOM_BLOCKED_LINES } from '../src/data/rescueLines.js';
import { POTION_LINES } from '../src/data/potionLines.js';
import { periodLabel } from '../src/utils/gameBoards.js';

const commands = {};
beforeAll(async () => {
  for (const name of ['foodfight', 'doom', 'rescue', 'potion', 'scoreboard', 'game-card', 'leaderboard', 'eggshen-config-games', 'eggshen-config']) {
    commands[name] = await import(`../src/commands/${name}.js`);
  }
});

const GUILD = 'games-guild';
let discord;

beforeEach(async () => {
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  resetPlayLimits();
  deleteScores(GUILD);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('sam', { nickname: 'Sam', guildAvatar: 'https://cdn.example/sam-server.png' });
  discord.addUser('alex', { nickname: 'Alex' });
  discord.addUser('kim', { nickname: 'Kim' });
});

afterEach(() => jest.restoreAllMocks());

const member = (id) => ({ user: discord.who(id).user, member: discord.who(id).member });
const ROLE = { role: { id: 'role-mods', name: 'Mods' } };

async function run(name, userId, { subcommand = null, group = null, options = {} } = {}) {
  const i = discord.command(userId, name, { subcommand, group, options });
  await commands[name].execute(i);
  return i.replyMessage;
}

/** Make the next pick() land on the first line in `list` with this outcome */
function stubOutcome(list, outcome) {
  const idx = list.findIndex(l => l.outcome === outcome);
  if (idx < 0) throw new Error(`no ${outcome} line`);
  jest.spyOn(Math, 'random').mockReturnValue((idx + 0.5) / list.length);
  return list[idx];
}

/** Every game card's footer: how to open anyone's */
const HINT = 'Anyone\'s card: right-click them → Apps → Game card';

const said = (message) => message.content.split('\n')[0];
const points = (message) => message.content.split('\n')[1];
const stored = (userId, game) => loadScores(GUILD).users[userId]?.games?.[game]?.all;

describe('playing', () => {
  test('a food fight hit: the line, then the points, and the points are stored', async () => {
    const line = stubOutcome(FOODFIGHT_LINES.pie, 'hit');
    const m = await run('foodfight', 'sam', { subcommand: 'throw', options: { target: member('alex'), food: 'pie' } });
    expect(m.ephemeralFor).toBeNull();
    expect(said(m)).toBe(line.text.replace(/{thrower}/g, '<@sam>').replace(/{target}/g, '<@alex>'));
    expect(points(m)).toBe('-# 🎯 Hit! Sam +3 (3 pts) · Alex −1');
    expect(stored('sam', 'foodfight').points).toBe(3);
    expect(stored('alex', 'foodfight').points).toBe(-1);
  });

  test('feeding: a spill costs the feeder and still feeds the target', async () => {
    stubOutcome(FOODFIGHT_FEED_LINES.taco, 'spill');
    const m = await run('foodfight', 'sam', { subcommand: 'feed', options: { target: member('alex'), food: 'taco' } });
    expect(said(m)).toContain('<@sam>');
    expect(points(m)).toBe('-# 💦 Spill! Sam −2 (−2 pts) · Alex +1');
  });

  test('a potion is scored by what it does: a harmful one that worked', async () => {
    stubOutcome(POTION_LINES.poison, 'worked');
    const m = await run('potion', 'sam', { subcommand: 'give', options: { user: member('alex'), type: 'poison' } });
    expect(points(m)).toBe('-# ☠️ It worked! Sam +2 (2 pts) · Alex −2');
  });

  test('at a role: only the player is scored, and the points line names no target', async () => {
    stubOutcome(DOOM_LINES.zombie, 'doomed');
    const m = await run('doom', 'sam', { subcommand: 'fate', options: { target: ROLE, trope: 'zombie' } });
    expect(points(m)).toBe('-# 💀 Doomed! Sam +3 (3 pts)');
    expect(Object.keys(loadScores(GUILD).users)).toEqual(['sam']);
  });
});

describe('rescue and shields', () => {
  test('a rescue shields the target; the next doom is blocked, scores nothing, and uses the shield up', async () => {
    stubOutcome(RESCUE_LINES['final-girl'], 'rescued');
    const rescued = await run('rescue', 'sam', { subcommand: 'attempt', options: { target: member('alex'), trope: 'final-girl' } });
    expect(points(rescued)).toMatch(/^-# 🛟 Rescued! Sam \+1 \(1 pts\) · Alex \+2 · 🛡️ Alex is shielded from \/doom until <t:\d+:t>$/);

    jest.spyOn(Math, 'random').mockReturnValue(0);
    const blocked = await run('doom', 'kim', { subcommand: 'fate', options: { target: member('alex'), trope: 'zombie' } });
    expect(said(blocked)).toBe(DOOM_BLOCKED_LINES[0].replace(/{user}/g, '<@kim>').replace(/{target}/g, '<@alex>'));
    expect(points(blocked)).toBe('-# 🛡️ Blocked! Alex was shielded by a rescue. No points; the shield is used up.');
    expect(stored('kim', 'doom').points).toBe(0);

    // Shield gone: the next doom lands (from someone off cooldown)
    stubOutcome(DOOM_LINES.zombie, 'doomed');
    const landed = await run('doom', 'admin', { subcommand: 'fate', options: { target: member('alex'), trope: 'zombie' } });
    expect(points(landed)).toMatch(/^-# 💀 Doomed!/);
  });

  test('you can doom yourself through your own shield', async () => {
    stubOutcome(RESCUE_LINES.garlic, 'rescued');
    await run('rescue', 'kim', { subcommand: 'attempt', options: { target: member('sam'), trope: 'garlic' } });
    stubOutcome(DOOM_LINES.ouija, 'doomed');
    const m = await run('doom', 'sam', { subcommand: 'fate', options: { target: member('sam'), trope: 'ouija' } });
    expect(points(m)).toMatch(/^-# 💀 Doomed!/);
  });

  test('rescuing yourself, or a bot, is refused and records nothing', async () => {
    const self = await run('rescue', 'sam', { subcommand: 'attempt', options: { target: member('sam') } });
    expect(self.ephemeralFor).toBe('sam');
    expect(self.content).toMatch(/Final Girls don't save themselves/);
    const bot = await run('rescue', 'sam', { subcommand: 'attempt', options: { target: { user: { id: 'b', username: 'B', bot: true } } } });
    expect(bot.ephemeralFor).toBe('sam');
    expect(loadScores(GUILD).users).toEqual({});
    // …and used no cooldown: a real rescue goes straight through
    const real = await run('rescue', 'sam', { subcommand: 'attempt', options: { target: member('alex') } });
    expect(real.ephemeralFor).toBeNull();
  });

  test('a server\'s own rescue line, with its outcome, is used and scored', async () => {
    await run('rescue', 'admin', { group: 'lines', subcommand: 'add', options: { trope: 'the-dog', outcome: 'sacrificed', line: '{user} throws {target} the dog. Good boy.' } });
    jest.spyOn(Math, 'random').mockReturnValue(0); // custom lines come first
    const m = await run('rescue', 'sam', { subcommand: 'attempt', options: { target: member('alex'), trope: 'the-dog' } });
    expect(said(m)).toBe('<@sam> throws <@alex> the dog. Good boy.');
    expect(points(m)).toMatch(/^-# 🕯️ Sacrificed! Sam −2 \(−2 pts\) · Alex \+3/);
    const list = await run('rescue', 'admin', { group: 'lines', subcommand: 'list', options: { trope: 'the-dog' } });
    expect(list.content).toContain('1. [sacrificed] {user} throws {target} the dog. Good boy.');
  });
});

describe('limits and where games are played', () => {
  test('the same game too soon is refused privately and records nothing', async () => {
    await run('doom', 'sam', { subcommand: 'fate', options: { target: member('alex') } });
    const again = await run('doom', 'sam', { subcommand: 'fate', options: { target: member('alex') } });
    expect(again.ephemeralFor).toBe('sam');
    expect(again.content).toMatch(/^⏳ Doom cooldown: \d+s/);
    expect(stored('sam', 'doom').plays).toBe(1);
    // A different game is fine
    const other = await run('foodfight', 'sam', { subcommand: 'throw', options: { target: member('alex') } });
    expect(other.ephemeralFor).toBeNull();
  });

  test('past the daily cap, plays still post, for no points', async () => {
    await saveGuildConfig(GUILD, { ...(await loadGuildConfig(GUILD)), games: { cooldownSeconds: 0, dailyScoredPlays: 1 } });
    stubOutcome(FOODFIGHT_LINES.pie, 'hit');
    await run('foodfight', 'sam', { subcommand: 'throw', options: { target: member('alex'), food: 'pie' } });
    const second = await run('foodfight', 'sam', { subcommand: 'throw', options: { target: member('alex'), food: 'pie' } });
    expect(second.ephemeralFor).toBeNull();
    expect(points(second)).toBe('-# Sam reached today\'s Food Fight scoring cap: just for fun now.');
    expect(stored('sam', 'foodfight')).toMatchObject({ points: 3, plays: 2, scoredPlays: 1 });
  });

  test('a channel not allowed refuses privately, and uses no play', async () => {
    await run('eggshen-config-games', 'admin', { subcommand: 'channels', options: { mode: 'only', add: { id: 'game-room' } } });
    const refused = await run('potion', 'sam', { subcommand: 'give', options: { user: member('alex'), type: 'luck' } });
    expect(refused.ephemeralFor).toBe('sam');
    expect(refused.content).toBe('🎲 Games are played in <#game-room> on this server.');
    expect(loadScores(GUILD).users).toEqual({});

    await run('eggshen-config-games', 'admin', { subcommand: 'channels', options: { mode: 'all' } });
    const played = await run('potion', 'sam', { subcommand: 'give', options: { user: member('alex'), type: 'luck' } });
    expect(played.ephemeralFor).toBeNull(); // the refusal didn't start a cooldown
  });

  test('the generic per-command limit skips the games, unless set for one explicitly', async () => {
    const config = await loadGuildConfig(GUILD);
    config.rateLimits = { enabled: true, global: { maxRequests: 1, windowSeconds: 60 }, commands: {} };
    await saveGuildConfig(GUILD, config);
    const twice = async (cmd, user) => {
      await checkRateLimit(GUILD, user, cmd);
      return (await checkRateLimit(GUILD, user, cmd)).limited;
    };
    expect(await twice('movie', 'sam')).toBe(true);
    for (const game of ['potion', 'foodfight', 'doom', 'rescue']) expect(await twice(game, 'sam')).toBe(false);

    config.rateLimits.commands.doom = { maxRequests: 1, windowSeconds: 60 };
    await saveGuildConfig(GUILD, config);
    expect(await twice('doom', 'kim')).toBe(true);
  });
});

describe('/scoreboard: the game card', () => {
  beforeEach(async () => {
    await saveGuildConfig(GUILD, { ...(await loadGuildConfig(GUILD)), games: { cooldownSeconds: 0 } });
    stubOutcome(FOODFIGHT_LINES.pie, 'hit');
    await run('foodfight', 'sam', { subcommand: 'throw', options: { target: member('alex'), food: 'pie' } });
    await run('foodfight', 'sam', { subcommand: 'throw', options: { target: member('alex'), food: 'pie' } });
    stubOutcome(DOOM_LINES.zombie, 'doomed');
    await run('doom', 'kim', { subcommand: 'fate', options: { target: member('sam'), trope: 'zombie' } });
    jest.restoreAllMocks();
  });

  test('your own: your server name and avatar, total and rank, a column per game played', async () => {
    const m = await run('scoreboard', 'sam');
    expect(m.ephemeralFor).toBeNull();
    expect(m.allowedMentions).toEqual({ parse: [] });
    expect(m.embeds[0].toJSON()).toEqual({
      color: 0xE67E22,
      author: { name: 'Sam' },
      title: 'Game card',
      thumbnail: { url: 'https://cdn.example/sam-server.png' },
      description: '🪙 `5` points · 🥇 `1st` of 3 players',
      fields: [
        { name: '🥧 Food Fight', value: '`6` pts · #1\n2 plays\n2 🎯\n🔥 2 now · best 2', inline: true },
        { name: '🪓 Doom', value: '`−1` pts · #2\n0 plays\nReceived: 1 💀', inline: true },
      ],
      footer: { text: `All time · ${HINT}` },
    });
    expect(discord.violations).toEqual([]);
  });

  test('someone else\'s, privately: their name, avatar and plays', async () => {
    const m = await run('scoreboard', 'sam', { options: { user: member('kim'), private: true } });
    expect(m.ephemeralFor).toBe('sam');
    const card = m.embeds[0].toJSON();
    expect(card.author).toEqual({ name: 'Kim' });
    expect(card.thumbnail).toEqual({ url: 'https://cdn.example/kim.png' });
    expect(card.description).toBe('🪙 `3` points · 🥈 `2nd` of 3 players');
    expect(card.fields).toEqual([{ name: '🪓 Doom', value: '`3` pts · #1\n1 play\n1 💀\n🔥 1 now · best 1', inline: true }]);
  });

  test('a game switched off is left out: its column, its points, and its players from the rank', async () => {
    await run('eggshen-config', 'admin', { group: 'commands', subcommand: 'toggle', options: { setting: 'doom', enabled: false } });
    const card = (await run('scoreboard', 'sam')).embeds[0].toJSON();
    expect(card.fields.map(f => f.name)).toEqual(['🥧 Food Fight']);
    // Kim only played Doom, so food fight's two players are all that's left
    expect(card.description).toBe('🪙 `6` points · 🥇 `1st` of 2 players');
    const off = await run('scoreboard', 'sam', { options: { game: 'doom' } });
    expect(off.ephemeralFor).toBe('sam');
    expect(off.content).toBe('🎲 Doom is switched off on this server.');
  });

  test('one game, one period: its own total and rank, and both named', async () => {
    const card = (await run('scoreboard', 'sam', { options: { game: 'doom', period: 'month' } })).embeds[0].toJSON();
    expect(card.title).toBe('Game card · Doom');
    expect(card.description).toBe('🪙 `−1` point · 🥈 `2nd` of 2 players');
    expect(card.fields.map(f => f.name)).toEqual(['🪓 Doom']);
    expect(card.footer.text).toBe(`${periodLabel('month')} · ${HINT}`);
  });

  test('the period: a play from another year counts all time, not this month', async () => {
    recordPlay(GUILD, { game: 'potion', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'helped' }, Date.UTC(2020, 0, 1));
    const allTime = (await run('scoreboard', 'sam')).embeds[0].toJSON();
    const month = (await run('scoreboard', 'sam', { options: { period: 'month' } })).embeds[0].toJSON();
    expect(allTime.fields.map(f => f.name)).toEqual(['🧪 Potions', '🥧 Food Fight', '🪓 Doom']);
    expect(allTime.description).toMatch(/^🪙 `6` points/);
    expect(month.fields.map(f => f.name)).toEqual(['🥧 Food Fight', '🪓 Doom']);
    expect(month.description).toMatch(/^🪙 `5` points/);
  });

  test('a rescue\'s shield shows while it lasts, with the games it belongs to', async () => {
    recordPlay(GUILD, { game: 'rescue', actor: { id: 'kim', name: 'Kim' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'Alex' }, outcome: 'rescued' });
    const shielded = (await run('scoreboard', 'sam', { options: { user: member('alex') } })).embeds[0].toJSON();
    expect(shielded.fields.at(-1)).toMatchObject({ name: '🌀 In effect', inline: false });
    expect(shielded.fields.at(-1).value).toMatch(/^🛡️ Safe from \/doom until <t:\d+:t>$/);
    await run('eggshen-config', 'admin', { group: 'commands', subcommand: 'toggle', options: { setting: 'rescue', enabled: false } });
    const rescueOff = (await run('scoreboard', 'sam', { options: { user: member('alex') } })).embeds[0].toJSON();
    expect(rescueOff.fields.map(f => f.name)).toEqual(['🥧 Food Fight']);
  });

  test('nothing played: someone else\'s says so; your own says how to start', async () => {
    const theirs = (await run('scoreboard', 'sam', { options: { user: member('admin') } })).embeds[0].toJSON();
    expect(theirs.description).toBe('admin hasn\'t played yet.');
    expect(theirs.fields).toEqual([]);
    const oneGame = (await run('scoreboard', 'sam', { options: { user: member('alex'), game: 'doom' } })).embeds[0].toJSON();
    expect(oneGame.description).toBe('Alex hasn\'t played Doom yet.');
    const mine = (await run('scoreboard', 'admin')).embeds[0].toJSON();
    expect(mine.description).toBe('No points yet. Throw some food, brew a potion, doom someone, or rescue them!');
  });

  test('bots are refused, and so is everything when the games are off', async () => {
    const bot = await run('scoreboard', 'sam', { options: { user: { user: discord.client.user, member: null } } });
    expect([bot.ephemeralFor, bot.content]).toEqual(['sam', '🤖 Bots don\'t play. They just keep score.']);
    for (const setting of ['potion', 'foodfight', 'doom', 'rescue']) {
      await run('eggshen-config', 'admin', { group: 'commands', subcommand: 'toggle', options: { setting, enabled: false } });
    }
    const off = await run('scoreboard', 'sam');
    expect([off.ephemeralFor, off.content]).toEqual(['sam', '🎲 The games are switched off on this server.']);
  });
});

describe('right-click a member → Apps → Game card', () => {
  test('their card, shown only to you', async () => {
    recordPlay(GUILD, { game: 'doom', actor: { id: 'kim', name: 'Kim' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'Alex' }, outcome: 'doomed' });
    const i = discord.userMenu('sam', 'Game card', 'kim');
    await commands['game-card'].execute(i);
    expect(i.replyMessage.ephemeralFor).toBe('sam');
    expect(i.replyMessage.embeds[0].toJSON()).toEqual({
      color: 0xE67E22,
      author: { name: 'Kim' },
      title: 'Game card',
      thumbnail: { url: 'https://cdn.example/kim.png' },
      description: '🪙 `3` points · 🥇 `1st` of 2 players',
      fields: [{ name: '🪓 Doom', value: '`3` pts · #1\n1 play\n1 💀\n🔥 1 now · best 1', inline: true }],
      footer: { text: `All time · ${HINT}` },
    });
    expect(discord.violations).toEqual([]);
  });

  test('on someone who hasn\'t played: says so, still only to you', async () => {
    const i = discord.userMenu('sam', 'Game card', 'kim');
    await commands['game-card'].execute(i);
    expect(i.replyMessage.ephemeralFor).toBe('sam');
    expect(i.replyMessage.embeds[0].toJSON().description).toBe('Kim hasn\'t played yet.');
  });
});

describe('/leaderboard: the server card', () => {
  test('one gold card: standings by current name, the leader\'s avatar, each game\'s leader, received leaders, the numbers', async () => {
    const now = Date.now();
    // Alex's stored name is out of date: the card shows the current one
    recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'alex-old' }, outcome: 'hit' }, now);
    recordPlay(GUILD, { game: 'doom', actor: { id: 'kim', name: 'Kim' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'alex-old' }, outcome: 'escaped' }, now);
    // Left the server, but Discord still knows them; and one Discord doesn't
    discord.formerUsers.set('gone', { id: 'gone', username: 'gone', globalName: 'Gone Girl', displayAvatarURL: () => 'https://cdn.example/gone.png' });
    recordPlay(GUILD, { game: 'rescue', actor: { id: 'gone', name: 'Old Name' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'caught' }, now);
    recordPlay(GUILD, { game: 'rescue', actor: { id: 'deleted', name: 'Stored Name' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'sacrificed' }, now);

    const m = await run('leaderboard', 'sam');
    expect(m.ephemeralFor).toBeNull();
    expect(m.allowedMentions).toEqual({ parse: [] });
    expect(m.content).toBe('');
    expect(m.embeds).toHaveLength(1);
    expect(m.embeds[0].toJSON()).toEqual({
      color: 0xF1C40F,
      title: 'Leaderboard · All games · All time',
      thumbnail: { url: 'https://cdn.example/sam-server.png' },
      description: [
        '🥇 Sam ▰▰▰▰▰ `3`',
        '🥈 Alex ▰▰▱▱▱ `1`',
        '🥉 Kim ▱▱▱▱▱ `−1`',
        '4\\. Gone Girl ▱▱▱▱▱ `−1`',
        '5\\. Stored Name ▱▱▱▱▱ `−2`',
      ].join('\n'),
      fields: [
        { name: '🧪 Potions', value: 'Nobody yet', inline: true },
        { name: '🥧 Food Fight', value: '👑 Sam `3`', inline: true },
        { name: '🪓 Doom', value: '👑 Alex `2`', inline: true },
        { name: '🛟 Rescue', value: '👑 Gone Girl `−1`', inline: true },
        { name: '⭐ Most received', value: '🎯 Most splatted: Alex `1`', inline: false },
        {
          name: '📊 Server stats',
          value: [
            '🎲 `4` plays · 🪙 `0` points',
            '👥 `5` players',
            '🛟 Most played: Rescue · `2` plays',
            '🔥 Best streak: Sam `1` in Food Fight',
          ].join('\n'),
          inline: false,
        },
      ],
      footer: { text: 'Your own card: /scoreboard' },
    });
    expect(discord.violations).toEqual([]);
  });

  test('the top 15 in one embed; the player count says how many more there are', async () => {
    for (let n = 0; n < 17; n++) {
      recordPlay(GUILD, { game: 'doom', actor: { id: `p${String(n).padStart(2, '0')}`, name: `P${String(n).padStart(2, '0')}` }, target: { kind: 'role', pingUserIds: [] }, outcome: 'doomed' });
    }
    const m = await run('leaderboard', 'sam');
    expect(m.embeds).toHaveLength(1);
    const card = m.embeds[0].toJSON();
    const rows = card.description.split('\n');
    expect([rows.length, rows[0], rows[14]]).toEqual([15, '🥇 P00 ▰▰▰▰▰ `3`', '15\\. P14 ▰▰▰▰▰ `3`']);
    expect(card.fields.at(-1).value.split('\n')[1]).toBe('👥 `17` players');
    // Nobody Discord knows: stored names, and no avatar to show
    expect(card.thumbnail).toBeUndefined();
  });

  test('one game: its own standings, no columns', async () => {
    recordPlay(GUILD, { game: 'doom', actor: { id: 'kim', name: 'Kim' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'Alex' }, outcome: 'doomed' });
    recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' });
    const card = (await run('leaderboard', 'sam', { options: { game: 'doom' } })).embeds[0].toJSON();
    expect(card.title).toBe('Leaderboard · Doom · All time');
    expect(card.description).toBe('🥇 Kim ▰▰▰▰▰ `3`\n🥈 Alex ▱▱▱▱▱ `−1`');
    expect(card.fields.map(f => f.name)).toEqual(['⭐ Most received', '📊 Server stats']);
  });

  test('a game switched off: refused by name, and left out of "all"', async () => {
    recordPlay(GUILD, { game: 'doom', actor: { id: 'kim', name: 'Kim' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'Alex' }, outcome: 'doomed' });
    recordPlay(GUILD, { game: 'rescue', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'sacrificed' });
    await run('eggshen-config', 'admin', { group: 'commands', subcommand: 'toggle', options: { setting: 'rescue', enabled: false } });
    const refused = await run('leaderboard', 'sam', { options: { game: 'rescue' } });
    expect([refused.ephemeralFor, refused.content]).toEqual(['sam', '🎲 Rescue is switched off on this server.']);
    const card = (await run('leaderboard', 'sam')).embeds[0].toJSON();
    // Sam only played Rescue: off the board, and out of the numbers
    expect(card.description).toBe('🥇 Kim ▰▰▰▰▰ `3`\n🥈 Alex ▱▱▱▱▱ `−1`');
    expect(card.fields.map(f => f.name)).toEqual(['🧪 Potions', '🥧 Food Fight', '🪓 Doom', '⭐ Most received', '📊 Server stats']);
    expect(card.fields.at(-1).value.split('\n')[0]).toBe('🎲 `1` play · 🪙 `2` points');
  });

  test('nobody yet, privately', async () => {
    const empty = await run('leaderboard', 'sam', { options: { game: 'doom', period: 'month', private: true } });
    expect(empty.ephemeralFor).toBe('sam');
    expect(empty.embeds[0].toJSON()).toEqual({
      color: 0xF1C40F,
      title: `Leaderboard · Doom · ${periodLabel('month')}`,
      description: 'Nobody has played yet. Be the first!',
      footer: { text: 'Your own card: /scoreboard' },
    });
  });
});

describe('/eggshen-config-games', () => {
  test('limits: set some, show all; members can\'t', async () => {
    const m = await run('eggshen-config-games', 'admin', { subcommand: 'limits', options: { 'cooldown-seconds': 5, 'shield-minutes': 0 } });
    expect(m.content).toBe([
      '✅ **Game limits saved**',
      '• Same game again after: **5s**',
      '• Plays per minute, all games: **6**',
      '• Scored plays per game per day: **20** (more still play, for 0 points)',
      '• Rescue shield: **off**',
    ].join('\n'));
    expect((await loadGuildConfig(GUILD)).games).toMatchObject({ cooldownSeconds: 5, shieldMinutes: 0 });
    expect((await run('eggshen-config-games', 'sam', { subcommand: 'limits' })).content).toMatch(/Only administrators/);
  });

  test('reset-scores: one person\'s game', async () => {
    recordPlay(GUILD, { game: 'doom', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'member', pingUserIds: ['alex'], name: 'Alex' }, outcome: 'doomed' });
    recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' });
    const m = await run('eggshen-config-games', 'admin', { subcommand: 'reset-scores', options: { confirm: 'yes', game: 'doom', user: discord.who('sam').user } });
    expect(m.content).toBe('🗑️ Erased Doom scores for sam (1 person).');
    expect(stored('sam', 'doom')).toBeUndefined();
    expect(stored('sam', 'foodfight').points).toBe(3);
    expect(stored('alex', 'doom').points).toBe(-1);
  });
});

describe('the commands as Discord lists them', () => {
  test('the play subcommand sorts ahead of the admin ones', () => {
    const first = (name) => commands[name].data.toJSON().options.map(o => o.name).sort()[0];
    expect(first('foodfight')).toBe('feed');
    expect(first('doom')).toBe('fate');
    expect(first('rescue')).toBe('attempt');
  });

  test('potion type autocomplete narrows by what was typed', async () => {
    const i = discord.autocomplete('admin', 'potion', { subcommand: 'add', focused: { name: 'type', value: 'po' } });
    await commands.potion.autocomplete(i);
    expect(i.choices).toEqual([{ name: '☠️ Poison', value: 'poison' }]);
  });
});

describe('the built-in lines', () => {
  const sets = [
    ['throw', FOODFIGHT_LINES, ['{thrower}', '{target}'], ['hit', 'miss', 'backfire']],
    ['feed', FOODFIGHT_FEED_LINES, ['{feeder}', '{target}'], ['tasty', 'gross', 'spill']],
    ['doom', DOOM_LINES, ['{user}', '{target}'], Object.keys(POINTS.doom)],
    ['rescue', RESCUE_LINES, ['{user}', '{target}'], Object.keys(POINTS.rescue)],
    ['potion', POTION_LINES, ['{giver}', '{receiver}'], ['worked', 'backfired']],
  ];

  test.each(sets)('%s: every line has both names and a scored outcome, and every outcome happens', (_, data, tags, outcomes) => {
    for (const [item, lines] of Object.entries(data)) {
      for (const l of lines) {
        expect(`${item}: ${tags.every(t => l.text.includes(t))} ${outcomes.includes(l.outcome)}`).toBe(`${item}: true true`);
      }
      for (const o of outcomes.filter(o => o !== 'blocked')) {
        expect(`${item} has ${o}: ${lines.some(l => l.outcome === o)}`).toBe(`${item} has ${o}: true`);
      }
    }
  });

  test('every food and trope a command offers has lines', () => {
    for (const f of commands.foodfight.FOODS) {
      expect(FOODFIGHT_LINES[f.value]?.length).toBeGreaterThanOrEqual(15);
      expect(FOODFIGHT_FEED_LINES[f.value]?.length).toBeGreaterThanOrEqual(15);
    }
    for (const t of commands.doom.TROPES) expect(DOOM_LINES[t.value]?.length).toBeGreaterThanOrEqual(15);
    for (const t of commands.rescue.RESCUE_TROPES) expect(RESCUE_LINES[t.value]?.length).toBeGreaterThanOrEqual(15);
    expect(DOOM_BLOCKED_LINES.every(t => t.includes('{user}') && t.includes('{target}'))).toBe(true);
  });
});
