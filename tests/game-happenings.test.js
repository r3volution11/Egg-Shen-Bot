/**
 * Happenings end to end: the real /eggshen-config-games happenings and the
 * real scheduler pass (checkHappenings), on the strict fake Discord with a
 * clock the test controls. What's checked is what members would see — how
 * many messages, in which channel, saying what, pinging nobody — and what's
 * stored, including across a restart at the worst moment.
 *
 * The store's own rules (spawn limits, the rate) are in
 * tests/happening-store.test.js.
 *
 * Run with: npm test -- tests/game-happenings.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { PermissionFlagsBits } from 'discord.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { saveGuildConfig, loadGuildConfig } from '../src/utils/guildConfig.js';
import { deleteScores, resetPlayLimits, loadScores } from '../src/utils/gameScores.js';
import { HAPPENINGS } from '../src/data/gameHappenings.js';
import { DOOM_LINES } from '../src/data/doomLines.js';

const GUILD = 'happening-guild';
const MIN = 60_000;
// A Monday evening in November 2026: no calendar happening, no full moon
const T0 = Date.UTC(2026, 10, 9, 20, 0);
const sec = (ms) => Math.floor(ms / 1000);
const DEFAULT_LINES = [
  '• Happenings: **on** · random ones: **Normal (about one a day when busy)**',
  '• Announced in: the channel the games were last played in',
  '• Twists: **on**, **4%** of scored plays',
];

const clock = { now: T0 };
let mods;
let discord;
const BOT = { id: 'bot' }; // guild.members.me

async function load() {
  mods = {
    config: await import('../src/commands/eggshen-config-games.js'),
    scheduler: await import('../src/utils/happeningScheduler.js'),
    store: await import('../src/utils/happeningStore.js'),
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
  const config = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(config)) fs.unlinkSync(config);
  // This suite's files only: the directory is shared with the worker's other suites
  for (const f of happeningFiles()) fs.unlinkSync(f);
  deleteScores(GUILD);
  resetPlayLimits();
  await load();
  mods.scheduler._resetScheduler();

  discord = new FakeDiscord({ guildId: GUILD, channelId: 'mod-room' });
  discord.guild.members.me = BOT;
  for (const id of ['games', 'lobby', 'happen', 'quiet']) discord.guild.addChannel(id, id);
  for (const c of discord.guild.channelMap.values()) grant(c);
  grant(discord.guild.channelMap.get('quiet'), ['ViewChannel']);
  for (const id of ['sam', 'alex', 'kim']) discord.addUser(id);
  discord.addUser('admin', { admin: true });
});

afterEach(() => {
  expect(discord.violations).toEqual([]);
  jest.restoreAllMocks();
});

async function admin(options = {}, userId = 'admin') {
  const i = discord.command(userId, 'eggshen-config-games', { subcommand: 'happenings', options });
  await mods.config.execute(i);
  return i.replyMessage;
}

const tick = (luck = () => 0.999999) => mods.scheduler.checkHappenings(discord.client, clock.now, { only: GUILD, luck });
const sends = () => discord.events.filter(e => e.kind === 'send').map(e => e.message);
const edits = () => discord.events.filter(e => e.kind === 'edit').map(e => e.message);
const games = (g) => saveGuildConfig(GUILD, { games: g });
const played = (channelId, ...users) => {
  for (const userId of users) mods.store.noteActivity(GUILD, { channelId, userId }, clock.now);
};

function expectAnnouncement(message, kind, endsAt) {
  const h = HAPPENINGS[kind];
  expect(message.content).toBe(h.announce);
  expect(message.embeds.map(e => e.toJSON())).toEqual([{
    color: mods.scheduler.HAPPENING_COLORS[kind],
    title: `${h.emoji} ${h.name}`,
    description: `${h.about}\nEnds <t:${sec(endsAt)}:R>`,
  }]);
  // An announcement summons nobody
  expect(message.allowedMentions).toEqual({ parse: [] });
}

describe('an admin start', () => {
  test('sends exactly one new message, in the games channel, pinging nobody; then confirms privately', async () => {
    await games({ channelMode: 'only', channels: ['games'] });
    const end = T0 + 60 * MIN;
    const reply = await admin({ start: 'fullmoon' });

    expect(sends()).toHaveLength(1);
    const [message] = sends();
    expect(message.channelId).toBe('games');
    expectAnnouncement(message, 'fullmoon', end);
    expect(reply.ephemeralFor).toBe('admin');
    expect(reply.content).toBe([
      `🌕 **Full Moon** is on until <t:${sec(end)}:t> (<t:${sec(end)}:R>), announced in <#games>.`,
      '',
      '🎪 **Happenings**',
      DEFAULT_LINES[0],
      '• Announced in: <#games> (the games channel)',
      DEFAULT_LINES[2],
      `• Now: 🌕 **Full Moon**, until <t:${sec(end)}:t> (<t:${sec(end)}:R>)`,
    ].join('\n'));
    expect(mods.store.loadState(GUILD).happening).toMatchObject({
      kind: 'fullmoon', source: 'admin', startedBy: 'admin', startedAt: T0, endsAt: end, channelId: 'games', messageId: message.id,
    });

    // The scheduler doesn't announce it again
    clock.now += MIN;
    await tick(() => 0);
    expect(sends()).toHaveLength(1);
  });

  test('one at a time: a second start is refused and sends nothing; members can\'t start one at all', async () => {
    await admin({ start: 'fog' });
    const end = T0 + 45 * MIN;
    clock.now += 5 * MIN;
    const again = await admin({ start: 'sunrise' });
    expect(again.content.split('\n')[0]).toBe(`❌ 🌫️ **The Fog** is on until <t:${sec(end)}:t> (<t:${sec(end)}:R>). They run one at a time: end it with \`end:True\` first.`);
    const denied = await admin({ start: 'sunrise' }, 'sam');
    expect([denied.ephemeralFor, denied.content]).toEqual(['sam', '❌ Only administrators and moderators can change the game settings.']);
    expect(sends()).toHaveLength(1);
    expect(mods.store.loadState(GUILD).happening.kind).toBe('fog');
  });

  test('`end:True start:…` swaps one for another: the old announcement is edited, the new one sent', async () => {
    await admin({ start: 'fog' });
    clock.now += 10 * MIN;
    const reply = await admin({ end: true, start: 'happyhour' });
    // What was sent (a message's first version), and what the first became
    expect(sends().map(m => m.history[0].content)).toEqual([HAPPENINGS.fog.announce, HAPPENINGS.happyhour.announce]);
    expect(edits()).toHaveLength(1);
    expect(edits()[0]).toBe(sends()[0]);
    expect(sends()[0].content).toBe(HAPPENINGS.fog.ended);
    expect(reply.content.split('\n').slice(0, 2)).toEqual([
      '⏹️ Ended 🌫️ **The Fog**.',
      `🍻 **Happy Hour** is on until <t:${sec(clock.now + 60 * MIN)}:t> (<t:${sec(clock.now + 60 * MIN)}:R>), announced in <#mod-room>.`,
    ]);
  });

  test('switched off: a start is refused', async () => {
    await games({ happenings: false });
    const reply = await admin({ start: 'fog' });
    expect(reply.content.split('\n')[0]).toBe('❌ Happenings are switched off. Turn them on with `enabled:True` to start one.');
    expect(sends()).toHaveLength(0);
    expect(mods.store.loadState(GUILD).happening).toBeNull();
  });
});

describe('where it\'s announced', () => {
  // Each: the settings, where the games were last played, and where it lands
  test.each([
    ['the happenings channel first', { happeningChannel: 'happen' }, 'lobby', 'happen'],
    ['then the games channel, when the games are limited to one', { channelMode: 'only', channels: ['games'] }, 'lobby', 'games'],
    ['then where the games were last played', { channelMode: 'only', channels: ['games', 'lobby'] }, 'lobby', 'lobby'],
    ['then, for an admin start, where the admin is', {}, null, 'mod-room'],
    ['a happenings channel the games aren\'t played in is skipped', { channelMode: 'except', channels: ['happen'], happeningChannel: 'happen' }, 'lobby', 'lobby'],
    ['one where the bot can\'t embed is skipped', { happeningChannel: 'quiet' }, 'lobby', 'lobby'],
    ['a last-played channel the games are now barred from is skipped', { channelMode: 'except', channels: ['lobby'] }, 'lobby', 'mod-room'],
  ])('%s', async (_, settings, last, where) => {
    await games(settings);
    if (last) played(last, 'sam');
    await admin({ start: 'fog' });
    expect(sends().map(m => m.channelId)).toEqual([where]);
  });

  test.each([
    ['View Channel', ['SendMessages', 'EmbedLinks']],
    ['Send Messages', ['ViewChannel', 'EmbedLinks']],
    ['Embed Links', ['ViewChannel', 'SendMessages']],
  ])('without %s in the happenings channel, the next choice', async (_, perms) => {
    grant(discord.guild.channelMap.get('happen'), perms);
    await games({ happeningChannel: 'happen' });
    played('lobby', 'sam');
    await admin({ start: 'fog' });
    expect(sends().map(m => m.channelId)).toEqual(['lobby']);
  });

  test('a thread counts as its parent, and needs Send Messages in Threads', async () => {
    const thread = grant(discord.guild.addChannel('thread-1', 'movie night'), ['ViewChannel', 'SendMessagesInThreads', 'EmbedLinks']);
    thread.parentId = 'games';
    thread.isThread = () => true;
    await games({ channelMode: 'only', channels: ['games', 'lobby'] });
    played('thread-1', 'sam');
    await admin({ start: 'fog' });
    expect(sends().map(m => m.channelId)).toEqual(['thread-1']);
  });

  test('nowhere it may post: no message, the admin is told, and it applies anyway', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await games({ channelMode: 'except', channels: ['mod-room', 'lobby'] });
    played('lobby', 'sam');
    const reply = await admin({ start: 'fullmoon' });
    expect(sends()).toHaveLength(0);
    const end = T0 + 60 * MIN;
    expect(reply.content.split('\n')[0]).toBe(`🌕 **Full Moon** is on until <t:${sec(end)}:t> (<t:${sec(end)}:R>). I couldn't announce it: there's no games channel where I can View, Send and Embed Links. It applies anyway, and changed plays show 🌕×2.`);
    expect(mods.store.activeHappenings(GUILD, clock.now).map(h => h.kind)).toEqual(['fullmoon']);
    expect(mods.store.loadState(GUILD).happening.unannounced).toBe('no-channel');
    // …and the summary says so
    expect(reply.content).toContain(`• Now: 🌕 **Full Moon**, until <t:${sec(end)}:t> (<t:${sec(end)}:R>) · not announced`);
  });
});

describe('ending', () => {
  test('`end:True` edits the announcement to say it\'s over — an edit, no new message', async () => {
    await admin({ start: 'fog' });
    const [message] = sends();
    clock.now += 10 * MIN;
    const reply = await admin({ end: true });

    expect(sends()).toHaveLength(1);
    expect(edits()).toHaveLength(1);
    expect(edits()[0]).toBe(message);
    expect(message.content).toBe(HAPPENINGS.fog.ended);
    expect(message.embeds.map(e => e.toJSON())).toEqual([{
      color: mods.scheduler.ENDED_COLOR,
      title: '🌫️ The Fog',
      description: `~~${HAPPENINGS.fog.about}~~\nEnded <t:${sec(clock.now)}:R>`,
    }]);
    expect(message.allowedMentions).toEqual({ parse: [] });
    expect(reply.content).toBe([
      '⏹️ Ended 🌫️ **The Fog**.',
      '',
      '🎪 **Happenings**',
      ...DEFAULT_LINES,
      '• Now: nothing',
      `• Lately: 🌫️ The Fog <t:${sec(clock.now)}:R>`,
    ].join('\n'));
    expect(mods.store.activeHappenings(GUILD, clock.now)).toEqual([]);

    // Nothing left to end; no pass edits it again
    const again = await admin({ end: true });
    expect(again.content.split('\n')[0]).toBe('Nothing is happening right now, so there was nothing to end.');
    clock.now += MIN;
    await tick();
    expect(edits()).toHaveLength(1);
  });

  test('the scheduler ends it on time and edits the announcement; nothing new starts inside the gap', async () => {
    await admin({ start: 'fog' });
    const [message] = sends();
    clock.now = T0 + 44 * MIN;
    await tick();
    expect(edits()).toHaveLength(0);
    clock.now = T0 + 45 * MIN + 30_000;
    played('lobby', 'sam', 'alex');
    await tick(() => 0);
    expect(edits()).toHaveLength(1);
    expect(edits()[0]).toBe(message);
    expect(message.content).toBe(HAPPENINGS.fog.ended);
    // Ended at its endsAt, not when the pass noticed
    expect(mods.store.loadState(GUILD).lastEndedAt).toBe(T0 + 45 * MIN);
    expect(sends()).toHaveLength(1);
  });

  test('switching happenings off ends the current one, and edits its announcement', async () => {
    await admin({ start: 'sunrise' });
    clock.now += 5 * MIN;
    const reply = await admin({ enabled: false });
    expect(sends()[0].content).toBe(HAPPENINGS.sunrise.ended);
    expect(reply.content.split('\n').slice(0, 4)).toEqual(['⏹️ Ended 🌅 **Sunrise**.', '', '✅ **Happenings saved**', '• Happenings: **off**']);
    expect(mods.store.activeHappenings(GUILD, clock.now)).toEqual([]);
  });
});

describe('random happenings', () => {
  test('a spawn is announced once, where the games were last played', async () => {
    played('lobby', 'sam', 'alex');
    await tick(() => 0); // fires, and draws the first kind: Full Moon
    expect(sends()).toHaveLength(1);
    const [message] = sends();
    expect(message.channelId).toBe('lobby');
    expectAnnouncement(message, 'fullmoon', T0 + 60 * MIN);
    expect(mods.store.loadState(GUILD).happening).toMatchObject({ kind: 'fullmoon', source: 'random', messageId: message.id });

    for (let i = 1; i <= 5; i++) {
      clock.now = T0 + i * MIN;
      await tick(() => 0);
    }
    expect(sends()).toHaveLength(1);
  });

  test('with GAME_LUCK=off nothing starts by chance, however long it runs', async () => {
    for (let i = 0; i < 120; i++) {
      clock.now = T0 + i * MIN;
      if (i % 10 === 0) played('lobby', 'sam', 'alex', 'kim');
      await mods.scheduler.checkHappenings(discord.client, clock.now, { only: GUILD });
    }
    expect(sends()).toHaveLength(0);
    expect(mods.store.loadState(GUILD).happening).toBeNull();
  });

  test('no channel it may post in: it starts unannounced, and says so in the log once', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await games({ channelMode: 'except', channels: ['lobby'] });
    played('lobby', 'sam', 'alex');
    await tick(() => 0);
    clock.now += MIN;
    await tick(() => 0);
    expect(sends()).toHaveLength(0);
    expect(mods.store.activeHappenings(GUILD, clock.now).map(h => h.kind)).toEqual(['fullmoon']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/No channel to announce Full Moon/);
  });

  test('switched off, or frequency off: none, even when the dice say yes', async () => {
    played('lobby', 'sam', 'alex', 'kim');
    await games({ happenings: false });
    await tick(() => 0);
    await games({ happeningFrequency: 'off' });
    await tick(() => 0);
    expect(sends()).toHaveLength(0);
  });
});

describe('a restart at the worst moment', () => {
  test('between the spawn and the post: announced once after the restart, never twice', async () => {
    played('lobby', 'sam', 'alex');
    // The pass saved the spawn and died before posting
    const spawned = mods.store.maybeSpawn(GUILD, { happenings: true, happeningFrequency: 'normal' }, clock.now, () => 0);
    expect(spawned.happening.messageId).toBeNull();
    await restart();
    clock.now += MIN;
    await tick();
    expect(sends()).toHaveLength(1);
    expectAnnouncement(sends()[0], 'fullmoon', T0 + 60 * MIN);
    await restart();
    clock.now += MIN;
    await tick();
    expect(sends()).toHaveLength(1);
  });

  test('down for more than two minutes after the spawn: it\'s never announced late', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    played('lobby', 'sam', 'alex');
    mods.store.maybeSpawn(GUILD, { happenings: true }, clock.now, () => 0);
    await restart();
    clock.now += 2 * MIN + 1000;
    await tick();
    clock.now += MIN;
    await tick();
    expect(sends()).toHaveLength(0);
    expect(mods.store.loadState(GUILD).happening.unannounced).toBe('late');
    // Still on, though: the plays carry its tag
    expect(mods.store.activeHappenings(GUILD, clock.now).map(h => h.kind)).toEqual(['fullmoon']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('died mid-send (claimed, no message id): never sent again', async () => {
    played('lobby', 'sam', 'alex');
    const { happening } = mods.store.maybeSpawn(GUILD, { happenings: true }, clock.now, () => 0);
    // The claim was saved and the send may have gone out; the id never came back
    mods.store.claimAnnouncement(GUILD, happening.id, 'lobby', clock.now);
    await restart();
    for (let i = 0; i < 3; i++) {
      clock.now += 30_000;
      await tick();
    }
    expect(sends()).toHaveLength(0);
  });

  test('a send Discord refuses isn\'t retried', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const lobby = discord.guild.channelMap.get('lobby');
    lobby.send = async () => { throw Object.assign(new Error('Missing Access'), { code: 50001 }); };
    played('lobby', 'sam', 'alex');
    await tick(() => 0);
    clock.now += MIN;
    await tick(() => 0);
    expect(mods.store.loadState(GUILD).happening.unannounced).toBe('send-failed');
    expect(discord.events.filter(e => e.kind === 'send')).toHaveLength(0);
  });

  test('a pass still waiting on Discord when the next begins: the next leaves that server alone', async () => {
    await admin({ start: 'fog' });
    const [message] = sends();
    // The end edit hangs until released, as a slow Discord would
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const edit = message.edit.bind(message);
    message.edit = async (...args) => { await gate; return edit(...args); };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

    clock.now = T0 + 46 * MIN;
    const first = tick();
    await settle(); // the first pass has ended it and is waiting on the edit
    clock.now += MIN;
    const second = tick();
    await settle();
    release();
    await Promise.all([first, second]);
    expect(edits()).toHaveLength(1);
    expect(message.content).toBe(HAPPENINGS.fog.ended);
  });
});

describe('the summary and settings', () => {
  test('no options: settings, what\'s on, today\'s calendar happening and the last few — privately', async () => {
    clock.now = Date.UTC(2026, 9, 31, 12, 0); // Halloween
    for (const kind of ['fog', 'happyhour', 'sunrise', 'rewind']) {
      const { happening } = mods.store.startHappening(GUILD, kind, {}, clock.now);
      clock.now += 30 * MIN;
      mods.store.endHappening(GUILD, happening.id, clock.now);
    }
    // Ended at 14:00, 13:30 and 13:00, newest first
    const ends = [[14, 0], [13, 30], [13, 0]].map(([h, m]) => sec(Date.UTC(2026, 9, 31, h, m)));
    mods.store.startHappening(GUILD, 'intermission', {}, clock.now);
    const end = clock.now + 45 * MIN;
    const reply = await admin();
    expect(reply.ephemeralFor).toBe('admin');
    expect(reply.content).toBe([
      '🎪 **Happenings**',
      ...DEFAULT_LINES,
      `• Now: 🎪 **Intermission**, until <t:${sec(end)}:t> (<t:${sec(end)}:R>)`,
      '• Today: 🎃 **Halloween Night**: Twists are twice as likely all day.',
      `• Lately: 📼 Be Kind, Rewind <t:${ends[0]}:R> · 🌅 Sunrise <t:${ends[1]}:R> · 🍻 Happy Hour <t:${ends[2]}:R>`,
    ].join('\n'));
    expect(sends()).toHaveLength(0);
  });

  test('every setting saves, through the normalizer', async () => {
    const reply = await admin({ enabled: false, frequency: 'rare', channel: { id: 'happen' }, twists: false, 'twist-percent': 9 });
    expect((await loadGuildConfig(GUILD)).games).toEqual({
      happenings: false, happeningFrequency: 'rare', happeningChannel: 'happen', twists: false, twistPercent: 9,
    });
    expect(reply.content).toBe([
      '✅ **Happenings saved**',
      '• Happenings: **off**',
      '• Announced in: <#happen>',
      '• Twists: **off**',
      '• Now: nothing',
    ].join('\n'));
    const back = await admin({ enabled: true, frequency: 'often', twists: true });
    expect(back.content.split('\n').slice(1, 4)).toEqual([
      '• Happenings: **on** · random ones: **Often**',
      '• Announced in: <#happen>',
      '• Twists: **on**, **9%** of scored plays',
    ]);
  });

  test('a happenings channel that would quietly do nothing is flagged', async () => {
    const quiet = await admin({ channel: { id: 'quiet' } });
    expect(quiet.content.split('\n')[0]).toBe('⚠️ I can\'t post in <#quiet> yet: I need View Channel, Send Messages and Embed Links there.');
    await games({ channelMode: 'only', channels: ['games'] });
    const barred = await admin({ channel: { id: 'happen' } });
    expect(barred.content.split('\n')[0]).toBe('⚠️ The games aren\'t played in <#happen>, so happenings won\'t be announced there.');
    const fine = await admin({ channel: { id: 'games' } });
    expect(fine.content.split('\n')[0]).toBe('✅ **Happenings saved**');
  });

  test('the subcommand sorts ahead of `limits` in Discord\'s picker, and offers every happening', () => {
    const json = mods.config.data.toJSON();
    const names = json.options.map(o => o.name);
    expect([...names].sort()).toEqual(['channels', 'happenings', 'limits', 'reset-scores']);
    const start = json.options.find(o => o.name === 'happenings').options.find(o => o.name === 'start');
    expect(start.choices).toEqual(Object.entries(HAPPENINGS).map(([value, h]) => ({ name: `${h.emoji} ${h.name}`, value })));
  });
});

describe('with the real plays', () => {
  const doomed = () => {
    const lines = DOOM_LINES.zombie;
    const idx = lines.findIndex(l => l.outcome === 'doomed');
    jest.spyOn(Math, 'random').mockReturnValue((idx + 0.5) / lines.length);
  };
  const target = (id) => ({ user: discord.who(id).user, member: discord.who(id).member });
  const stored = (userId) => loadScores(GUILD).users[userId]?.games?.doom?.all?.points;

  test('a Full Moon an admin started doubles a doom both ways; after endsAt it\'s back to normal with no scheduler pass', async () => {
    const doom = await import('../src/commands/doom.js');
    const before = process.env.GAME_HAPPENINGS;
    process.env.GAME_HAPPENINGS = 'on';
    try {
      await admin({ start: 'fullmoon' });
      clock.now += 5 * MIN;
      doomed();
      let i = discord.command('sam', 'doom', { subcommand: 'fate', options: { target: target('alex'), trope: 'zombie' } });
      await doom.execute(i);
      expect(i.replyMessage.content.split('\n')[1]).toBe('-# 💀 Doomed! 🌕×2 sam +6 (6 pts) · alex −2');
      expect([stored('sam'), stored('alex')]).toEqual([6, -2]);

      // Past its end, with no pass to end it: normal again
      clock.now = T0 + 60 * MIN;
      doomed();
      i = discord.command('sam', 'doom', { subcommand: 'fate', options: { target: target('alex'), trope: 'zombie' } });
      await doom.execute(i);
      expect(i.replyMessage.content.split('\n')[1]).toBe('-# 💀 Doomed! sam +3 (9 pts · 🔥 2 in a row) · alex −1');
      expect([stored('sam'), stored('alex')]).toEqual([9, -3]);
      expect(mods.store.loadState(GUILD).happening.endedAt).toBeNull();
    } finally {
      if (before === undefined) delete process.env.GAME_HAPPENINGS;
      else process.env.GAME_HAPPENINGS = before;
    }
  });
});
