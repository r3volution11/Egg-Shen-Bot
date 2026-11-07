/**
 * /siege end to end (R5): the real /siege, /eggshen-config, /scoreboard,
 * /leaderboard and the real scheduler pass (checkHappenings), on the
 * strict fake Discord with a clock the test controls. What's checked is
 * what members would see — how many messages, where, saying exactly what,
 * pinging whom — and what's stored, across a restart at the worst moments.
 *
 * Lines are chosen by stubbing Math.random: an attack draws its line from
 * its weapon's own lines (siegeAttackLines.js) with one Math.random, so
 * poolFor rebuilds the same pool from the real line data and stubFor finds
 * a value that lands on the outcome under test — a reshuffled data file
 * can't break these.
 *
 * The rules' numbers are in tests/siege-store.test.js.
 *
 * Run with: npm test -- tests/siege-commands.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { PermissionFlagsBits, HTTPError } from 'discord.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { saveGuildConfig, loadGuildConfig } from '../src/utils/guildConfig.js';
import { pickLine } from '../src/utils/gameRules.js';
import { SIEGE, SIEGE_ITEM_EFFECTS, ITEMS } from '../src/data/gameRewards.js';
import { MONSTERS, MONSTER_KEYS } from '../src/data/siegeMonsters.js';
import { SIEGE_ATTACK_LINES } from '../src/data/siegeAttackLines.js';
import { HAPPENINGS } from '../src/data/gameHappenings.js';
import { HONOURS, fill } from '../src/data/btilcLines.js';
import { lineFor } from '../src/utils/siegeCard.js';

const GUILD = 'siege-guild';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
// A Monday evening in November 2026: no calendar happening, no full moon
const T0 = Date.UTC(2026, 10, 9, 20, 0);
const sec = (ms) => Math.floor(ms / 1000);
const KLOWNS = MONSTERS.klowns;

const clock = { now: T0 };
let mods;
let discord;
const BOT = { id: 'bot' }; // guild.members.me

async function load() {
  mods = {
    siege: await import('../src/commands/siege.js'),
    config: await import('../src/commands/eggshen-config.js'),
    scoreboard: await import('../src/commands/scoreboard.js'),
    leaderboard: await import('../src/commands/leaderboard.js'),
    scheduler: await import('../src/utils/happeningScheduler.js'),
    store: await import('../src/utils/siegeStore.js'),
    happenings: await import('../src/utils/happeningStore.js'),
    scores: await import('../src/utils/gameScores.js'),
    foodfight: await import('../src/commands/foodfight.js'),
    doom: await import('../src/commands/doom.js'),
    potion: await import('../src/commands/potion.js'),
    luck: await import('../src/utils/gameLuck.js'),
  };
}

/** The bot restarts: everything in memory is gone, what's on disk stays */
async function restart() {
  jest.resetModules();
  await load();
}

/** What the bot may do in `channel` */
function grant(channel, perms = ['ViewChannel', 'SendMessages', 'EmbedLinks']) {
  const held = new Set(perms.map(p => PermissionFlagsBits[p]));
  channel.permissionsFor = (who) => (who === BOT ? { has: (flag) => held.has(flag) } : null);
  return channel;
}

function happeningFiles() {
  const dir = process.env.GUILD_HAPPENINGS_DIR;
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(`${GUILD}.json`)).map(f => path.join(dir, f)) : [];
}

beforeEach(async () => {
  clock.now = T0;
  jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  // These are quick-pace sieges, as /siege was before 2.74 (a server that
  // never chose a pace is on week: tests/siege-sim-pace.test.js)
  const config = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(config)) fs.unlinkSync(config);
  await saveGuildConfig(GUILD, { ...await loadGuildConfig(GUILD), games: { pace: 'quick' } });
  // This suite's files only: the directories are shared with the worker's other suites
  for (const f of happeningFiles()) fs.unlinkSync(f);
  await load();
  mods.scores.deleteScores(GUILD);
  mods.scores.resetPlayLimits();
  mods.scheduler._resetScheduler();

  discord = new FakeDiscord({ guildId: GUILD, channelId: 'games' });
  discord.guild.members.me = BOT;
  discord.guild.addChannel('lobby', 'lobby');
  for (const c of discord.guild.channelMap.values()) grant(c);
  for (const id of ['sam', 'alex', 'kim']) discord.addUser(id);
  discord.addUser('admin', { admin: true });
});

afterEach(() => {
  mods.luck._setLuck(null);
  expect(discord.violations).toEqual([]);
  jest.restoreAllMocks();
});

// ── driving it ──────────────────────────────────────────────────────────

async function slash(userId, subcommand, options = {}, { channel = null } = {}) {
  const i = discord.command(userId, 'siege', { subcommand, options });
  if (channel) {
    i.channel = channel;
    i.channelId = channel.id;
  }
  await mods.siege.execute(i);
  return i.replyMessage;
}
async function run(name, userId, { subcommand = null, group = null, options = {} } = {}) {
  const i = discord.command(userId, name, { subcommand, group, options });
  await mods[name].execute(i);
  return i.replyMessage;
}
const start = (options = { monster: 'klowns' }) => slash('admin', 'start', options);
const tick = (luck = () => 0.999999) => mods.scheduler.checkHappenings(discord.client, clock.now, { only: GUILD, luck });
const sends = () => discord.events.filter(e => e.kind === 'send').map(e => e.message);
const edits = () => discord.events.filter(e => e.kind === 'edit').map(e => e.message);
const siege = () => mods.store.currentSiege(GUILD);
const stored = (userId) => mods.scores.loadScores(GUILD).users[userId];
const setHp = (hp) => mods.happenings.mutate(GUILD, (d) => { d.siege.hp = hp; });
const lines = (m) => m.content.split('\n');
const after = (ms) => { clock.now += ms; };
/** Past the 20-second cooldown */
const cool = () => after(21_000);

/** The lines an attack with this weapon draws from (R6: its own, siegeAttackLines.js; as siege.js builds them) */
function poolFor(weapon) {
  const table = SIEGE.outcomes[weapon];
  return SIEGE_ATTACK_LINES[weapon].filter(l => Object.hasOwn(table, l.outcome)).map(l => ({ text: l.text, outcome: table[l.outcome] }));
}

/** Stub Math.random onto an attack that draws `outcome` (with an item's weights, if one is used) */
function stubFor(weapon, outcome, weights = {}) {
  for (let k = 0; k < 2000; k++) {
    const r = (k + 0.5) / 2000;
    const line = pickLine(poolFor(weapon), weights, () => r);
    if (line.outcome === outcome) {
      jest.spyOn(Math, 'random').mockReturnValue(r);
      return { r, line };
    }
  }
  throw new Error(`no ${weapon} draw lands on ${outcome}`);
}

/** A line as posted: the attacker for every game's actor tag, the monster for the target */
const filled = (text, userId, monster = KLOWNS) => text
  .replace(/{user}/g, `<@${userId}>`)
  .replace(/{monster}/g, `**${monster.name}**`);

async function attack(userId, weapon, outcome, { item = null, weights = {}, channel = null } = {}) {
  const { line } = stubFor(weapon, outcome, weights);
  const m = await slash(userId, 'attack', { weapon, ...(item ? { item } : {}) }, { channel });
  return { m, line };
}

// ── starting ────────────────────────────────────────────────────────────

describe('an admin start', () => {
  test('posts exactly ONE new message — the arrival with the card — in this channel, pinging nobody', async () => {
    const reply = await start();
    const end = T0 + 45 * MIN;
    expect(sends()).toHaveLength(1);
    const [m] = sends();
    expect(m.channelId).toBe('games');
    expect(m.content).toBe(`${KLOWNS.lines.arrive}\nFight it with \`/siege attack\`!`);
    expect(m.allowedMentions).toEqual({ parse: [] });
    const card = m.embeds[0].toJSON();
    expect(card.title).toBe('👹 Killer Klowns is attacking the drive-in!');
    expect(card.description.split('\n')).toEqual([`🤡 ${KLOWNS.about}`, '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 `40/40` HP', `Ends <t:${sec(end)}:R>`]);
    expect(card.color).toBe(0xC0392B);

    expect(reply.ephemeralFor).toBe('admin');
    expect(reply.content).toBe(`🤡 **Killer Klowns** is attacking <#games> until <t:${sec(end)}:t> (<t:${sec(end)}:R>) with \`40\` HP.`);
    expect(siege()).toMatchObject({
      monster: 'klowns', status: 'live', source: 'admin', startedBy: 'admin', channelId: 'games',
      startedAt: T0, endsAt: end, hp: 40, maxHp: 40, a7: 0, card: { messageId: m.id, dirty: false, editedAt: T0 },
    });

    // The scheduler doesn't post another, and has nothing to edit
    after(MIN);
    await tick();
    expect(sends()).toHaveLength(1);
    expect(edits()).toHaveLength(0);
  });

  test('HP comes from who played this week; at quick pace, the length from the option, the monster, or the setting', async () => {
    for (const id of ['sam', 'alex', 'kim']) mods.happenings.noteActivity(GUILD, { channelId: 'games', userId: id }, T0 - 2 * 24 * 60 * MIN);
    for (let i = 0; i < 27; i++) mods.happenings.noteActivity(GUILD, { channelId: 'games', userId: `m${i}` }, T0 - MIN);
    await start({ monster: 'klowns', length: 30 });
    expect(siege()).toMatchObject({ a7: 30, hp: 60, endsAt: T0 + 30 * MIN });
    await slash('admin', 'end');
    await saveGuildConfig(GUILD, { games: { siegeMinutes: 55, pace: 'quick' } });
    await start({ monster: 'blob' });
    expect(siege().endsAt).toBe(clock.now + 55 * MIN);
    await slash('admin', 'end');
    await start({ monster: 'lizard' });
    expect(siege().endsAt).toBe(clock.now + MONSTERS.lizard.minutes * MIN);
  });

  test('refused privately, posting nothing: a member; a channel the games aren\'t played in; one the bot can\'t post in; a second siege', async () => {
    const member = await slash('sam', 'start', { monster: 'klowns' });
    expect([member.ephemeralFor, member.content]).toEqual(['sam', '❌ Only administrators and moderators can start or end a siege.']);

    await saveGuildConfig(GUILD, { games: { channelMode: 'only', channels: ['lobby'], pace: 'quick' } });
    const barred = await start();
    expect(barred.content).toBe('❌ The games aren\'t played in this channel, so a monster can\'t attack here. Start it in a games channel.');
    await saveGuildConfig(GUILD, { games: { pace: 'quick' } });

    grant(discord.guild.channelMap.get('games'), ['ViewChannel', 'SendMessages']);
    const noEmbeds = await start();
    expect(noEmbeds.content).toBe('❌ I can\'t post the monster here: I need View Channel, Send Messages and Embed Links in this channel.');
    expect(sends()).toHaveLength(0);
    expect(siege()).toBeNull();

    grant(discord.guild.channelMap.get('games'));
    await start();
    const again = await start({ monster: 'blob' });
    expect(again.content).toBe('❌ Killer Klowns is already attacking <#games>. One siege at a time: end it with `/siege end` first.');
    expect(sends()).toHaveLength(1);
    expect(siege().monster).toBe('klowns');
  });

  test('the subcommands sort attack, back, end, start, status; every monster is offered', () => {
    const json = mods.siege.data.toJSON();
    const names = json.options.map(o => o.name);
    expect(names).toEqual(['attack', 'back', 'end', 'start', 'status']);
    // 2.75.0: /siege back fighter:@… points:2–10, both required
    const back = json.options.find(o => o.name === 'back').options;
    expect(back.map(o => [o.name, o.required, o.min_value, o.max_value])).toEqual([
      ['fighter', true, undefined, undefined], ['points', true, SIEGE.backing.min, SIEGE.backing.max],
    ]);
    expect([SIEGE.backing.min, SIEGE.backing.max]).toEqual([2, 10]);
    expect([...names].sort()).toEqual(names);
    const monster = json.options.find(o => o.name === 'start').options.find(o => o.name === 'monster');
    expect(monster.choices).toEqual(MONSTER_KEYS.map(key => ({ name: `${MONSTERS[key].emoji} ${MONSTERS[key].name}`, value: key })));
  });
});

// ── attacking ───────────────────────────────────────────────────────────

describe('an attack', () => {
  test('a food splat: the line with the monster as target, the points, the damage, the HP it grew — and stored', async () => {
    await start();
    const { m, line } = await attack('sam', 'food', 'splat');
    expect(m.ephemeralFor).toBeNull();
    expect(lines(m)).toEqual([
      filled(line.text, 'sam'),
      '-# 💥 Splat! sam +1 (1 pts)',
      '-# 💥 8 damage · Killer Klowns 37/45',
      '-# 📈 sam joined the fight: Killer Klowns grows +5 HP.',
    ]);
    // The attacker is pinged; a monster has nobody to ping
    expect(m.allowedMentions).toEqual({ parse: [], users: ['sam'] });
    expect(stored('sam').games.siege.all).toMatchObject({ points: 1, plays: 1, scoredPlays: 1, counts: { splat: 1 } });
    expect(siege()).toMatchObject({ hp: 37, maxHp: 45, participants: { sam: { name: 'sam', damage: 8, attacks: 1 } } });
    expect(siege().card.dirty).toBe(true);
  });

  test('a spooked doom: −2, no damage, and the next attack is halved', async () => {
    await start();
    let { m } = await attack('alex', 'doom', 'spooked');
    expect(lines(m).slice(1)).toEqual([
      '-# 😱 Spooked! alex −2 (−2 pts)',
      '-# 💥 No damage · Killer Klowns 45/45',
      '-# 📈 alex joined the fight: Killer Klowns grows +5 HP.',
      '-# 😱 alex is Spooked: their next attack does half damage.',
    ]);
    cool();
    ({ m } = await attack('alex', 'doom', 'smite'));
    expect(lines(m).slice(1)).toEqual([
      '-# ⚡ Smite! alex +2 (0 pts)',
      '-# 💥 8 damage (😱 halved) · Killer Klowns 37/45',
    ]);
  });

  test('a poisoned potion: 4 now and the poison, credited to the giver', async () => {
    await start();
    const { m } = await attack('kim', 'potion', 'poisoned');
    expect(lines(m).slice(1)).toEqual([
      '-# 🧪 Poisoned! kim +1 (1 pts)',
      '-# 💥 4 damage · Killer Klowns 41/45',
      '-# 📈 kim joined the fight: Killer Klowns grows +5 HP.',
      '-# 🧪 Killer Klowns is poisoned: 2 a minute for 5 minutes, credited to kim.',
    ]);
    expect(siege().participants.kim.poison).toEqual({ perMin: 2, until: T0 + 5 * MIN, lastTickAt: T0 });
  });

  test('the killing blow says so, and credits only the HP that was left', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    setHp(5);
    cool();
    const { m } = await attack('sam', 'doom', 'smite');
    expect(lines(m).slice(1)).toEqual([
      '-# ⚡ Smite! sam +2 (3 pts · 🔥 2 in a row)',
      '-# 💥 5 damage · Killer Klowns 0/45',
      '-# 🏆 sam landed the killing blow on Killer Klowns!',
    ]);
    expect(siege().participants.sam.damage).toBe(13);
  });

  test('item autocomplete: what fits the weapon; its own value, fed back, is used — the Silver Bullet ×3', async () => {
    await start();
    mods.scores.mutateScores(GUILD, (d) => { d.users.sam = { name: 'sam', games: {}, glovebox: { gpie: 1, vhs: 1, silver: 1, garlic: 1 } }; });
    const suggest = async (options) => {
      const i = discord.autocomplete('sam', 'siege', { subcommand: 'attack', options, focused: { name: 'item', value: '' } });
      await mods.siege.autocomplete(i);
      return i.choices;
    };
    const food = await suggest({ weapon: 'food' });
    expect(food).toEqual([
      { name: '🥧 Golden Pie ×1 · a sure splat', value: 'gpie' },
      { name: '🥈 Silver Bullet ×1 · can\'t backfire, damage ×3', value: 'silver' },
    ]);
    expect((await suggest({ weapon: 'doom' })).map(c => c.value)).toEqual(['vhs', 'silver']);
    // No weapon picked yet: whatever fits any of them, once each; never a passive item
    expect((await suggest({})).map(c => c.value)).toEqual(['gpie', 'silver', 'vhs']);

    const { m, line } = await attack('sam', 'food', 'splat', { item: food[1].value, weights: SIEGE_ITEM_EFFECTS.silver.food.weights });
    expect(lines(m)).toEqual([
      filled(line.text, 'sam'),
      '-# 💥 Splat! sam +1 (1 pts)',
      '-# 💥 24 damage (🥈 ×3) · Killer Klowns 21/45',
      '-# 📈 sam joined the fight: Killer Klowns grows +5 HP.',
      '-# 🥈 Silver Bullet: no backfire, and extra damage.',
    ]);
    expect(stored('sam').glovebox).toEqual({ gpie: 1, vhs: 1, garlic: 1 });
  });

  test('a Golden Pie narrows the draw as it does in a food fight: a throw that would have missed splats', async () => {
    await start();
    mods.scores.mutateScores(GUILD, (d) => { d.users.sam = { name: 'sam', games: {}, glovebox: { gpie: 1 } }; });
    // A value that lands on a miss without the pie…
    const { r } = stubFor('food', 'splash');
    // …lands on this line with it
    const line = pickLine(poolFor('food'), SIEGE_ITEM_EFFECTS.gpie.food.weights, () => r);
    const m = await slash('sam', 'attack', { weapon: 'food', item: 'gpie' });
    expect(line.outcome).toBe('splat');
    expect(lines(m)[0]).toBe(filled(line.text, 'sam'));
    expect(lines(m).at(-1)).toBe('-# 🥧 Golden Pie: a sure splat.');
    expect(stored('sam').glovebox).toEqual({});
  });

  test('a game item doesn\'t fit another weapon: refused privately, before the cooldown', async () => {
    await start();
    mods.scores.mutateScores(GUILD, (d) => { d.users.sam = { name: 'sam', games: {}, glovebox: { gpie: 1 } }; });
    const wrong = await slash('sam', 'attack', { weapon: 'doom', item: 'gpie' });
    expect([wrong.ephemeralFor, wrong.content]).toEqual(['sam', '🧰 🥧 Golden Pie doesn\'t work with /siege attack weapon:doom.']);
    const { m } = await attack('sam', 'doom', 'smite');
    expect(m.ephemeralFor).toBeNull();
  });

  test('only the first 30 attacks a day score; later ones still do damage, and ignore items', async () => {
    await start();
    mods.scores.mutateScores(GUILD, (d) => {
      d.users.sam = { name: 'sam', games: {}, glovebox: { silver: 1 } };
      d.daily.sam = { day: mods.scores.dayKey(clock.now), plays: { siege: SIEGE.scoredPerDay - 1 } };
    });
    // The 30th scores
    let { m } = await attack('sam', 'food', 'splat');
    expect(lines(m)[1]).toBe('-# 💥 Splat! sam +1 (1 pts)');
    cool();
    // The 31st: no points, the item stays, the damage isn't tripled — but it lands
    ({ m } = await attack('sam', 'food', 'splat', { item: 'silver' }));
    expect(lines(m).slice(1)).toEqual([
      '-# sam reached today\'s Siege scoring cap: just for fun now.',
      '-# 💥 8 damage · Killer Klowns 29/45',
      '-# 🥈 Silver Bullet stayed in sam\'s Glovebox: plays past today\'s scoring cap don\'t use items.',
    ]);
    expect(stored('sam').games.siege.all).toMatchObject({ points: 1, plays: 2, scoredPlays: 1 });
    expect(stored('sam').glovebox).toEqual({ silver: 1 });
    expect(siege().participants.sam.damage).toBe(16);
  });
});

describe('a play like no other', () => {
  test('a happening on, a status waiting and every twist ready to fire: a siege attack is just the fight', async () => {
    const before = process.env.GAME_HAPPENINGS;
    process.env.GAME_HAPPENINGS = 'on';
    try {
      mods.happenings.startHappening(GUILD, 'doublefeature', {}, clock.now);
      const waiting = { at: clock.now, until: clock.now + DAY };
      mods.scores.mutateScores(GUILD, (d) => { d.users.sam = { name: 'sam', games: {}, effects: { luckybreak: waiting, dcut: waiting } }; });
      mods.luck._setLuck(() => 0);
      await start();
      // A Lucky Break would have taken the miss out of the draw
      let { m } = await attack('sam', 'food', 'splash');
      expect(lines(m).slice(1)).toEqual([
        '-# 💨 Splash! sam ±0 (0 pts)',
        '-# 💥 3 damage · Killer Klowns 42/45',
        '-# 📈 sam joined the fight: Killer Klowns grows +5 HP.',
      ]);
      cool();
      // Double Feature and Director's Cut would each have doubled this; a twist would add a line
      ({ m } = await attack('sam', 'food', 'splat'));
      expect(lines(m).slice(1)).toEqual([
        '-# 💥 Splat! sam +1 (1 pts)',
        '-# 💥 8 damage · Killer Klowns 34/45',
      ]);
      expect(Object.keys(stored('sam').effects).sort()).toEqual(['dcut', 'luckybreak']);
      expect(stored('sam').lifetime.twists || 0).toBe(0);
    } finally {
      if (before === undefined) delete process.env.GAME_HAPPENINGS;
      else process.env.GAME_HAPPENINGS = before;
    }
  });
});

describe('refused, privately, spending nothing', () => {
  test('no siege; another channel; a weapon whose game is off; 0 HP — then the same member attacks at once', async () => {
    const none = await slash('sam', 'attack', { weapon: 'food' });
    expect([none.ephemeralFor, none.content]).toEqual(['sam', '👹 No monster is attacking right now.']);

    await start();
    const lobby = await slash('sam', 'attack', { weapon: 'food' }, { channel: discord.guild.channelMap.get('lobby') });
    expect([lobby.ephemeralFor, lobby.content]).toEqual(['sam', '👹 Killer Klowns is attacking in <#games>: fight it there!']);

    await run('config', 'admin', { group: 'commands', subcommand: 'toggle', options: { setting: 'foodfight', enabled: false } });
    const off = await slash('sam', 'attack', { weapon: 'food' });
    expect([off.ephemeralFor, off.content]).toEqual(['sam', '❌ /foodfight is turned off on this server, so food can\'t be used on the monster. Try another weapon!']);

    // None of that spent the cooldown or recorded a play
    expect(stored('sam')).toBeUndefined();
    const { m } = await attack('sam', 'doom', 'smite');
    expect(m.ephemeralFor).toBeNull();
    // …which this one did
    const soon = await slash('sam', 'attack', { weapon: 'potion' });
    expect([soon.ephemeralFor, soon.content]).toEqual(['sam', '⏳ Siege cooldown: 20s. Try another game meanwhile!']);

    setHp(0);
    const beaten = await slash('kim', 'attack', { weapon: 'doom' });
    expect([beaten.ephemeralFor, beaten.content]).toEqual(['kim', '🏆 Killer Klowns is already beaten! The results are on their way.']);
    expect(stored('kim')).toBeUndefined();
    expect(siege().participants).not.toHaveProperty('kim');
  });

  test('a thread of the siege\'s channel counts as the channel', async () => {
    await start();
    const thread = grant(discord.guild.addChannel('thread-1', 'fight thread'));
    thread.parentId = 'games';
    const { m } = await attack('sam', 'food', 'splat', { channel: thread });
    expect(m.ephemeralFor).toBeNull();
    expect(siege().participants.sam.damage).toBe(8);
  });

  test('an attack that lands just after the fight ended says so, and records nothing', async () => {
    await start();
    const member = discord.who('sam').member;
    const has = member.permissions.has;
    let adminChecks = 0;
    member.permissions.has = (flag) => {
      // The second permission check is the weapon's switch, after the free
      // refusals passed and before the attack lands: an admin ends it then
      if (flag === 'Administrator' && ++adminChecks === 2) mods.store.finishSiege(GUILD, siege().id, 'ended', clock.now);
      return has(flag);
    };
    const m = await slash('sam', 'attack', { weapon: 'food' });
    expect([m.ephemeralFor, m.content]).toEqual(['sam', '⏹️ The fight with Killer Klowns ended a moment before your attack landed.']);
    expect(stored('sam')).toBeUndefined();
    expect(siege().participants).toEqual({});
  });

  test('the siege switched off: members are refused, admins still fight — and no new siege starts', async () => {
    await start();
    const toggled = await run('config', 'admin', { group: 'commands', subcommand: 'toggle', options: { setting: 'siege', enabled: false } });
    expect(toggled.content).toBe('❌ **/siege command** has been disabled for regular users.');
    const member = await slash('sam', 'attack', { weapon: 'food' });
    expect([member.ephemeralFor, member.content]).toEqual(['sam', '❌ /siege is turned off on this server.']);
    const status = await slash('sam', 'status');
    expect(status.content).toBe('❌ /siege is turned off on this server.');
    const { m } = await attack('admin', 'food', 'splat');
    expect(m.ephemeralFor).toBeNull();
    expect(siege().participants.admin.damage).toBe(8);
    // The next pass calls it off (members can't fight it), and no new one starts while it's off
    after(MIN);
    await tick();
    expect(siege()).toMatchObject({ status: 'ended', result: { grants: [] } });
    const refused = await start();
    expect(refused.content).toBe('❌ /siege is turned off for members on this server, so nobody could fight it. Turn it on first: `/eggshen-config commands toggle setting:siege enabled:true`.');
    expect(sends()).toHaveLength(1);
  });
});

// ── the clock ───────────────────────────────────────────────────────────

describe('the scheduler', () => {
  test('ticks poison into the giver\'s credit, and edits the card at most once a minute', async () => {
    await start();
    after(10_000);
    await attack('kim', 'potion', 'poisoned'); // 45 → 41, poison until T0+310s
    const card = sends()[0];
    after(20_000); // T0+30s: dirty, but the card was posted 30s ago
    await tick();
    expect(edits()).toHaveLength(0);
    clock.now = T0 + 60_000;
    await tick();
    expect(edits()).toHaveLength(1);
    expect(edits()[0]).toBe(card);
    clock.now = T0 + 70_000; // the first tick: dirty again, but edited 10s ago
    await tick();
    expect([edits().length, siege().hp, siege().participants.kim.damage]).toEqual([1, 39, 6]);
    clock.now = T0 + 120_000;
    await tick();
    expect(edits()).toHaveLength(2);
    expect(card.embeds[0].toJSON().description.split('\n')[1]).toBe('🟩🟩🟩🟩🟩🟩🟩🟩🟩⬜ `39/45` HP');
    // The rest of the poison, caught up in one late pass: 5 ticks in all
    clock.now = T0 + 10 * MIN;
    await tick();
    expect([siege().hp, siege().participants.kim.damage, siege().participants.kim.poison]).toEqual([31, 14, null]);
    expect(edits()).toHaveLength(3);
    // Nothing changed since: no edit
    clock.now = T0 + 12 * MIN;
    await tick();
    expect(edits()).toHaveLength(3);
  });

  test('at 0 HP: finished as a win, the card frozen, the results posted ONCE — pinging the fighters', async () => {
    await start();
    await attack('sam', 'food', 'splat'); // 45 → 37
    await attack('alex', 'food', 'splat'); // 82/90 → 74
    setHp(4);
    cool();
    await attack('sam', 'food', 'splat'); // 4 more: 0
    after(MIN);
    await tick(); // luck 0.999999: the Wang Chi's loot is not silver, and the last prize item

    expect(siege()).toMatchObject({ status: 'won' });
    expect(sends()).toHaveLength(2);
    const results = sends()[1];
    expect(results.channelId).toBe('games');
    // Nobody freed or cured: sam, the top fighter, holds the line as the Wang
    // Chi — and landed the killing blow too, so one line says both
    const both = fill(lineFor(siege().id, HONOURS.both, 0), { mvp: 'sam' });
    expect(HONOURS.both.map(l => fill(l, { mvp: 'sam' }))).toContain(both);
    expect(results.content).toBe(`${KLOWNS.lines.defeat.split('{mvp}').join('sam')}\n${both}\n<@sam> <@alex>`);
    expect(siege().result).toMatchObject({ wangChi: { userId: 'sam', held: true }, jack: { userId: 'sam', by: 'food' } });
    expect(results.allowedMentions).toEqual({ parse: [], users: ['sam', 'alex'] });
    const embed = results.embeds[0].toJSON();
    expect(embed.title).toBe('🏆 Killer Klowns is beaten!');
    // Pool 24 (2 fighters): 12 and 8 damage → 14.4 → 14, +8 the Wang Chi, +3 the Jack Burton; and 9.6 → 10
    expect(embed.description.split('\n')).toEqual([
      '🤡 Beaten with `2` fighters. The pool was split by what each did (damage, frees and cures); 🗡️ the Wang Chi gets +8 and loot, 🔪 the Jack Burton +3.',
      '',
      '🥇 sam · `12` damage · `+25` · 🗡️ +8 · 🔪 +3 · 🍀 Lucky Penny · 📜 🏆 Siege MVP',
      '🥈 alex · `8` damage · `+10`',
    ]);
    expect(stored('sam').games.siege.all.points).toBe(2 + 25 + 10);
    expect(stored('sam').lifetime.siege).toMatchObject({ wins: 1, mvps: 1, jacks: 1 });
    expect(stored('alex').games.siege.all.points).toBe(1 + 10);
    expect(stored('sam').glovebox).toEqual({ penny: 1 });

    // The card: frozen, its "Fight it" gone
    const card = sends()[0];
    expect(edits().at(-1)).toBe(card);
    expect(card.content).toBe(KLOWNS.lines.arrive);
    expect(card.embeds[0].toJSON().title).toBe('👹 Killer Klowns is beaten!');
    expect(card.embeds[0].toJSON().color).toBe(0x2ECC71);

    for (let i = 0; i < 3; i++) {
      after(MIN);
      await tick();
    }
    expect(sends()).toHaveLength(2);
  });

  test('a restart between the finish and the post: posted once after it, never twice', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    setHp(0);
    // The pass saved the finish and died before posting
    mods.store.finishSiege(GUILD, siege().id, 'won', clock.now, () => 0.999999);
    await restart();
    after(MIN);
    await tick();
    expect(sends()).toHaveLength(2);
    expect(sends()[1].embeds[0].toJSON().title).toBe('🏆 Killer Klowns is beaten!');
    await restart();
    after(MIN);
    await tick();
    expect(sends()).toHaveLength(2);
    expect(siege().result).toMatchObject({ announcedAt: expect.any(Number), messageId: sends()[1].id });
  });

  test('died mid-send (claimed, no message id): never sent again', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    setHp(0);
    mods.store.finishSiege(GUILD, siege().id, 'won', clock.now, () => 0.999999);
    mods.store.claimResults(GUILD, siege().id, clock.now);
    await restart();
    for (let i = 0; i < 3; i++) {
      after(MIN);
      await tick();
    }
    expect(sends()).toHaveLength(1);
  });

  test('a send Discord refuses (an outage, as discord.js reports one) is tried again on the next pass', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await start();
    await attack('sam', 'food', 'splat');
    setHp(0);
    const games = discord.guild.channelMap.get('games');
    const send = games.send.bind(games);
    let refuse = true;
    games.send = async (payload) => {
      // What discord.js throws once its own retries of a 5xx run out: Discord
      // answered, and posted nothing
      if (refuse) throw new HTTPError(503, 'Service Unavailable', 'POST', 'https://discord.com/api/v10/channels/games/messages', {});
      return send(payload);
    };
    after(MIN);
    await tick();
    expect(sends()).toHaveLength(1);
    expect(siege().result).toMatchObject({ announcedAt: null, claimedAt: null, tries: 1 });
    refuse = false;
    after(MIN);
    await tick();
    expect(sends()).toHaveLength(2);
  });

  test('time up: it escapes, and with 2+ fighters each loses 3 — never below 0 for the month', async () => {
    const role = { kind: 'role', pingUserIds: [] };
    for (let i = 0; i < 2; i++) mods.scores.recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'sam' }, target: role, outcome: 'hit' }, T0 - i - 1);
    await start();
    await attack('sam', 'doom', 'smite'); // sam: 6 + 2 this month
    after(1000); // equal damage: who joined first ranks first
    await attack('alex', 'doom', 'smite'); // alex: 2
    clock.now = T0 + 45 * MIN;
    await tick();
    expect(siege().status).toBe('escaped');
    const results = sends()[1];
    expect(results.content).toBe(`${KLOWNS.lines.escape}\n<@sam> <@alex>`);
    expect(results.allowedMentions).toEqual({ parse: [], users: ['sam', 'alex'] });
    const embed = results.embeds[0].toJSON();
    expect(embed.title).toBe('💨 Killer Klowns got away!');
    expect(embed.description.split('\n')).toEqual([
      `🤡 It got away. Everyone who fought loses ${SIEGE.escape.loss} (never below 0 for the month).`,
      '',
      '🥇 sam · `16` damage · `−3`',
      '🥈 alex · `16` damage · `−2`',
    ]);
    expect([stored('sam').games.siege.all.points, stored('alex').games.siege.all.points]).toEqual([-1, 0]);
    expect(sends()[0].embeds[0].toJSON().title).toBe('👹 Killer Klowns got away!');
    // 32 of its 90 HP dealt: under half, so the next one isn't made easier
    // (SIEGE.dialEscapeMinDamage; the ×0.88 is in tests/siege-store.test.js)
    expect(mods.happenings.loadState(GUILD).siegeDial).toBe(1);
  });

  test('a random happening never starts while a siege is live; it can once the siege is over', async () => {
    for (const id of ['sam', 'alex', 'kim']) mods.happenings.noteActivity(GUILD, { channelId: 'games', userId: id }, clock.now);
    await start();
    for (let i = 0; i < 5; i++) {
      after(MIN);
      await tick(() => 0); // the dice say yes every time
    }
    expect(mods.happenings.loadState(GUILD).happening).toBeNull();
    expect(sends()).toHaveLength(1);
    await slash('admin', 'end');
    after(MIN);
    for (const id of ['sam', 'alex', 'kim']) mods.happenings.noteActivity(GUILD, { channelId: 'games', userId: id }, clock.now);
    await tick(() => 0);
    expect(mods.happenings.loadState(GUILD).happening?.kind).toBe(Object.keys(HAPPENINGS)[0]);
  });
});

// ── ending ──────────────────────────────────────────────────────────────

describe('an admin end', () => {
  test('with HP left: no rewards, no penalties, no new message — the card says it was called off', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    const before = JSON.stringify(mods.scores.loadScores(GUILD));
    const denied = await slash('sam', 'end');
    expect(denied.content).toBe('❌ Only administrators and moderators can start or end a siege.');
    const reply = await slash('admin', 'end');
    expect([reply.ephemeralFor, reply.content]).toEqual(['admin', '⏹️ Ended the siege: Killer Klowns slinks off. No rewards, no penalties.']);
    expect(siege()).toMatchObject({ status: 'ended', result: { status: 'ended', grants: [] } });
    expect(JSON.stringify(mods.scores.loadScores(GUILD))).toBe(before);
    expect(sends()).toHaveLength(1);
    expect(edits()).toHaveLength(1);
    const card = sends()[0].embeds[0].toJSON();
    expect(card.title).toBe('👹 Killer Klowns: the siege was called off');
    expect(card.description.split('\n')[2]).toBe(`Called off <t:${sec(clock.now)}:R>: no rewards, no penalties`);
    // Nothing for a pass to do after it
    after(MIN);
    await tick();
    expect([sends().length, edits().length]).toEqual([1, 1]);
    const nothing = await slash('admin', 'end');
    expect(nothing.content).toBe('No monster is attacking right now, so there was nothing to end.');
  });

  test('at 0 HP it\'s the win it was: results posted now, once', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    setHp(0);
    const reply = await slash('admin', 'end');
    expect(reply.content).toBe('🏆 Killer Klowns was already beaten, so it counts as a win: the results are in <#games>.');
    expect(sends()).toHaveLength(2);
    expect(sends()[1].embeds[0].toJSON().title).toBe('🏆 Killer Klowns is beaten!');
    after(MIN);
    await tick();
    expect(sends()).toHaveLength(2);
  });
});

// ── the cards ───────────────────────────────────────────────────────────

describe('the cards', () => {
  test('/siege status: the card and your place, only to you', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    const mine = await slash('sam', 'status');
    expect(mine.ephemeralFor).toBe('sam');
    expect(mine.content).toBe('You: `8` damage · 1st of 1 fighter');
    const card = mine.embeds[0].toJSON();
    expect(card.fields.slice(0, 2)).toEqual([
      { name: '👥 Fighters', value: '`1` fighter', inline: true },
      { name: '🏆 Top fighters', value: '🥇 sam `8`', inline: true },
    ]);
    expect(card.fields[2].value.split('\n')).toEqual(['📈 sam joined the fight · +5 HP', '💥 sam splatted it · 8']);
    const theirs = await slash('kim', 'status');
    expect(theirs.content).toBe('You haven\'t attacked yet: `/siege attack weapon:food|doom|potion`');
    expect(sends()).toHaveLength(1);
  });

  test('/scoreboard has a Siege column, and the fight on now; /leaderboard shows its HP bar', async () => {
    await start();
    await attack('sam', 'food', 'splat');
    const end = sec(T0 + 45 * MIN);
    const card = (await run('scoreboard', 'sam')).embeds[0].toJSON();
    expect(card.fields.find(f => f.name === '👹 Siege')).toEqual({ name: '👹 Siege', value: '`1` pts · #1\n1 play\n1 💥\n🔥 1 now · best 1', inline: true });
    expect(card.description.split('\n')).toEqual([
      '🪙 `1` point · 🥇 `1st` of 1 player',
      `🤡 **Killer Klowns** is attacking! 🟩🟩🟩🟩🟩⬜ \`37/45\` HP · ends <t:${end}:R> · you: \`8\` damage, 1st`,
    ]);
    // Someone who hasn't fought is asked to
    const kims = (await run('scoreboard', 'kim')).embeds[0].toJSON();
    expect(kims.description.split('\n').at(-1)).toMatch(/· join in with `\/siege attack`$/);

    const board = (await run('leaderboard', 'sam')).embeds[0].toJSON();
    expect(board.fields.at(-1)).toEqual({
      name: '⏰ In progress',
      value: `🤡 Killer Klowns is attacking! 🟩🟩🟩🟩🟩🟩🟩⬜ \`37/45\` HP · ends <t:${end}:R>`,
      inline: false,
    });
    // Over: gone from both
    await slash('admin', 'end');
    expect((await run('leaderboard', 'sam')).embeds[0].toJSON().fields.map(f => f.name)).not.toContain('⏰ In progress');
    expect((await run('scoreboard', 'sam')).embeds[0].toJSON().description).toBe('🪙 `1` point · 🥇 `1st` of 1 player');
  });

  test('the toggle offers /siege, with its name', () => {
    const toggle = mods.config.data.toJSON().options.find(o => o.name === 'commands').options.find(o => o.name === 'toggle');
    expect(toggle.options.find(o => o.name === 'setting').choices).toContainEqual({ name: 'Siege Command', value: 'siege' });
    // The Silver Bullet is a siege item, and fits no other game
    expect(ITEMS.silver.game).toBe('siege');
  });
});
