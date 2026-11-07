/**
 * /siege simulator: whole sieges through the real /siege, /rescue, /potion,
 * /foodfight, /doom, /eggshen-config, /eggshen-config-games, /scoreboard
 * and /leaderboard — dispatched through src/handlers/commandDispatch.js as
 * production does, so the rate limits and the error reply are the real
 * ones — and the real happening scheduler (checkHappenings, which runs the
 * siege's clock), against the strict fake Discord (fakeDiscord.js), with a
 * clock the test controls and seeded dice. Modeled on escapeSim.js and
 * tournamentSim.js (CLAUDE.md: the tournament simulator's first run found
 * eight bugs that ~130 piecemeal tests had missed).
 *
 * The world: one guild, a games channel, a thread in it, a lobby, an admin
 * and seven members. Math.random (the line draws) and gameLuck (loot,
 * twists, happenings) are both seeded from the scenario's seed; a forced
 * attack (`force: 'splat'`) pins Math.random for that one attack onto a
 * line with that outcome, worked out from the real line data.
 *
 * After EVERY step — a command, a scheduler pass, a restart — it checks
 * what must always hold, and throws a SimFailure naming the step:
 *   - every interaction answered exactly once, nothing Discord would
 *     reject (discord.violations), no generic "error executing" reply, no
 *     scheduler pass that threw
 *   - 0 ≤ hp ≤ maxHp; maxHp is the spawn HP plus each fighter's growth
 *     (it only grows on a new fighter's first attack); a finished siege's
 *     status, HP and damage never change again
 *   - one siege at a time: a siege is only replaced once it's finished and
 *     its results are settled
 *   - Σ fighters' damage == maxHp − hp + what the monster healed (credit
 *     is the HP actually removed, never more); every attack's reply says the
 *     HP that's stored, the damage the rules give, and the heal it did
 *   - the card (once its message is recorded) shows the stored HP whenever
 *     it isn't waiting for an edit; is never stale after a pass that was due
 *     to edit it; is edited at most once a minute while the fight is on;
 *     and is frozen, never to change again, once the fight is over
 *   - at most one arrival message and at most one results message per
 *     siege id, across restarts — exactly one of each unless a fault made
 *     the code's promise "drop, never duplicate" apply; the results ping
 *     ≤ 20 users, only fighters, in content, nobody else
 *   - siege points in the scores file move only on an attack (by what its
 *     reply says) and on a finish (by the stored grants, once per siege id)
 *   - a refused attack changes no file and spends no cooldown: the play
 *     limits are modelled, so a refusal the model can't explain fails
 *
 * Faults: `sim.fault({on: 'send'|'edit', kind: 'card'|'results'|…, mode})`
 * makes the next matching Discord call go wrong:
 *   fail         - Discord refuses it (an HTTPError 503, as discord.js
 *                  throws once its own retries run out): nothing posted
 *   gone         - the message or channel is gone (10008 / 10003)
 *   abort-before - the request never got an answer and never reached Discord
 *   abort-after  - Discord posted it, but the bot's request timed out
 *   crash-before / crash-after - the bot dies just before or just after it
 *                  reached Discord: the step is abandoned mid-flight and the
 *                  bot restarts from its files
 *
 * Transcripts: SIM_REPORT=dir writes every message, as it looked when it
 * was posted or edited, under the step that caused it (writeTranscript).
 *
 * Pace (2.74.0): `new Sim(id, { pace })` sets the server's pace before the
 * first step (default `quick`, what every scenario before 2.74 was written
 * against; `null` leaves it unset, so the server reads as week). Every
 * timing the checks use is the siege's own (`t`, gamePace.timingsOf), and
 * from `evening` on these hold too:
 *   - the monster acts, and a digest pings, only while the drive-in is
 *     busy (someone attacked in the last PACE_RULES.busyMinutes)
 *   - nobody makes more than the day's allowance of attacks; a refusal for
 *     it changes nothing
 *   - max HP is the formula's with every fighter-night that grew it
 *   - one daily report a night at most, never on the night it arrived,
 *     pinging nobody; a digest nobody was pinged for is in the next one
 *   - an escape's held results wait for a game played after it got away
 *     (or holdUntil); a win's post at once
 *   - a 3-day or week siege ends at a night boundary
 *
 * The real hero (2.75.0): `sim.back(userId, fighterId, points)` is
 * `/siege back`. Siege points may also move by −stake when a backing is
 * placed (the scores file's backStakes say whose) and by each backer's
 * settled payout at the finish. And these hold:
 *   - every stake taken is a backer on the siege with that stake — or one a
 *     crash orphaned, which the finish refunds — and the reverse
 *   - nobody is backed at or after backingClosesAt, nor a fighter who
 *     hadn't attacked, nor themselves; a refused backing changes no file
 *   - each backer's settlement is the design's matrix, worked out here
 *     from the result (the Wang Chi, the top 3, the Jack Burton, how many
 *     fought) — and the fighter's share is paid once, on the largest stake
 *   - honours only on a win with company: one Wang Chi (the most help, ≥8,
 *     else the top contributor holding the line — worked out here), the
 *     Jack Burton the killing blow, paid ×H
 *   - a free or cure past its game's scoring cap frees or cures; only the
 *     first SIEGE.credit.unscoredPerNight a night count (the model reads
 *     which from the reply)
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { PermissionFlagsBits, HTTPError, DiscordAPIError } from 'discord.js';
import { FakeDiscord } from './fakeDiscord.js';

const SRC = path.join(process.cwd(), 'src');
const src = (p) => path.join(SRC, p);

export const MINUTE = 60_000;
const GENERIC_ERROR = /an error occurred|something went wrong|error executing this command/i;
/** The commands the simulated bot has (dispatched by name, as client.commands) */
export const COMMANDS = ['siege', 'rescue', 'potion', 'foodfight', 'doom', 'eggshen-config', 'eggshen-config-games', 'scoreboard', 'leaderboard'];
/** Everyone but the admin */
export const MEMBERS = ['ana', 'ben', 'cat', 'dev', 'eve', 'fay', 'gus'];
/** guild.members.me: who botCanPost asks about */
const BOT = { id: 'bot' };
const ALL_PERMS = ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'EmbedLinks'];

let mods = null;
/** The Sim being driven: a restart re-seeds ITS luck into the new modules */
let current = null;
/**
 * Timers the bot's modules start when they load (rateLimiter's and the
 * logger's housekeeping, say). A restart is a new process: the old one's
 * timers die with it, so a restart clears them rather than leave the old
 * copy's housekeeping running beside the new one's.
 *
 * Each restart still costs ~10 MB that's never given back: jest keeps
 * something of every ESM module graph resetModules discards (discord.js
 * included). A few hundred restarts in one test file run out of heap —
 * hence the fuzz's restart rate and SIM_FUZZ_FIRST for long hunts.
 */
const processTimers = [];

async function importModules() {
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => {
    const t = realSetInterval(...args);
    processTimers.push(t);
    return t;
  };
  try {
    await loadBot();
  } finally {
    globalThis.setInterval = realSetInterval;
  }
  if (current) mods.luck._setLuck(current.luckFn);
}

async function loadBot() {
  const commands = new Map();
  for (const name of COMMANDS) {
    const mod = await import(src(`commands/${name}.js`));
    commands.set(mod.data.name, mod);
  }
  const next = {
    commands,
    dispatch: await import(src('handlers/commandDispatch.js')),
    // Loaded by the dispatch on its first command; loaded here, so its timer is this process's
    rateLimiter: await import(src('utils/rateLimiter.js')),
    scheduler: await import(src('utils/happeningScheduler.js')),
    store: await import(src('utils/siegeStore.js')),
    pace: await import(src('utils/gamePace.js')),
    happenings: await import(src('utils/happeningStore.js')),
    scores: await import(src('utils/gameScores.js')),
    luck: await import(src('utils/gameLuck.js')),
    rules: await import(src('utils/gameRules.js')),
    gamePlay: await import(src('utils/gamePlay.js')),
    rewards: await import(src('data/gameRewards.js')),
    monsters: await import(src('data/siegeMonsters.js')),
    btilc: await import(src('data/btilcLines.js')),
    card: await import(src('utils/siegeCard.js')),
    attackLines: (await import(src('data/siegeAttackLines.js'))).SIEGE_ATTACK_LINES,
    rescueLines: (await import(src('data/rescueLines.js'))).RESCUE_LINES,
    potionLines: (await import(src('data/potionLines.js'))).POTION_LINES,
  };
  if (mods) Object.assign(mods, next);
  else mods = next;
}

export async function loadSim() {
  if (mods) return mods;
  if (process.env.SIM_VERBOSE !== '1') {
    // The logger prints every command; the scheduler says it started
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  }
  await importModules();
  return mods;
}

/** The bot restarts: everything in memory is gone, what's on disk stays. */
export async function restartBot() {
  for (const t of processTimers.splice(0)) clearInterval(t);
  jest.resetModules();
  await importModules();
  if (current) current.afterRestart();
}

export const clock = {
  // A Monday evening in November 2026: no calendar happening, no full moon
  now: Date.UTC(2026, 10, 9, 20, 0, 0),
  install() {
    jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
  },
};

/** mulberry32: a small seeded PRNG, so a failing run replays exactly */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimFailure extends Error {}

const footerOf = (snap) => snap?.embeds?.[0]?.footer?.text || '';
const titleOf = (snap) => snap?.embeds?.[0]?.title || '';
const descriptionOf = (snap) => snap?.embeds?.[0]?.description || '';
/** What a payload or message is, by its footer: the siege card, its results, its daily report (2.74.0), or something else */
function kindOf(snap) {
  const footer = footerOf(snap);
  if (footer.startsWith('Siege results')) return 'results';
  if (footer.startsWith('Siege ·')) return 'card';
  if (footer.startsWith('Nightly siege report')) return 'report';
  return 'other';
}
const snapOf = (payload) => {
  const p = typeof payload === 'string' ? { content: payload } : (payload || {});
  return { content: p.content ?? '', embeds: (p.embeds || []).map(e => (typeof e?.toJSON === 'function' ? e.toJSON() : e)) };
};
const mentionsIn = (text) => [...String(text || '').matchAll(/<@!?(\w+)>/g)].map(m => m[1]);
const signedNumber = (s) => Number(String(s).replace('−', '-').replace('±', '').replace('+', ''));
const fmtTime = (ms) => new Date(ms).toISOString().slice(11, 19);
const SIEGE_NOW = () => mods.rewards.SIEGE;

export class Sim {
  constructor(guildId, { seed = 1, members = MEMBERS, pace = 'quick' } = {}) {
    if (!mods) throw new Error('await loadSim() first');
    current = this;
    this.guildId = guildId;
    this.seed = seed;
    // The server's pace, saved before the first step (configure is async)
    this.pace = pace;
    this.paceSaved = pace === null;
    this.members = [...members];
    this.discord = new FakeDiscord({ guildId, channelId: 'games' });
    const guild = this.discord.guild;
    guild.members.me = BOT;
    this.games = this.discord.channel;
    this.games.name = 'games';
    this.thread = guild.addChannel('games-thread', 'fight-thread');
    this.thread.parentId = 'games';
    this.thread.isThread = () => true;
    this.lobby = guild.addChannel('lobby', 'lobby');
    this.perms = new Map();
    for (const channel of guild.channelMap.values()) {
      this.grant(channel.id, ALL_PERMS);
      channel.permissionsFor = (who) => (who === BOT ? { has: (flag) => this.perms.get(channel.id).has(flag) } : null);
      this.wrapSend(channel);
    }
    this.wrapChannelFetch();
    this.discord.addUser('admin', { admin: true });
    for (const id of this.members) this.discord.addUser(id);

    // The fake logs the live message object, which later edits change: keep
    // what each event showed at the time, and which step caused it
    const log = this.discord.log.bind(this.discord);
    this.discord.log = (e) => log({ ...e, snap: e.message?.snapshot?.(), step: this.stepNo });

    this.removeFiles();
    this.rand = seeded(seed);
    const luckRand = seeded(seed ^ 0x5EED5EED);
    // Forced draws first (a scenario steering the monster), then the seeded dice
    this.luckQueue = [];
    this.luckFn = () => (this.luckQueue.length ? this.luckQueue.shift() : luckRand());
    this.forced = null;
    jest.spyOn(Math, 'random').mockImplementation(() => (this.forced ?? this.rand()));
    mods.luck._setLuck(this.luckFn);
    mods.scores.resetPlayLimits();
    mods.scheduler._resetScheduler();

    this.sieges = new Map(); // siege id → what the sim has seen of it
    this.lastId = null;
    this.ledger = {}; // userId → siege points the sim expects (all-time)
    this.model = { last: {}, times: {} }; // the play limits, as gameScores.checkPlayLimit keeps them
    this.faults = [];
    this.stepFaults = [];
    this.pauses = [];
    this.pinged = new Map(); // action id → who its message pinged
    this.crashSignal = null;
    this.crashes = 0;
    this.stepNo = 0;
    this.steps = [];
    this.nextTickAt = clock.now + MINUTE;
    this.lastEditFaultAt = null;
  }

  // ── the world ─────────────────────────────────────────────────────────

  channel(id) {
    if (id && typeof id === 'object') return id;
    const c = this.discord.guild.channelMap.get({ thread: 'games-thread' }[id] || id || 'games');
    if (!c) throw new Error(`No channel ${id}`);
    return c;
  }

  /** What the bot may do in a channel (names of PermissionFlagsBits) */
  grant(channelId, perms) {
    this.perms.set(channelId, new Set(perms.map(p => PermissionFlagsBits[p])));
  }

  removeFiles() {
    for (const v of ['GUILD_CONFIGS_DIR', 'GUILD_GAMES_DIR', 'GUILD_HAPPENINGS_DIR']) {
      const dir = process.env[v];
      if (!dir) throw new Error('Data folders must point at a scratch directory (tests/jest.setup.js)');
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith(`${this.guildId}.`)) fs.unlinkSync(path.join(dir, name));
      }
    }
  }

  get mods() { return mods; }

  /** The siege as stored (live or the last one), or null */
  siege() { return mods.store.currentSiege(this.guildId); }
  state() { return mods.happenings.loadState(this.guildId); }
  scores() { return mods.scores.loadScores(this.guildId); }

  /** The server's game settings, read from its config file as the bot would (sync, for the checks) */
  gameSettings() {
    const file = path.join(process.env.GUILD_CONFIGS_DIR, `${this.guildId}.json`);
    const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return mods.scores.getGameSettings(config);
  }
  monster(key = this.siege()?.monster) { return mods.monsters.MONSTERS[key]; }

  /** Each member's all-time siege points, as stored */
  siegePoints(scores = this.scores()) {
    const out = {};
    for (const [id, u] of Object.entries(scores.users || {})) {
      const p = u?.games?.siege?.all?.points;
      if (p !== undefined) out[id] = p;
    }
    return out;
  }

  /** Every public message, oldest first, in every channel */
  posted() {
    return [...this.discord.guild.channelMap.values()].flatMap(c => c.posted);
  }

  /** Every message the bot sent (not interaction replies), with its kind and siege */
  sends() {
    return this.discord.events.filter(e => e.kind === 'send').map(e => e.message);
  }

  /** Messages of one kind for a siege: 'card' (the arrival) or 'results' */
  messagesFor(siegeId, kind) {
    return this.sends().filter(m => m.siegeId === siegeId && m.kindTag === kind);
  }

  /** Give a member an item, as a prize would have (the files are the bot's; this is a test's setup) */
  giveItem(userId, item, count = 1) {
    mods.scores.mutateScores(this.guildId, (data) => {
      const u = (data.users[userId] ||= { name: userId, games: {} });
      u.glovebox ||= {};
      u.glovebox[item] = (u.glovebox[item] || 0) + count;
    });
  }

  /**
   * 2.75.0: make a member a regular who can back a fighter, as a week of
   * plays would have — `nights` nights in a row up to tonight in their
   * nights record, and `points` this month in another game (/doom). A
   * test's setup, like giveItem: their siege points don't move.
   */
  regular(userId, { points = 20, nights = 3 } = {}) {
    const tonight = mods.rules.nightKey(clock.now);
    const month = mods.scores.periodKeys(clock.now).month;
    mods.scores.mutateScores(this.guildId, (data) => {
      const u = (data.users[userId] ||= { name: userId, games: {} });
      u.games ||= {};
      const doom = (u.games.doom ||= {});
      for (const key of ['all', month]) {
        doom[key] ||= { points: 0, plays: 0, scoredPlays: 0, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 };
        doom[key].points += points;
      }
      const recent = Array.from({ length: nights }, (_, i) => mods.rules.shiftNight(tonight, -i)).reverse();
      u.nights = { last: tonight, current: nights, best: Math.max(nights, u.nights?.best || 0), recent, saved: [], lightUsedAt: null };
    });
  }

  // ── faults ────────────────────────────────────────────────────────────

  /**
   * The next Discord call matching `on` ('send'|'edit') and `kind`
   * ('card'|'results'|'other'|'any') fails or kills the bot:
   *   fail         - Discord refuses it (503), the bot carries on
   *   crash-before - the bot dies before the request reaches Discord
   *   crash-after  - Discord posted it, the bot died before hearing back
   */
  fault({ on, kind = 'any', mode = 'crash-before' }) {
    this.faults.push({ on, kind, mode });
  }

  takeFault(on, snap) {
    const kind = kindOf(snap);
    const i = this.faults.findIndex(f => f.on === on && (f.kind === 'any' || f.kind === kind));
    if (i < 0) return null;
    const [f] = this.faults.splice(i, 1);
    this.stepFaults.push({ ...f, kind });
    // The sim remembers which siege a fault hit: its promise there is
    // "drop, never duplicate", not "exactly one". A refusal Discord
    // answered (fail) is retried, so it still owes exactly one.
    const s = this.siege();
    const rec = s && this.track(s);
    if (rec && kind === 'card' && on === 'send') rec.cardFault = true;
    if (rec && kind === 'results' && f.mode !== 'fail') rec.resultsFault = true;
    return { ...f, kind };
  }

  /** What a fault throws, as discord.js would */
  faultError(mode, on) {
    if (mode === 'fail') return new HTTPError(503, 'Service Unavailable', 'POST', 'https://discord.com/api/v10/(fake)', {});
    if (mode === 'gone') {
      const code = on === 'edit' ? 10008 : 10003;
      return new DiscordAPIError({ message: on === 'edit' ? 'Unknown Message' : 'Unknown Channel', code }, code, 404, 'PATCH', 'https://discord.com/api/v10/(fake)', {});
    }
    return Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
  }

  /** The bot dies here: the step is abandoned, and restarts from its files */
  crash(where) {
    this.crashes += 1;
    this.crashedAt = where;
    if (!this.crashSignal) throw new Error(`crash at ${where} outside a step`);
    this.crashSignal();
    return new Promise(() => {}); // never answers: that process is gone
  }

  wrapSend(channel) {
    // As discord.js: messages.fetch({limit}) is the channel's latest, newest first
    const fetchOne = channel.messages.fetch;
    channel.messages.fetch = async (arg) => {
      if (arg && typeof arg === 'object') {
        const list = channel.messageList.filter(m => !m.deleted && !m.ephemeralFor).slice(-(arg.limit || 50)).reverse();
        return new Map(list.map(m => [m.id, m]));
      }
      return fetchOne(arg);
    };
    const real = channel.send.bind(channel);
    channel.send = async (payload) => {
      const fault = this.takeFault('send', snapOf(payload));
      if (['fail', 'gone', 'abort-before'].includes(fault?.mode)) throw this.faultError(fault.mode, 'send');
      if (fault?.mode === 'crash-before') return this.crash(`before sending ${fault.kind} in #${channel.id}`);
      const message = await real(payload);
      this.tagMessage(message);
      if (fault?.mode === 'crash-after') return this.crash(`after sending ${fault.kind} in #${channel.id}`);
      if (fault?.mode === 'abort-after') throw this.faultError('abort-after', 'send');
      return message;
    };
  }

  /** Which siege a message the bot sent belongs to: the one stored when it went */
  tagMessage(message) {
    // A message the bot sent is the bot's (the card search looks for that)
    message.author = { id: BOT.id, bot: true };
    message.kindTag = kindOf(message.snapshot());
    const s = this.siege();
    // R6: a digest notice, or the monster's pending action being announced
    if (message.kindTag === 'other' && s && /^😋 /.test(message.content)) message.kindTag = 'digest';
    else if (message.kindTag === 'other' && s?.pending && s.status === 'live') {
      message.kindTag = 'action';
      message.actionId = s.pending.id;
      message.actionKind = s.pending.kind;
      message.victims = [...s.pending.victims];
      this.pinged.set(s.pending.id, new Set(message.allowedMentions?.users || []));
    }
    message.siegeId = message.kindTag === 'other' ? null : (s?.id ?? null);
    message.sentAt = clock.now;
    // 2.74.0: which night a daily report is for (it's posted on that night)
    if (message.kindTag === 'report') message.night = mods.rules.nightKey(clock.now);
    const real = message.edit.bind(message);
    message.edit = async (payload, via) => {
      const fault = this.takeFault('edit', snapOf(payload));
      if (['fail', 'gone', 'abort-before'].includes(fault?.mode)) throw this.faultError(fault.mode, 'edit');
      if (fault?.mode === 'crash-before') return this.crash(`before editing ${fault.kind} ${message.id}`);
      const out = await real(payload, via);
      if (fault?.mode === 'crash-after' || fault?.mode === 'abort-after') {
        // Edited, but the bot never heard: the next edit may come sooner than a minute
        this.lastEditFaultAt = clock.now;
        if (fault.mode === 'abort-after') throw this.faultError('abort-after', 'edit');
        return this.crash(`after editing ${fault.kind} ${message.id}`);
      }
      return out;
    };
  }

  // ── pauses: two things in flight at once, deterministically ───────────

  /**
   * Hold the nth call of `where` until released:
   *   'channel-fetch' - guild.channels.fetch (the scheduler's and /siege
   *                     end's Discord work starts with one)
   *   'config-read'   - reading this guild's config file (a command's
   *                     awaits between its checks are these)
   * @returns {{reached: Promise, release: () => void, hit: boolean}}
   */
  pause(where, nth = 1) {
    let release;
    let signal;
    const p = { where, nth, seen: 0, hit: false };
    p.reached = new Promise((res) => { signal = res; });
    p.gate = new Promise((res) => { release = res; });
    p.signal = () => { p.hit = true; signal(); };
    p.release = () => release();
    this.pauses.push(p);
    if (where === 'config-read') this.patchConfigReads();
    return p;
  }

  async passPause(where) {
    for (const p of this.pauses) {
      if (p.where !== where || p.hit) continue;
      p.seen += 1;
      if (p.seen === p.nth) {
        p.signal();
        await p.gate;
      }
      return;
    }
  }

  wrapChannelFetch() {
    const channels = this.discord.guild.channels;
    const real = channels.fetch.bind(channels);
    channels.fetch = async (id) => {
      await this.passPause('channel-fetch');
      return real(id);
    };
  }

  patchConfigReads() {
    if (fsp.readFile.__siegeSim) return;
    const real = fsp.readFile;
    const configFile = path.join(process.env.GUILD_CONFIGS_DIR, `${this.guildId}.json`);
    const wrapped = async (file, ...rest) => {
      if (String(file) === configFile && current) await current.passPause('config-read');
      return real.call(fsp, file, ...rest);
    };
    wrapped.__siegeSim = true;
    wrapped.real = real;
    fsp.readFile = wrapped;
  }

  unpatchConfigReads() {
    if (fsp.readFile.__siegeSim) fsp.readFile = fsp.readFile.real;
    this.pauses = this.pauses.filter(p => !p.hit);
  }

  // ── steps ─────────────────────────────────────────────────────────────

  /** Files and counters before a step, to compare after it */
  before() {
    const read = (dir) => {
      const f = path.join(process.env[dir], `${this.guildId}.json`);
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    };
    const s = this.siege();
    return {
      happeningsRaw: read('GUILD_HAPPENINGS_DIR'),
      scoresRaw: read('GUILD_GAMES_DIR'),
      points: this.siegePoints(),
      siege: s ? JSON.parse(JSON.stringify(s)) : null,
      events: this.discord.events.length,
      violations: this.discord.violations.length,
      now: clock.now,
    };
  }

  /**
   * Run one step: a command, a pass, or two at once (`race`). A crash
   * inside it abandons it and restarts the bot. Then every invariant.
   */
  async step(label, fn, ctx = {}) {
    if (!this.paceSaved) {
      this.paceSaved = true;
      await this.configure({ pace: this.pace });
    }
    this.stepNo += 1;
    this.stepFaults = [];
    const before = this.before();
    const errors = [];
    const origError = console.error;
    console.error = (...args) => { errors.push(args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ')); };
    let crashed = false;
    let crash;
    const died = new Promise((res) => { crash = res; });
    this.crashSignal = () => crash('crash');
    try {
      const outcome = await Promise.race([Promise.resolve().then(fn).then(() => 'done'), died]);
      crashed = outcome === 'crash';
    } catch (e) {
      console.error = origError;
      this.fail(label, `threw: ${e.stack || e}`);
    } finally {
      console.error = origError;
      this.crashSignal = null;
    }
    this.steps.push({ no: this.stepNo, label: crashed ? `${label} — 💀 the bot died ${this.crashedAt}` : label, at: before.now });
    if (crashed) await restartBot();
    this.afterStep(label, before, { ...ctx, crashed, errors });
    return { crashed };
  }

  fail(label, message) {
    throw new SimFailure(`[${this.guildId} seed ${this.seed}] after step ${this.stepNo} "${label}":\n${message}`);
  }

  afterRestart() {
    // The play limits are in memory: a restart forgets them
    this.model = { last: {}, times: {} };
    // A new interval starts with the new process
    this.nextTickAt = clock.now + MINUTE;
    this.steps.push({ no: this.stepNo, label: '🔁 restart', at: clock.now });
  }

  /** A restart on its own (a deploy) */
  async restart() {
    await this.step('🔁 restart (deploy)', () => restartBot(), { kind: 'restart' });
  }

  // ── doing things ──────────────────────────────────────────────────────

  interaction(userId, name, { subcommand = null, group = null, options = {}, channel = null, uncached = false } = {}) {
    const i = this.discord.command(userId, name, { subcommand, group, options });
    if (channel) {
      const ch = this.channel(channel);
      i.channel = ch;
      i.channelId = ch.id;
    }
    // discord.js hands a channel it hasn't cached (a thread, often) as null.
    // The answer still goes back through the interaction, so the fake's own
    // bookkeeping (which posts into its channel) sees the real one.
    if (uncached) {
      const real = i.channel;
      i.channel = null;
      for (const name of ['reply', 'deferReply', 'editReply', 'followUp']) {
        const fn = i[name].bind(i);
        i[name] = async (...args) => {
          i.channel = real;
          try { return await fn(...args); } finally { i.channel = null; }
        };
      }
    }
    return i;
  }

  /** Any command, through the real dispatch (rate limits, error reply) */
  async command(userId, name, { subcommand = null, group = null, options = {}, channel = null, uncached = false, force = null, kind = 'command' } = {}) {
    const i = this.interaction(userId, name, { subcommand, group, options, channel, uncached });
    const label = `${userId}: /${name}${group ? ` ${group}` : ''}${subcommand ? ` ${subcommand}` : ''} ${Object.entries(options).map(([k, v]) => `${k}:${typeof v === 'object' ? v.user?.id ?? JSON.stringify(v) : v}`).join(' ')}${channel ? ` in #${this.channel(channel).id}${uncached ? ' (uncached)' : ''}` : ''}`.trim();
    this.forced = force?.r ?? null;
    try {
      await this.step(label, () => mods.dispatch.dispatchCommand(i, mods.commands), { kind, interactions: [i], force });
    } finally {
      this.forced = null;
    }
    i.reply = i.replyMessage;
    return i;
  }

  siegeCmd(userId, subcommand, options = {}, extra = {}) {
    return this.command(userId, 'siege', { subcommand, options, ...extra });
  }

  /** `/siege start` — `minutes` is the `length:` option (one of siege.js's LENGTHS) */
  start({ monster, minutes, length, channel = 'games', by = 'admin' } = {}) {
    const options = {};
    if (monster) options.monster = monster;
    if (minutes || length) options.length = minutes || length;
    return this.siegeCmd(by, 'start', options, { channel });
  }

  end(by = 'admin') {
    return this.siegeCmd(by, 'end');
  }

  status(userId, channel = 'games') {
    return this.siegeCmd(userId, 'status', {}, { channel });
  }

  /**
   * An attack. `force` lands it on that outcome (Math.random pinned onto a
   * line with it, from the real line data, with the item's weights when
   * the item will be used); without it the seeded dice decide.
   */
  attack(userId, weapon, { item = null, channel = 'games', uncached = false, force = null } = {}) {
    const options = { weapon };
    if (item) options.item = item;
    const forced = force ? { outcome: force, r: this.drawFor(userId, weapon, force, item) } : null;
    return this.siegeCmd(userId, 'attack', options, { channel, uncached, force: forced, kind: 'attack' });
  }

  /**
   * `/siege back fighter: points:` (2.75.0) — the fighter given as the User
   * discord.js resolves the option to
   */
  back(userId, fighterId, points, { channel = 'games' } = {}) {
    const fighter = this.discord.who(fighterId);
    return this.siegeCmd(userId, 'back', { fighter: fighter.user, points }, { channel, kind: 'back' });
  }

  /** A play of one of the other games, at a member */
  play(userId, game, targetId, { channel = 'games', item = null } = {}) {
    const target = this.discord.who(targetId);
    const who = { user: target.user, member: target.member };
    const options = game === 'potion'
      ? { user: who, type: this.rand() < 0.5 ? 'health' : 'poison' }
      : { target: who };
    if (item) options.item = item;
    const subcommand = { foodfight: this.rand() < 0.7 ? 'throw' : 'feed', doom: 'fate', rescue: 'attempt', potion: 'give' }[game];
    return this.command(userId, game, { subcommand, options, channel, kind: 'play' });
  }

  /**
   * /rescue attempt at a member — `force` lands it on rescued/caught/sacrificed
   * (Math.random pinned onto such a line, the item's weights included)
   */
  rescue(userId, targetId, { item = null, force = null, channel = 'games' } = {}) {
    const target = this.discord.who(targetId);
    const options = { target: { user: target.user, member: target.member } };
    if (item) options.item = item;
    const forced = force ? { outcome: force, r: this.drawForPlay('rescue', force, { userId, item }) } : null;
    return this.command(userId, 'rescue', { subcommand: 'attempt', options, channel, force: forced, kind: 'play' });
  }

  /** /potion give, a helpful potion (health) by default — `force`: worked/backfired */
  cure(userId, targetId, { type = 'health', item = null, force = null, channel = 'games' } = {}) {
    const target = this.discord.who(targetId);
    const options = { user: { user: target.user, member: target.member }, type };
    if (item) options.item = item;
    const forced = force ? { outcome: force, r: this.drawForPlay('potion', force, { userId, item, type }) } : null;
    return this.command(userId, 'potion', { subcommand: 'give', options, channel, force: forced, kind: 'play' });
  }

  /**
   * A scenario about R5's arithmetic: the monster won't act in this siege
   * (its next action moved past its end). A test's knob on the file, like
   * giveItem — every invariant still holds.
   */
  calm() {
    mods.happenings.mutate(this.guildId, (d) => {
      if (!d.siege) return;
      d.siege.nextActionAt = d.siege.endsAt + 60 * MINUTE;
      // From evening on its clock is busy minutes: past any it could gather
      d.siege.nextActionBusy = 1e9;
    });
  }

  /**
   * From evening on (2.74.0): bring the monster's next action forward to
   * now on its busy clock — a test's knob, like calm(). It still only acts
   * while the drive-in is busy: that's the rule under test, not this.
   */
  hurry() {
    mods.happenings.mutate(this.guildId, (d) => {
      if (d.siege) d.siege.nextActionBusy = mods.store.busyNow(d.siege, clock.now);
    });
  }

  /** The guild config's games settings (twists off, siege frequency…), as an admin would set them */
  async configure(games) {
    const { loadGuildConfig, saveGuildConfig } = await import(src('utils/guildConfig.js'));
    const config = await loadGuildConfig(this.guildId);
    config.games = { ...(config.games || {}), ...games };
    await saveGuildConfig(this.guildId, config);
  }

  /**
   * Steer the monster's next action: queue the luck draws decideAction
   * makes (the kind, each victim, the line) so it does `kind` to `victims`
   * (user ids), from the siege as it is now. Then the passes run until it
   * has acted. Returns its message (null for a void or no action).
   */
  async act(kind, victims = [], { line = 0.5 } = {}) {
    const s = this.siege();
    const m = this.monster(s.monster);
    const { poisonedNow } = mods.store;
    const weights = { ...(m.traits?.actWeights || mods.rewards.SIEGE.actions.weights) };
    if (m.traits?.poisonOnly) weights.grab = 0;
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let at = 0;
    let r = null;
    for (const [k, w] of entries) {
      if (k === kind) r = (at + w / 2) / total;
      at += w;
    }
    if (r === null) throw new Error(`${m.name} can't ${kind}`);
    const draws = [r];
    const at2 = mods.pace.timingsOf(s).busy ? clock.now + MINUTE : s.nextActionAt;
    // Who it picks from: the free fighters — from evening on, only those here (targetsOf)
    let pool = mods.store.targetsOf(s, at2);
    if (kind === 'poison') pool = pool.filter(f => !poisonedNow(s.participants[f.userId], at2));
    if (!(kind === 'grab' && m.traits?.grabTop)) {
      for (const v of victims) {
        const i = pool.findIndex(f => f.userId === v);
        if (i < 0) throw new Error(`${v} isn't a free fighter to ${kind}`);
        draws.push((i + 0.5) / pool.length);
        pool.splice(i, 1);
      }
    }
    draws.push(line);
    this.luckQueue.push(...draws);
    // From evening on its clock is busy minutes: brought forward to now (it
    // still waits for someone to be fighting)
    if (mods.pace.timingsOf(s).busy) this.hurry();
    const before = s.lastAction?.id;
    for (let n = 0; n < 8 && this.siege()?.lastAction?.id === before && this.siege()?.status === 'live'; n++) await this.advance(MINUTE);
    this.luckQueue.length = 0;
    const last = this.siege()?.lastAction;
    return last?.messageId ? this.sends().find(x => x.id === last.messageId) : null;
  }

  drawForPlay(game, outcome, { userId, item = null, type = 'health' }) {
    const effects = mods.rewards.ITEM_EFFECTS;
    const data = this.scores();
    const usable = item && !mods.scores.itemProblem(data, userId, item, { game, action: game === 'rescue' ? 'attempt' : 'give' }, clock.now);
    const weights = usable ? (effects[item]?.[game === 'rescue' ? 'attempt' : 'give']?.weights || {}) : {};
    const { RESCUE_TROPES } = mods.commands.get('rescue');
    for (let k = 0; k < 4000; k++) {
      const r = (k + 0.5) / 4000;
      const lines = game === 'rescue'
        ? mods.rescueLines[RESCUE_TROPES[Math.floor(r * RESCUE_TROPES.length)].value]
        : mods.potionLines[type].map(l => ({ ...l, outcome: l.outcome || 'worked' }));
      if (mods.rules.pickLine(lines, weights, () => r).outcome === outcome) return r;
    }
    throw new Error(`no ${game} draw lands on ${outcome}`);
  }

  /** Switch a game off or on for members (/eggshen-config commands toggle) */
  toggle(setting, enabled) {
    return this.command('admin', 'eggshen-config', { group: 'commands', subcommand: 'toggle', options: { setting, enabled } });
  }

  /** The `item` autocomplete, as Discord would show it (the fake enforces the limits) */
  async suggestItems(userId, weapon) {
    const i = this.discord.autocomplete(userId, 'siege', { subcommand: 'attack', options: weapon ? { weapon } : {}, focused: { name: 'item', value: '' } });
    await mods.commands.get('siege').autocomplete(i);
    if (this.discord.violations.length) this.fail(`${userId}: item autocomplete`, this.discord.violations.join('\n'));
    return i.choices || [];
  }

  /** One scheduler pass at the current clock */
  async tick() {
    return this.step(`⏱️ pass @ ${fmtTime(clock.now)}`, () => mods.scheduler.checkHappenings(this.discord.client, clock.now, { only: this.guildId }), { kind: 'tick' });
  }

  /** Time passes; the scheduler runs each minute, as its interval does */
  async advance(ms) {
    const end = clock.now + ms;
    while (this.nextTickAt <= end) {
      clock.now = this.nextTickAt;
      this.nextTickAt += MINUTE;
      await this.tick();
    }
    clock.now = end;
  }

  /** The clock jumps to `t` with no passes in between (the bot asleep, or nothing to do for hours) */
  jumpTo(t) {
    clock.now = t;
    this.nextTickAt = t + MINUTE;
  }

  /** Two things at once: `a` runs until `pause` is reached, then `b` runs to the end, then `a` finishes */
  async race(label, { a, pause, b }) {
    const ias = [];
    const run = (x) => (x.interaction ? mods.dispatch.dispatchCommand(x.interaction, mods.commands) : mods.scheduler.checkHappenings(this.discord.client, clock.now, { only: this.guildId }));
    for (const x of [a, b]) if (x.interaction) ias.push(x.interaction);
    await this.step(label, async () => {
      const first = run(a);
      const where = await Promise.race([pause.reached.then(() => 'paused'), first.then(() => 'finished')]);
      if (where !== 'paused') throw new Error(`"${label}": the first never reached the pause (${pause.where} #${pause.nth})`);
      await run(b);
      pause.release();
      await first;
    }, { kind: 'race', interactions: ias, race: true });
    this.unpatchConfigReads();
    for (const i of ias) i.reply = i.replyMessage;
    return ias;
  }

  // ── forcing a draw ────────────────────────────────────────────────────

  /** The lines an attack with this weapon draws from (its own, siegeAttackLines.js, as siege.js builds them) */
  poolFor(weapon) {
    const table = mods.rewards.SIEGE.outcomes[weapon];
    return mods.attackLines[weapon].filter(l => Object.hasOwn(table, l.outcome)).map(l => ({ text: l.text, outcome: table[l.outcome] }));
  }

  /** Will this attack use this item? (scored, held, fits, under today's 3) */
  itemUsable(userId, weapon, item) {
    if (!item) return false;
    const data = this.scores();
    const settings = { ...mods.scores.DEFAULT_GAME_SETTINGS, dailyScoredPlays: mods.rewards.SIEGE.scoredPerDay };
    return mods.scores.wouldScore(data, userId, 'siege', settings, clock.now)
      && !mods.scores.itemProblem(data, userId, item, { game: 'siege', action: weapon }, clock.now);
  }

  drawFor(userId, weapon, outcome, item) {
    const weights = this.itemUsable(userId, weapon, item) ? (mods.rewards.SIEGE_ITEM_EFFECTS[item]?.[weapon]?.weights || {}) : {};
    for (let k = 0; k < 4000; k++) {
      const r = (k + 0.5) / 4000;
      if (mods.rules.pickLine(this.poolFor(weapon), weights, () => r).outcome === outcome) return r;
    }
    throw new Error(`no ${weapon} draw lands on ${outcome}`);
  }

  // ── the invariants ────────────────────────────────────────────────────

  track(s) {
    let rec = this.sieges.get(s.id);
    if (!rec) {
      const m = mods.monsters.MONSTERS[s.monster];
      rec = {
        id: s.id,
        monster: s.monster,
        // The spec: round(clamp((b·A7·N + g·F)·D, 40, 2000·N)·monster.hp), F the
        // fighters (or, from evening on, fighter-nights) who joined before
        // its last few minutes; b, g, N the siege's own timings (2, 45, 1 at quick)
        hpFor: (fighters) => mods.store.siegeHp({ a7: s.a7, expected: Number(s.expected) || 0, fighters, dial: s.dial, monsterHp: Number(m.hp) || 1, t: mods.pace.timingsOf(s) }),
        heals: 0,
        assists: {}, // userId → frees and cures the replies announced
        finished: null,
        frozen: null,
        cardEdits: [],
        cardFault: false,
        resultsFault: false,
      };
      this.sieges.set(s.id, rec);
    }
    return rec;
  }

  afterStep(label, before, ctx) {
    const problems = [];
    const say = (msg) => problems.push(msg);

    // ── Discord ──
    for (const v of this.discord.violations.slice(before.violations)) say(`Discord would reject this: ${v}`);
    if (!ctx.crashed) {
      const stepEvents = this.discord.events.slice(before.events);
      for (const i of ctx.interactions || []) {
        if (!i.answered()) say(`${i.label()} never answered — Discord shows "This interaction failed"`);
        // Answered (a reply, or a defer) before the bot sends anything else:
        // Discord allows 3 seconds, and a send before the answer can take
        // longer (rate limits). /siege start posted the card first (review,
        // 2026-11-06).
        // (In a race a scheduler pass may send meanwhile: not this command's.)
        const answer = stepEvents.findIndex(e => ['reply', 'ephemeral'].includes(e.kind) && e.via === i.label());
        const sent = stepEvents.findIndex(e => e.kind === 'send');
        if (!ctx.race && sent >= 0 && (answer < 0 || sent < answer)) say(`${i.label()} sent a message before answering: a slow send would blow Discord's 3 seconds to answer`);
        for (const m of new Set([...i.responses, ...i.edited])) {
          if (GENERIC_ERROR.test(m.text)) say(`${i.label()} answered with a generic error: "${m.text.split('\n')[0]}"`);
        }
      }
    }
    for (const e of ctx.errors) {
      if (/Scheduler pass failed|Command execution error/.test(e)) say(`console.error: ${e.split('\n').slice(0, 6).join('\n')}`);
    }

    const s = this.siege();
    const events = this.discord.events.slice(before.events);

    // A siege whose monster no longer exists is hidden from everything but
    // the raw file: once it's closed there, it counts as finished
    const raw = this.state().siege;
    if (raw && !s && this.sieges.has(raw.id) && raw.status !== 'live') {
      const rec = this.sieges.get(raw.id);
      rec.finished ||= { status: raw.status, hp: raw.hp, maxHp: raw.maxHp, finishedAt: raw.finishedAt, damage: '', inStep: this.stepNo, orphan: true };
      rec.settled = !!(raw.result?.announcedAt || raw.result?.claimedAt);
    }

    // What the monster healed — from the attack's own reply (Gremlins) and
    // from the action messages (the Wolfman): the sums below need it
    const HEAL = /^-# 💚 .+ heals (\d+) HP\.$/m;
    if (ctx.kind === 'attack' && !ctx.crashed) {
      const reply = ctx.interactions[0].replyMessage;
      if (reply && !reply.ephemeralFor && s) this.track(s).heals += Number(HEAL.exec(reply.content)?.[1] || 0);
    }
    for (const e of events) {
      if (e.kind === 'send' && e.message.kindTag === 'action' && e.message.siegeId && this.sieges.has(e.message.siegeId)) {
        // Only an action that was applied healed (one voided after its send didn't)
        const applied = this.state().siege?.lastAction?.id === e.message.actionId && this.state().siege.lastAction.messageId === e.message.id;
        if (applied) this.sieges.get(e.message.siegeId).heals += Number(HEAL.exec(e.message.content)?.[1] || 0);
      }
    }
    // Fighters freed and cured, as the /rescue and /potion replies said (R6).
    // 2.75.0: a free or cure from a play past its game's scoring cap still
    // happens, but only the first SIEGE.credit.unscoredPerNight a member a
    // night are credited — modelled here from the replies: a scored play's
    // always counts; an unscored one counts while the member has fewer than
    // that tonight, and says so when it doesn't. 2.75.1: on a server whose
    // plays don't score, a member's first DEFAULT_GAME_SETTINGS
    // .dailyScoredPlays plays of the game a day count as scored here (the
    // number from the scores file's daily count, which this play just took)
    const scoringOff = this.gameSettings().dailyScoredPlays === 0;
    if (s && !ctx.crashed) {
      for (const i of ctx.interactions || []) {
        if (!['rescue', 'potion'].includes(i.commandName)) continue;
        const reply = i.replyMessage;
        if (!reply || reply.ephemeralFor) continue;
        const rec = this.track(s);
        const u = i.user.id;
        const a = (rec.assists[u] ||= { frees: 0, cures: 0 });
        // (the play's own outcome label can start 🛟/🕯️ too: these are the siege's lines)
        const freed = /^-# (?:🛟 .+ freed .+ from |🕯️ .+ freed .+, and .+ grabbed ).*$/m.exec(reply.content)?.[0];
        const cured = /^-# 🧪 .+ cured .+ of .+'s poison.*$/m.exec(reply.content)?.[0];
        const line = freed || cured;
        if (line) {
          const playOfDay = this.scores().daily?.[u]?.plays?.[i.commandName] || 0;
          const asScored = scoringOff && playOfDay <= mods.scores.DEFAULT_GAME_SETTINGS.dailyScoredPlays;
          const unscored = /scoring cap: just for fun now/.test(reply.content) && !asScored;
          const credited = !/doesn't count toward/.test(line);
          // The siege's night (a campaign's folded first hours are its night 1), as its tallies count it
          const night = `${u}@${this.campaignNightKey(s, clock.now)}`;
          const tonight = (rec.unscoredCredited ||= {})[night] || 0;
          const cap = mods.rewards.SIEGE.credit.unscoredPerNight;
          if (!unscored && !credited) say(`${u}'s scored ${i.commandName} wasn't credited: "${line}"`);
          if (unscored && credited !== (tonight < cap)) say(`${u}'s unscored ${i.commandName} was ${credited ? '' : 'not '}credited with ${tonight} credited tonight (the first ${cap} a night are)`);
          if (unscored && credited) rec.unscoredCredited[night] = tonight + 1;
          if (credited) a[freed ? 'frees' : 'cures'] += 1;
          else (rec.uncredited ||= {})[u] = (rec.uncredited[u] || 0) + 1;
        }
        if (/^-# 🕯️ .+ freed .+, and .+ grabbed /m.test(reply.content)) {
          const me = s.participants?.[u];
          if (me?.caught?.by !== 'sacrifice') say(`${u}'s sacrifice didn't leave them caught: ${JSON.stringify(me?.caught)}`);
          if (!(reply.allowedMentions?.users || []).includes(u)) say(`${u} was caught in a swap without being pinged`);
          // An uncredited sacrifice: in the fight (to be caught), with nothing to their name
          (rec.swapped ||= new Set()).add(u);
        }
      }
    }

    // ── one siege at a time ──
    if (this.lastId && (!s || s.id !== this.lastId) && !(raw && raw.id === this.lastId && !s)) {
      const prev = this.sieges.get(this.lastId);
      // A pass can settle the old results — post them, or give up on their
      // last try — and then start a random siege
      const lastTry = ctx.kind === 'tick' && before.siege?.id === this.lastId && (before.siege.result?.tries || 0) >= mods.rewards.SIEGE.resultTries - 1;
      const postedNow = events.some(e => e.kind === 'send' && e.message.kindTag === 'results' && e.message.siegeId === this.lastId);
      // …or an admin's start posts the last one's held results, Discord
      // refuses them for good (the channel gone) or never answers (it may
      // have posted them), they're given up, and the start goes ahead — in
      // one step. (A refusal for now releases them, and the start waits.)
      const refusedNow = ctx.kind !== 'tick' && this.stepFaults.some(f => f.on === 'send' && f.kind === 'results' && ['gone', 'abort-before'].includes(f.mode));
      if (!prev?.finished) say(`siege ${this.lastId} was replaced while still live`);
      else if (!prev.settled && !lastTry && !postedNow && !refusedNow) say(`siege ${this.lastId} was replaced before its results were settled`);
      this.checkMessageCounts(prev, say, { final: true });
    }

    if (s) {
      // The file as the siege found it: its participation, for the expected fighters (2.74.0)
      if (!this.sieges.has(s.id)) (this.stateAtStart ||= {})[s.id] = before.happeningsRaw ? JSON.parse(before.happeningsRaw) : {};
      const rec = this.track(s);
      this.checkSiege(s, rec, before, ctx, say);
      this.checkCard(s, rec, before, ctx, events, say);
      this.checkResults(s, rec, ctx, say);
      // A crash in a backing may leave a stake with no backer (the finish refunds it)
      if (ctx.crashed && ctx.kind === 'back') rec.orphanable = true;
      this.checkBacking(s, rec, before, ctx, say);
      this.checkHonours(s, rec, before, say);
      this.lastId = s.id;
    }

    // ── what the bot posted in this step ──
    this.noteToldDigests(events);
    for (const e of events) {
      if (e.kind !== 'send') continue;
      const m = e.message;
      if (m.kindTag === 'card' && !/is attacking the drive-in!$/.test(titleOf(e.snap))) say(`an arrival that isn't a live card: "${titleOf(e.snap)}"`);
      // R6: an action message pings exactly its victims, in content, and nobody else
      if (m.kindTag === 'action' || m.kindTag === 'digest') {
        const am = m.allowedMentions || {};
        const users = [...(am.users || [])].sort();
        const shown = [...new Set(mentionsIn(m.content))].sort();
        if ((am.parse || []).length) say(`a ${m.kindTag} message may ping ${JSON.stringify(am.parse)}`);
        if (JSON.stringify(users) !== JSON.stringify(shown)) say(`a ${m.kindTag} message mentions ${shown} but may ping ${users}`);
        if (m.kindTag === 'action' && JSON.stringify(users) !== JSON.stringify([...m.victims].sort())) say(`the ${m.actionKind} message pings ${users}, its victims are ${m.victims}`);
        if (m.kindTag === 'action' && m.actionKind === 'roar' && users.length) say('a roar pinged someone');
      }
      if (m.kindTag !== 'other') {
        const am = m.allowedMentions || {};
        if (m.kindTag === 'card' && (am.users?.length || (am.parse || []).length)) say(`the arrival may ping someone: ${JSON.stringify(am)}`);
      }
    }
    for (const rec of this.sieges.values()) this.checkMessageCounts(rec, say);

    // ── points ──
    this.checkPoints(before, s, ctx, say);

    // ── attacks: what the reply said, and what a refusal didn't do ──
    for (const i of ctx.interactions || []) this.checkPlayLimits(i, ctx, say);
    if (ctx.kind === 'attack' && !ctx.crashed) this.checkAttack(ctx.interactions[0], before, s, ctx, say);
    if (ctx.kind === 'back' && !ctx.crashed) this.checkBack(ctx.interactions[0], before, s, say);
    if (!ctx.crashed) for (const i of ctx.interactions || []) this.checkStatusReply(i, s, say);

    if (problems.length) {
      const errs = ctx.errors.length ? `\nconsole.error:\n  ${ctx.errors.map(e => e.split('\n')[0]).join('\n  ')}` : '';
      this.fail(label, `${problems.join('\n')}${errs}`);
    }
  }

  checkSiege(s, rec, before, ctx, say) {
    const m = mods.monsters.MONSTERS[s.monster];
    if (!m) return say(`siege ${s.id} has an unknown monster ${s.monster}`);
    if (!Number.isInteger(s.hp) || !Number.isInteger(s.maxHp)) say(`HP isn't whole: ${s.hp}/${s.maxHp}`);
    if (s.hp < 0 || s.hp > s.maxHp) say(`HP out of range: ${s.hp}/${s.maxHp}`);
    const parts = Object.entries(s.participants || {});
    // maxHp: the formula's, with every fighter who joined before the last
    // `t.noGrowth` minutes counted (it only grows on a first attack) — or,
    // from evening on, every fighter-night: each member's first attack of a night
    const growers = this.growers(s);
    const expectedMax = rec.hpFor(growers);
    if (s.maxHp !== expectedMax) say(`maxHp ${s.maxHp}, but the formula with ${growers} ${mods.pace.timingsOf(s).growthPer === 'night' ? 'fighter-nights' : 'fighters'} (of ${parts.length}) is ${expectedMax}`);
    this.checkPace(s, rec, before, ctx, say);
    // Credit is the HP actually removed
    let dealt = 0;
    for (const [uid, p] of parts) {
      if (!Number.isInteger(p.damage) || p.damage < 0) say(`${uid}'s damage is ${p.damage}`);
      if (!(p.attacks >= 1) && !(p.frees > 0 || p.cures > 0) && !rec.swapped?.has(uid)) say(`${uid} is a participant with no attacks, frees or cures`);
      // Frees and cures: exactly what the replies announced
      const seen = rec.assists[uid] || { frees: 0, cures: 0 };
      if ((p.frees || 0) !== seen.frees || (p.cures || 0) !== seen.cures) say(`${uid} has ${p.frees} frees and ${p.cures} cures stored, but the replies announced ${seen.frees} and ${seen.cures}`);
      dealt += p.damage || 0;
    }
    const removed = s.maxHp - s.hp + rec.heals;
    if (dealt !== removed) say(`fighters are credited ${dealt} damage, but the HP removed is ${removed} (max ${s.maxHp} − hp ${s.hp} + heals ${rec.heals})`);
    if ((s.healed || 0) !== rec.heals) say(`the store says the monster healed ${s.healed}, the messages said ${rec.heals}`);
    this.checkFightsBack(s, rec, before, ctx, say);

    if (rec.finished && !rec.finished.orphan) {
      const f = rec.finished;
      if (s.status !== f.status) say(`a ${f.status} siege became ${s.status}`);
      if (s.hp !== f.hp || s.maxHp !== f.maxHp) say(`a finished siege's HP changed: ${f.hp}/${f.maxHp} → ${s.hp}/${s.maxHp}`);
      if (s.finishedAt !== f.finishedAt) say('a finished siege\'s finishedAt changed');
      if (JSON.stringify(parts.map(([u, p]) => [u, p.damage])) !== f.damage) say('a finished siege\'s damage changed');
    } else if (s.status !== 'live') {
      rec.finished = { status: s.status, hp: s.hp, maxHp: s.maxHp, finishedAt: s.finishedAt, damage: JSON.stringify(parts.map(([u, p]) => [u, p.damage])), inStep: this.stepNo };
      if (!s.result || s.result.status !== s.status) say(`finished as ${s.status} with result ${JSON.stringify(s.result)}`);
      if (s.status === 'won' && s.hp > 0) say(`won with ${s.hp} HP left`);
      if (s.status === 'ended' && s.result?.grants?.length) say('an admin\'s end paid out');
      if (Object.values(s.participants || {}).some(p => p.poison)) say('a poison outlived its siege');
    }
    // A pass leaves no live siege that should be over
    if (ctx.kind === 'tick' && !ctx.crashed && s.status === 'live') {
      if (!(s.hp > 0)) say('a pass left a live siege at 0 HP');
      if (clock.now >= s.endsAt) say('a pass left a live siege past its end');
    }
    // Settled: finished, and the results posted, given up on, or claimed (a claim is never retried)
    rec.settled = s.status !== 'live' && !!(s.result?.announcedAt || s.result?.claimedAt);
  }

  /** R6: the monster's actions, grabs, poisons and digests */
  checkFightsBack(s, rec, before, ctx, say) {
    const { isCaught, isFree, poisonedNow } = mods.store;
    const all = Object.entries(s.participants || {});
    if (s.status !== 'live') {
      if (s.pending) say('a finished siege still has a pending action');
      for (const [u, p] of all) if (isCaught(p) || p.poisoned) say(`${u} is still caught or poisoned after the siege ended`);
      return;
    }
    // 2.74.0: every window stored is the siege's own (its timings, never a fixed number):
    // a grab (or a sacrifice's swap) t.freeMinutes, a poisoning that wears off t.poisonMinutes
    const t = mods.pace.timingsOf(s);
    for (const [u, p] of all) {
      if (p.caught?.at && p.caught.until - p.caught.at !== t.freeMinutes * MINUTE) say(`${u}'s grab lasts ${(p.caught.until - p.caught.at) / MINUTE} min, the siege's window is ${t.freeMinutes}`);
      if (p.poisoned && p.poisoned.until !== null && p.poisoned.until - p.poisoned.at !== t.poisonMinutes * MINUTE) say(`${u}'s poisoning lasts ${(p.poisoned.until - p.poisoned.at) / MINUTE} min, the siege's is ${t.poisonMinutes}`);
      if (p.out && Number.isFinite(p.outUntil) && !t.outMinutes) say(`${u} is out until a time at a pace that digests for the siege`);
    }
    // Every grab and poison by the monster reached its victim: their action's message pinged them
    for (const [u, p] of all) {
      for (const [what, x] of [['caught', p.caught], ['poisoned', p.poisoned]]) {
        if (!x || x.by !== 'monster') continue;
        if (!this.pinged.get(x.actionId)?.has(u)) say(`${u} is ${what} by action ${x.actionId}, whose message didn't ping them`);
      }
    }
    if (ctx.kind === 'tick' && !ctx.crashed && !ctx.race) {
      // A pass leaves nothing it decided unannounced, nor anything past the
      // void window (one claimed before a restart may wait out its 90 s)
      const voidMs = mods.rewards.SIEGE.actions.voidSeconds * 1000;
      if (s.pending && (s.pending.claimedAt === clock.now || clock.now - s.pending.claimedAt >= voidMs)) say(`a pass left the action ${s.pending.id} pending (claimed ${Math.round((clock.now - s.pending.claimedAt) / 1000)}s ago)`);
      for (const [u, p] of all) if (isCaught(p) && clock.now >= p.caught.until) say(`${u} is past their rescue window and not digested`);
    }
    // Never the last free fighter: a grab in this step left someone free
    const last = s.lastAction;
    if (last && last.id !== before.siege?.lastAction?.id && last.kind === 'grab' && before.siege?.id === s.id) {
      const freeBefore = Object.values(before.siege.participants || {}).filter(isFree).length;
      if (freeBefore >= 1 && !all.some(([, p]) => isFree(p))) say('the monster grabbed the last free fighter');
    }
    for (const [u, p] of all) {
      if (p.poisoned && !poisonedNow(p, clock.now) && ctx.kind === 'tick' && !ctx.crashed) say(`${u}'s poisoning ran out but wasn't cleared by the pass`);
    }
  }

  checkCard(s, rec, before, ctx, events, say) {
    const card = s.card;
    if (!card?.messageId || card.gone) return;
    const msg = this.channel(s.channelId).messageList.find(x => x.id === card.messageId);
    if (!msg) return say(`the card ${card.messageId} isn't a message in #${s.channelId}`);
    const snap = msg.snapshot();
    const finished = s.status !== 'live';
    // While nothing is waiting to be edited, the card shows what's stored
    if (!card.dirty) {
      const hp = `\`${Math.max(0, s.hp)}/${Math.max(1, s.maxHp)}\``;
      if (!descriptionOf(snap).includes(hp)) say(`the card shows "${descriptionOf(snap).split('\n')[1]}" but the store has ${hp} (not dirty)`);
      const want = mods.monsters.MONSTERS[s.monster].name;
      const title = titleOf(snap);
      const ok = s.status === 'live' ? title.endsWith(`${want} is attacking the drive-in!`)
        : s.status === 'won' ? title.endsWith(`${want} is beaten!`)
          : s.status === 'escaped' ? title.endsWith(`${want} got away!`)
            : title.endsWith('the siege was called off');
      if (!ok) say(`the card's title "${title}" doesn't match a ${s.status} siege`);
    }
    // A pass, or a /siege end that finished it, leaves the card up to date
    // (an end that found nothing on leaves the card to the next pass)
    const endedHere = ctx.kind === 'command' && /\/siege end/.test(ctx.interactions?.[0]?.label?.() || '')
      && before.siege?.id === s.id && before.siege.status === 'live' && s.status !== 'live';
    const settledStep = !ctx.crashed && (ctx.kind === 'tick' || endedHere);
    const editFaulted = this.stepFaults.some(f => f.on === 'edit' && f.kind === 'card');
    if (settledStep && !ctx.race && !editFaulted && !card.gone) {
      if (finished && card.dirty) say('a finished siege\'s card is still waiting for its last edit after a pass');
      // (2.74.0: at the siege's own cadence, busy or not)
      if (!finished && ctx.kind === 'tick' && card.dirty && clock.now - (card.editedAt || 0) >= mods.pace.timingsOf(s).cardEditSeconds * 1000) {
        say(`the card is stale after a pass: dirty, last edited ${Math.round((clock.now - card.editedAt) / 1000)}s ago`);
      }
    }
    // At most one edit a minute while the fight is on
    for (const e of events) {
      if (e.kind !== 'edit' || e.message.id !== card.messageId) continue;
      const live = /is attacking the drive-in!$/.test(titleOf(e.snap));
      const prev = rec.cardEdits.at(-1);
      if (live && prev?.live && e.at - prev.at < mods.pace.timingsOf(s).cardEditSeconds * 1000 && prev.at !== this.lastEditFaultAt) {
        say(`the live card was edited ${Math.round((e.at - prev.at) / 1000)}s after the last edit`);
      }
      rec.cardEdits.push({ at: e.at, live });
    }
    // Frozen: once it shows the end, it never changes again
    const json = JSON.stringify(snap);
    if (rec.frozen && rec.frozen !== json) say('the frozen card changed');
    if (!rec.frozen && finished && !/is attacking the drive-in!$/.test(titleOf(snap))) rec.frozen = json;
    if (finished && rec.frozen && /Fight it with/.test(snap.content)) say('a frozen card still says "Fight it"');
  }

  checkResults(s, rec, ctx, say) {
    const results = this.messagesFor(s.id, 'results');
    for (const m of results) {
      if (rec.checkedResults?.has(m.id)) continue;
      (rec.checkedResults ||= new Set()).add(m.id);
      // Fighters as the results count them: attacked, or freed or cured someone (contribution)
      const fighters = new Set(mods.store.fightersOf(s).map(f => f.userId));
      const am = m.allowedMentions || {};
      const users = am.users || [];
      if ((am.parse || []).length) say(`the results may ping ${JSON.stringify(am.parse)}`);
      if (users.length > mods.rewards.SIEGE.pingMax) say(`the results ping ${users.length} users`);
      for (const u of users) if (!fighters.has(u)) say(`the results ping ${u}, who didn't fight`);
      const shown = mentionsIn(m.content);
      if (JSON.stringify([...new Set(shown)].sort()) !== JSON.stringify([...new Set(users)].sort())) say(`the results mention ${shown} but may ping ${users}`);
      // The fighters best first, up to pingMax — and every digest no report
      // reached (result.told, the claim's unreported), who take the last
      // places if they aren't among the first (2.74.0)
      const max = mods.rewards.SIEGE.pingMax;
      const told = [...new Set(s.result?.told || [])];
      const ids = (s.result?.grants || []).map(g => g.userId);
      const want = new Set([...told, ...ids.filter(id => !told.includes(id)).slice(0, Math.max(0, max - told.length))]);
      if (JSON.stringify([...want].sort()) !== JSON.stringify([...users].sort())) say(`the results ping ${users}, but the first ${max} grants with the untold digests are ${[...want]}`);
      for (const id of told) {
        const name = s.participants?.[id]?.name;
        const line = (m.content || '').split('\n').find(l => l.startsWith('😋 Digested while nobody was around:')) || '';
        if (name && !line.includes(name)) say(`the results don't name ${name}, digested while nobody was around and never reported`);
      }
      if (s.status === 'ended') say('an admin\'s end posted results');
    }
    if (s.status === 'ended' && results.length) say('an ended siege has a results message');
    // After a pass that wasn't cut short, a won or escaped siege's results
    // are settled as the store says: posted once (and that's the message
    // stored), given up with nothing posted (Discord refused, or no channel
    // for SIEGE.resultTries passes), given up maybe posted (a send that may
    // have gone out: never more than one, checked above) — or still waiting
    // only because Discord refused this pass or the bot can't post there
    if (ctx.kind !== 'tick' || ctx.crashed || ctx.race || !['won', 'escaped'].includes(s.status)) return;
    const r = s.result || {};
    const postable = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks].every(f => this.perms.get(s.channelId)?.has(f));
    const refusedNow = this.stepFaults.some(f => f.kind === 'results' && ['fail', 'gone', 'abort-before'].includes(f.mode));
    // 2.74.0: an escape's held results wait for a game played after it (or holdUntil)
    const held = mods.store.resultsHeld(s, this.state(), clock.now);
    if (!r.announcedAt) {
      if (postable && !refusedNow && !r.claimedAt && !held) say(`a ${s.status} siege's results are still waiting after a pass the bot could post in`);
    } else if (!r.unannounced) {
      if (results.length !== 1) say(`a ${s.status} siege has ${results.length} results messages after a pass`);
      else if (r.messageId && r.messageId !== results[0].id) say('the stored results message isn\'t the one posted');
    } else if (['no-channel', 'send-failed', 'refused'].includes(r.unannounced) && results.length) {
      say(`results given up as "${r.unannounced}" but ${results.length} were posted`);
    }
  }

  // ── 2.75.0: the real hero ─────────────────────────────────────────────

  /**
   * The fighters best first, worked out here (not read from the store):
   * contribution — damage + SIEGE.credit's free·frees + cure·cures +
   * boost·boostHits — then who joined first, then the id
   */
  ranked(s) {
    const c = mods.rewards.SIEGE.credit;
    const help = (p) => c.free * (p.frees || 0) + c.cure * (p.cures || 0) + c.boost * (p.boostHits || 0);
    return Object.entries(s.participants || {})
      .map(([userId, p]) => ({ userId, name: p.name, help: help(p), contribution: (p.damage || 0) + help(p), attacks: p.attacks || 0, firstAt: p.firstAt || 0 }))
      .filter(f => f.attacks > 0 || f.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution || a.firstAt - b.firstAt || (a.userId < b.userId ? -1 : 1));
  }

  /** The Wang Chi, worked out here: the most help (first in ranked order on a tie), if ≥ wangChiMinHelp; else the top contributor, held */
  wangChiModel(s) {
    const fighters = this.ranked(s);
    if (!fighters.length) return null;
    let best = fighters[0];
    for (const f of fighters) if (f.help > best.help) best = f;
    return best.help >= mods.rewards.SIEGE.rewards.wangChiMinHelp ? { userId: best.userId, held: false } : { userId: fighters[0].userId, held: true };
  }

  /**
   * Backing's promises: when, on whom, for what — every stake taken is a
   * backer with that stake (or a crash's orphan), and none is left once the
   * siege has paid out; at the finish, each settlement is the matrix
   */
  checkBacking(s, rec, before, ctx, say) {
    const B = mods.rewards.SIEGE.backing;
    const closes = mods.store.backingClosesAt(s);
    const backers = s.backers || {};
    for (const [u, b] of Object.entries(backers)) {
      if (!(b.at < closes)) say(`${u} backed ${b.fighterId} at ${fmtTime(b.at)}, after backing closed at ${fmtTime(closes)}`);
      if (b.fighterId === u) say(`${u} backed themselves`);
      if (!(s.participants?.[b.fighterId]?.attacks > 0)) say(`${u} backed ${b.fighterId}, who hasn't attacked`);
      if (!(Number.isInteger(b.stake) && b.stake >= B.min && b.stake <= B.max)) say(`${u} staked ${b.stake}`);
    }
    const scores = this.scores();
    const stakes = scores.backStakes || {};
    const prefix = `${s.id}:`;
    const mine = Object.entries(stakes).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]);
    const paidOut = Object.hasOwn(scores.siegesPaid || {}, s.id);
    if (s.status === 'live' && !paidOut) {
      for (const [u, b] of Object.entries(backers)) {
        const taken = stakes[prefix + u];
        if (!taken || taken.stake !== b.stake) say(`${u} backs ${b.fighterId} for ${b.stake}, but the stake taken is ${JSON.stringify(taken)}`);
      }
      for (const [u, v] of mine) if (!backers[u] && !rec.orphanable) say(`${v.stake} was taken from ${u} with no backing on the siege`);
    }
    if (s.status === 'live' || !s.result) return;
    if (mine.length) say(`siege ${s.id} has paid out, but still holds stakes: ${mine.map(([u]) => u)}`);
    // The settlement, worked out here
    const r = s.result;
    const fighters = this.ranked(s);
    const enough = fighters.length >= B.minFighters;
    const top3 = fighters.slice(0, 3).map(f => f.userId);
    const shown = (r.backing || []).filter(b => !b.orphan);
    if (JSON.stringify(shown.map(b => b.backerId).sort()) !== JSON.stringify(Object.keys(backers).sort())) say(`the settled backers ${shown.map(b => b.backerId)} aren't the siege's ${Object.keys(backers)}`);
    const theirs = [];
    for (const b of shown) {
      const want = r.status === 'won' && enough
        ? (b.fighterId === r.wangChi?.userId ? 'wangChi' : top3.includes(b.fighterId) || b.fighterId === r.jack?.userId ? 'push' : 'lost')
        : r.status === 'escaped' && enough ? 'escaped' : 'refunded';
      const back = { wangChi: B.payout * b.stake, push: b.stake, refunded: b.stake, lost: 0, escaped: 0 }[want];
      if (b.outcome !== want || b.back !== back) say(`${b.backerId} backed ${b.fighterId} (${b.stake}) in a ${r.status} siege of ${fighters.length}: settled ${b.outcome} ${b.back}, the matrix says ${want} ${back}`);
      if (want === 'wangChi') theirs.push(b);
    }
    // The fighter's share: once, on the largest stake (the earliest of equals), ⌈stake × fighterShare⌉
    const largest = theirs.reduce((a, b) => (!a || b.stake > a.stake || (b.stake === a.stake && backers[b.backerId].at < backers[a.backerId].at) ? b : a), null);
    for (const b of shown) {
      const want = b === largest ? Math.ceil(b.stake * B.fighterShare) : 0;
      if (b.bonus !== want) say(`${b.backerId}'s settlement carries a fighter's bonus of ${b.bonus}, expected ${want}`);
    }
    const g = largest && (r.grants || []).find(x => x.userId === largest.fighterId);
    if (g && !g.limited && g.backBonus !== largest.bonus) say(`the Wang Chi ${g.userId}'s grant has backBonus ${g.backBonus}, their backers earned them ${largest.bonus}`);
    for (const x of r.grants || []) if (x.backBonus && x !== g) say(`${x.userId} has a backBonus without being the backed Wang Chi`);
  }

  /** The honours: only on a win with company; the Wang Chi and the Jack Burton as worked out here, ×H */
  checkHonours(s, rec, before, say) {
    if (s.status === 'live' || !s.result || rec.honoursChecked) return;
    rec.honoursChecked = true;
    const r = s.result;
    const grants = r.grants || [];
    const won = r.status === 'won' && grants.length >= 2;
    if (!won) {
      if (r.wangChi || r.jack) say(`a ${r.status} siege of ${grants.length} has honours: ${JSON.stringify({ wangChi: r.wangChi, jack: r.jack })}`);
      for (const g of grants) if (g.wangChi || g.jack || g.honour) say(`${g.userId} got honours in a ${r.status} siege of ${grants.length}`);
      return;
    }
    // A siege from before 2.75.0 (no `honours` stamp) may be paid the old way: not modelled here
    if (!s.honours) return;
    const H = mods.pace.timingsOf(s).honour;
    const { wangChiBonus, jackBonus } = mods.rewards.SIEGE.rewards;
    const wc = this.wangChiModel(s);
    const jack = s.killingBlow?.userId || null;
    if (r.wangChi?.userId !== wc.userId || !!r.wangChi?.held !== wc.held) say(`the Wang Chi is ${JSON.stringify(r.wangChi)}, the model says ${JSON.stringify(wc)}`);
    if ((r.jack?.userId || null) !== jack) say(`the Jack Burton is ${r.jack?.userId}, the killing blow was ${jack}`);
    for (const g of grants) {
      if (g.limited) continue;
      const want = (g.userId === wc.userId ? wangChiBonus * H : 0) + (g.userId === jack ? jackBonus * H : 0);
      if (!!g.wangChi !== (g.userId === wc.userId) || !!g.jack !== (g.userId === jack) || g.honour !== want) {
        say(`${g.userId}'s honours: wangChi ${g.wangChi}, jack ${g.jack}, +${g.honour}; expected ${g.userId === wc.userId}, ${g.userId === jack}, +${want} (H ${H})`);
      }
      if (g.mvp !== !!g.wangChi) say(`${g.userId}'s mvp (${g.mvp}) isn't their Wang Chi (${g.wangChi})`);
    }
  }

  /** A /siege back reply against the store: a refusal changed nothing; a backing is stored, staked and pings nobody */
  checkBack(i, before, s, say) {
    const reply = i.replyMessage;
    if (!reply) return;
    const u = i.user.id;
    if (reply.ephemeralFor) {
      const after = this.before();
      if (after.happeningsRaw !== before.happeningsRaw) say(`${u}'s refused backing ("${reply.content}") changed the happenings file`);
      if (after.scoresRaw !== before.scoresRaw) say(`${u}'s refused backing ("${reply.content}") changed the scores file`);
      return;
    }
    const b = s?.backers?.[u];
    if (!b) return say(`${u}'s backing was announced but isn't on the siege`);
    if (before.siege?.backers?.[u]) say(`${u} backed twice in one siege`);
    if (b.fighterId !== i.options.getUser('fighter')?.id || b.stake !== i.options.getInteger('points')) say(`${u}'s backing stored ${JSON.stringify(b)}`);
    const am = reply.allowedMentions || {};
    if ((am.parse || []).length || (am.users || []).length || mentionsIn(reply.content).length) say(`${u}'s backing may ping someone: ${JSON.stringify(am)}`);
    if (!reply.content.includes(`−${b.stake} (staked)`)) say(`${u}'s backing doesn't say what it staked: ${reply.content}`);
  }

  /**
   * The night key a siege counts `at` toward, by the spec rather than the
   * store: 12:00 to 12:00 UTC, but a 3-day or week campaign's hours before
   * its first counted boundary (6 hours on at least) are its night 1
   */
  campaignNightKey(s, at) {
    const t = mods.pace.timingsOf(s);
    if (t.nightEnd) {
      const first = mods.pace.nightBoundaryAtOrAfter(s.startedAt + mods.rewards.PACE_RULES.firstNightMinHours * 60 * MINUTE);
      if (at < first) return mods.rules.nightKey(first - 1);
    }
    return mods.rules.nightKey(at);
  }

  /**
   * The fighters (quick) or fighter-nights (from evening on) that grew the
   * monster: those before its last `t.noGrowth` minutes
   */
  growers(s) {
    const t = mods.pace.timingsOf(s);
    const cutoff = s.endsAt - t.noGrowth * MINUTE;
    const parts = Object.values(s.participants || {});
    if (t.growthPer === 'night') return parts.reduce((n, p) => n + Object.values(p.nights || {}).filter(at => at < cutoff).length, 0);
    return parts.filter(p => p.attacks > 0 && p.firstAttackAt < cutoff).length;
  }

  /**
   * 2.74.0, the pace's promises (see the top of this file): busy-only
   * actions and digest pings, the allowance, the fighter-night count, one
   * report a night pinging nobody, held results, the night-boundary end.
   */
  checkPace(s, rec, before, ctx, say) {
    const t = mods.pace.timingsOf(s);
    const { isBusy, attacksTonight } = mods.store;
    const events = this.discord.events.slice(before.events).filter(e => e.kind === 'send');
    const was = before.siege?.id === s.id ? before.siege : null;
    const DAYMS = 24 * 60 * MINUTE;
    // The night boundary: a 3-day or week campaign ends at the one closing its Nth counted night
    if (t.nightEnd && s.endsAt !== mods.pace.firstNightBoundary(s.startedAt, t) + (t.N - 1) * DAYMS) {
      say(`a ${t.key} siege of ${t.N} nights ends at ${new Date(s.endsAt).toISOString()}, not its ${t.N}th counted night boundary`);
    }
    if (t.growthPer === 'night' && (Number(s.fn) || 0) !== this.growers(s)) say(`the store counts ${s.fn} fighter-nights that grew it, the sim ${this.growers(s)}`);
    // From day on its base counts the fighters it expects: E = clamp(round(A7 × participation), 2, A7)
    if (t.hpBase === 'fighters' && s.t) {
      const p = mods.store.participationOf(this.stateAtStart?.[s.id] ?? {}, t.key);
      if (this.stateAtStart?.[s.id] && s.expected !== mods.store.expectedFighters(s.a7, p)) say(`siege expects ${s.expected} fighters, A7 ${s.a7} × participation ${p} says ${mods.store.expectedFighters(s.a7, p)}`);
      if (!(s.expected >= Math.min(2, s.a7) && s.expected <= s.a7)) say(`siege expects ${s.expected} fighters of A7 ${s.a7}`);
    }
    for (const [u, p] of Object.entries(s.participants || {})) {
      if (t.allowance && attacksTonight(p, clock.now, s) > t.allowance) say(`${u} made ${attacksTonight(p, clock.now, s)} attacks tonight, over the allowance of ${t.allowance}`);
      // A campaign over days has N allowance windows for its N nights, and a member at most N fighter-nights
      if (t.nightEnd && Object.keys(p.nights || {}).length > t.N) say(`${u} has ${Object.keys(p.nights).length} fighter-nights in a campaign of ${t.N} nights`);
      if (t.allowance && p.night !== undefined && Object.keys(p.nights || {}).length && !Object.hasOwn(p.nights, p.night)) say(`${u}'s allowance counts night ${p.night}, a night they never fought`);
      if (!t.allowance && (p.night !== undefined || p.nightAttacks !== undefined)) say(`${u} has an attack count at a pace with no allowance`);
    }
    // Busy: the monster acts only while someone fought in the last 30 minutes, and only on those
    // who did (attacked, freed or cured) — and at a pace with a report, a digest pings only then
    for (const e of events) {
      const m = e.message;
      if (m.siegeId !== s.id || !was) continue;
      if (m.kindTag === 'action' && t.busy && !isBusy(was, clock.now)) say(`a ${m.actionKind} message went out while nobody was fighting (last attack ${was.lastAttackAt ? `${Math.round((clock.now - was.lastAttackAt) / MINUTE)} min` : 'never'} ago)`);
      if (m.kindTag === 'action' && t.busy) {
        for (const v of m.victims || []) {
          const last = Number(was.participants?.[v]?.lastAt) || 0;
          if (!(clock.now - last < mods.rewards.PACE_RULES.busyMinutes * MINUTE)) say(`the monster's ${m.actionKind} took ${v}, who last fought ${Math.round((clock.now - last) / MINUTE)} min ago`);
        }
      }
      // …unless no report is left to keep it for: then it's told at once, whatever the hour (review, 2026-11-06)
      if (m.kindTag === 'digest' && t.report && !isBusy(was, clock.now) && mods.store.reportToCome(was, clock.now)) say(`a digest message went out while nobody was fighting (last attack ${was.lastAttackAt ? `${Math.round((clock.now - was.lastAttackAt) / MINUTE)} min` : 'never'} ago), with a report still to come`);
    }
    // A digest is told: pinged at once — or, at a pace with a report and nobody around, kept for the report
    if (was && s.status === 'live') {
      const pinged = new Set(events.filter(e => e.message.kindTag === 'digest').flatMap(e => e.message.allowedMentions?.users || []));
      const reported = events.some(e => e.message.kindTag === 'report');
      const postable = ['ViewChannel', 'SendMessages', 'EmbedLinks'].every(f => this.perms.get(s.channelId)?.has(PermissionFlagsBits[f]));
      const faulted = this.stepFaults.some(f => f.on === 'send' && f.kind === 'other');
      for (const [u, p] of Object.entries(s.participants || {})) {
        if (!p.out || was.participants?.[u]?.out || ctx.crashed) continue;
        const kept = (s.unreported || []).some(d => d.userId === u);
        if (!t.report && !pinged.has(u) && postable && !faulted) say(`${u} was digested at a pace with no report and wasn't told`);
        if (t.report && !pinged.has(u) && !reported && !kept) say(`${u} was digested and neither pinged nor kept for the report`);
      }
    }
    // Every digest kept for a report is told in the end: named in a report's
    // digest field or in the results' digest line. One kept on a campaign's
    // last night waited for a report that never came (review, 2026-11-06);
    // finalChecks fails any still untold once the results are out.
    // (Told: noteToldDigests, for every siege's messages — an admin's start
    // can post the last one's held results in the step that replaces it.)
    rec.kept ||= new Map();
    rec.told ||= new Set();
    for (const d of s.unreported || []) {
      const k = `${d.userId}:${d.at}`;
      if (!rec.told.has(k)) rec.kept.set(k, d.name);
    }
    // The daily report: one a night at most, never before its first counted night is over, pinging nobody, from `day` on
    const reports = this.messagesFor(s.id, 'report');
    if (!t.report && reports.length) say(`a ${t.key} siege posted a daily report`);
    const nights = new Map();
    for (const m of reports) nights.set(m.night, (nights.get(m.night) || 0) + 1);
    for (const [night, n] of nights) if (n > 1) say(`siege ${s.id} posted ${n} reports for the night of ${night}`);
    for (const m of reports) if (m.sentAt < mods.pace.firstNightBoundary(s.startedAt, t)) say(`a report went out ${Math.round((m.sentAt - s.startedAt) / MINUTE)} min into the siege, before its first night was over`);
    for (const e of events) {
      if (e.message.kindTag !== 'report' || e.message.siegeId !== s.id) continue;
      const am = e.message.allowedMentions || {};
      if ((am.parse || []).length || (am.users || []).length || mentionsIn(e.message.content).length) say(`a daily report may ping someone: ${JSON.stringify(am)}`);
      // Every digest kept for it is named in it, and the night it names is the one just closed
      const named = JSON.stringify(e.snap?.embeds || []);
      for (const d of was?.unreported || []) if (!named.includes(d.name)) say(`the report doesn't name ${d.name}, digested while nobody was around`);
      const number = mods.pace.campaignNight(s.startedAt, clock.now, t) - 1;
      if (!e.snap?.content?.startsWith(`📰 **Night ${number} is over**`)) say(`the report says "${e.snap?.content?.split('\n')[0]}", but night ${number} just closed`);
    }
    // Held results: posted by a pass only after someone played (or holdUntil)
    if (ctx.kind === 'tick' && s.result?.holdUntil) {
      for (const e of events) {
        if (e.message.kindTag !== 'results' || e.message.siegeId !== s.id) continue;
        const played = Number(this.state().activity?.at) || 0;
        if (!(played > s.finishedAt) && clock.now < s.result.holdUntil) say('held results were posted with nobody having played since the escape');
      }
    }
    if (s.result?.holdUntil && (s.status !== 'escaped' || !t.holdResults)) say(`a ${s.status} siege at ${t.key} pace has its results held`);
    if (s.result?.holdUntil) rec.held = true;
  }

  checkMessageCounts(rec, say, { final = false } = {}) {
    if (!rec) return;
    const arrivals = this.messagesFor(rec.id, 'card');
    const results = this.messagesFor(rec.id, 'results');
    if (arrivals.length > 1) say(`siege ${rec.id} has ${arrivals.length} arrival messages`);
    if (results.length > 1) say(`siege ${rec.id} has ${results.length} results messages`);
    if (final && !rec.cardFault && arrivals.length !== 1 && !rec.startRefused) say(`siege ${rec.id} had ${arrivals.length} arrival messages`);
  }

  /**
   * Siege points move only on an attack (the attacker's, by what the reply
   * says) and on a finish (each grant's total, once). Anything else moving
   * them — a second payout, a refused attack, a tick — fails here.
   */
  checkPoints(before, s, ctx, say) {
    const after = this.siegePoints();
    const expected = { ...before.points };
    const add = (u, n) => { expected[u] = (expected[u] ?? 0) + n; };
    // A finish in this step pays its grants — and (2.75.0) each backer's
    // settlement, orphaned stakes' refunds included, less what a grab took
    // from a stake while it was out (`owed`). A siege the scores file had
    // already paid (a kill between an admin's end's two saves) pays nothing
    // again: only a stake taken since, refunded
    const finished = s && s.status !== 'live' && ((before.siege?.id === s.id && before.siege.status === 'live') || !before.siege);
    if (finished) {
      const paidBefore = (before.scoresRaw ? JSON.parse(before.scoresRaw) : {}).siegesPaid?.[s.id];
      const known = new Set((paidBefore?.backing || []).map(b => b.backerId));
      if (!paidBefore) for (const g of s.result?.grants || []) add(g.userId, g.total);
      // (the stake's part comes back less `owed`; a lost stake forgives it)
      const moved = (b) => Math.max(0, Math.min(b.back, b.stake) - (b.owed || 0)) + Math.max(0, b.back - b.stake);
      for (const b of s.result?.backing || []) if (!known.has(b.backerId)) add(b.backerId, moved(b));
    }
    // 2.75.0: a backing placed takes its stake — the scores file's new
    // backStakes say whose and how much (a crash between placeBacking's two
    // saves included: the stake was taken, and the finish refunds it)
    const stakesWas = (before.scoresRaw ? JSON.parse(before.scoresRaw) : {}).backStakes || {};
    for (const [k, v] of Object.entries(this.scores().backStakes || {})) {
      if (!Object.hasOwn(stakesWas, k)) add(k.slice(k.indexOf(':') + 1), -v.stake);
    }
    // An attack that landed: its reply's total is what's stored now
    for (const i of ctx.crashed ? [] : ctx.interactions || []) {
      if (i.commandName !== 'siege' || i.subcommand !== 'attack') continue;
      const reply = i.replyMessage;
      if (!reply || reply.ephemeralFor) continue;
      const u = i.user.id;
      const m = /\((−?\d+) pts/.exec(reply.content);
      const capped = /scoring cap: just for fun now/.test(reply.content);
      if (capped) {
        add(u, 0);
      } else if (m) {
        // Whatever the attack added (points, a prize's bonus, a title) — the reply's total says where it ended
        const total = signedNumber(m[1]);
        const finishGrant = (expected[u] ?? 0) - (before.points[u] ?? 0);
        expected[u] = total + finishGrant;
        const delta = signedNumber(/([+−±]\d+) \(−?\d+ pts/.exec(reply.content)?.[1] ?? 'NaN');
        const got = total - (before.points[u] ?? 0);
        if (got < delta) say(`${u}'s attack says ${delta}, but only ${got} reached the file`);
      } else {
        say(`${u}'s attack reply has no points line: ${reply.content.split('\n').slice(-3).join(' / ')}`);
      }
    }
    // R6: a digest takes up to SIEGE.grab.loss (never below 0 for the
    // month), and Field Medic and Monster Chow pay +10 to the siege game
    const scoresBefore = before.scoresRaw ? JSON.parse(before.scoresRaw) : { users: {} };
    const scoresNow = this.scores();
    const month = mods.scores.periodKeys(clock.now).month;
    const monthOf = (u) => Object.values(scoresBefore.users?.[u]?.games || {}).reduce((n, g) => n + (g?.[month]?.points || 0), 0);
    if (s && before.siege?.id === s.id) {
      for (const [u, p] of Object.entries(s.participants || {})) {
        if (p.out && !before.siege.participants?.[u]?.out) add(u, -Math.min(mods.rewards.SIEGE.grab.loss, Math.max(0, monthOf(u))));
      }
    }
    for (const [u, user] of Object.entries(scoresNow.users || {})) {
      // (the titles a finish earns are in its grants' totals; these two come from R6's events)
      for (const key of ['field-medic', 'monster-chow']) {
        if (user.titles?.earned?.[key] && !scoresBefore.users?.[u]?.titles?.earned?.[key]) add(u, mods.rewards.TITLE_POINTS);
      }
    }
    for (const u of new Set([...Object.keys(after), ...Object.keys(expected)])) {
      if ((after[u] ?? 0) !== (expected[u] ?? 0)) say(`${u}'s siege points are ${after[u] ?? 0}, expected ${expected[u] ?? 0} (before ${before.points[u] ?? 0})`);
    }
    for (const [u, n] of Object.entries(after)) this.ledger[u] = n;
  }

  /**
   * The play limits, modelled: each game once per cooldown, perMinute plays
   * across games. A play is recorded when it passes the limit — a public
   * play, or a siege attack refused AFTER it (the fight ended a moment
   * before it landed). A refusal the model can't explain means a refused
   * play spent a cooldown; a play through a cooldown, that it wasn't kept.
   */
  checkPlayLimits(i, ctx, say) {
    if (ctx.crashed) return;
    const game = i.commandName;
    if (!['siege', 'foodfight', 'doom', 'rescue', 'potion'].includes(game)) return;
    if (game === 'siege' && i.subcommand !== 'attack') return;
    if (['foodfight', 'doom', 'rescue', 'potion'].includes(game) && !['throw', 'feed', 'fate', 'attempt', 'give'].includes(i.subcommand)) return;
    const reply = i.responses[0];
    if (!reply) return;
    const text = reply.content || '';
    const u = i.user.id;
    const now = clock.now;
    const { cooldownSeconds, perMinute } = mods.scores.DEFAULT_GAME_SETTINGS;
    const last = this.model.last[u]?.[game];
    const times = (this.model.times[u] || []).filter(t => now - t < MINUTE);
    const wait = last ? Math.ceil((last + cooldownSeconds * 1000 - now) / 1000) : 0;
    const predicted = wait > 0 ? `cooldown ${wait}s` : times.length >= perMinute ? 'per-minute' : 'ok';
    const cd = /^⏳ .+ cooldown: (\d+)s/.exec(text);
    if (cd) {
      if (predicted !== `cooldown ${cd[1]}s`) say(`${u} refused with a ${cd[1]}s ${game} cooldown, but the model says ${predicted}: a refused play spent a cooldown?`);
      return;
    }
    if (/^⏳ Easy there/.test(text)) {
      if (predicted !== 'per-minute') say(`${u} refused with the per-minute limit, but the model says ${predicted}`);
      return;
    }
    const passed = !reply.ephemeralFor || /a moment before your attack landed/.test(text);
    if (!passed) return;
    if (predicted !== 'ok') say(`${u} played ${game} through ${predicted}`);
    (this.model.last[u] ||= {})[game] = now;
    this.model.times[u] = [...times, now];
  }

  /** An attack's reply against the store: the HP it says, the damage the rules give, the heal; a refusal changed nothing */
  checkAttack(i, before, s, ctx, say) {
    const reply = i.replyMessage;
    if (!reply) return;
    const u = i.user.id;
    if (reply.ephemeralFor) {
      if (ctx.race) return;
      const after = this.before();
      if (after.happeningsRaw !== before.happeningsRaw) say(`${u}'s refused attack ("${reply.content.split('\n')[0]}") changed the happenings file`);
      if (after.scoresRaw !== before.scoresRaw) say(`${u}'s refused attack ("${reply.content.split('\n')[0]}") changed the scores file`);
      return;
    }
    if (!s) return say(`${u}'s attack landed with no siege stored`);
    const rec = this.track(s);
    const m = mods.monsters.MONSTERS[s.monster];
    const content = reply.content;
    const hpLine = /^-# 💥 (?:([\d,]+) damage(?: \(([^)]*)\))?|No damage) · (.+) (\d+)\/(\d+)$/m.exec(content);
    if (!hpLine) return say(`${u}'s attack reply has no damage line:\n${content}`);
    const damage = Number((hpLine[1] || '0').replace(/,/g, ''));
    const [hpSaid, maxSaid] = [Number(hpLine[4]), Number(hpLine[5])];
    if (hpLine[3] !== m.name) say(`the reply names ${hpLine[3]}, not ${m.name}`);
    if (!ctx.race && (hpSaid !== s.hp || maxSaid !== s.maxHp)) say(`${u}'s reply says ${hpSaid}/${maxSaid}, the store has ${s.hp}/${s.maxHp}`);
    const healed = Number(/^-# 💚 .+ heals (\d+) HP\.$/m.exec(content)?.[1] || 0);
    const joined = Number(/^-# 📈 .+ grows \+(\d+) HP\.$/m.exec(content)?.[1] || 0);

    // The outcome, from the label (a capped attack has none) or the forced draw
    const labels = mods.gamePlay.OUTCOME_LABELS;
    const outcome = Object.keys(mods.rewards.SIEGE.damage).find(o => content.includes(`-# ${labels[o]} `)) || ctx.force?.outcome || null;
    if (ctx.force && outcome !== ctx.force.outcome) say(`forced ${ctx.force.outcome}, the reply says ${outcome}`);
    const p = s.participants?.[u];
    if (!p) return say(`${u}'s attack landed but they aren't a participant`);
    if (!outcome || ctx.race) return;
    const weapon = i.options.getString('weapon');
    const was = before.siege?.id === s.id ? before.siege.participants?.[u] : null;
    if (was && (mods.store.isCaught(was) || was.out)) say(`${u} landed an attack while ${was.out ? 'digested' : 'caught'}`);
    const maxBefore = before.siege?.id === s.id ? before.siege.maxHp : rec.hpFor(0);
    const t = mods.pace.timingsOf(s);
    const late = clock.now >= s.endsAt - t.noGrowth * MINUTE;
    const growers = this.growers(s);
    const first = !(was?.attacks > 0);
    // From evening on it's a member's first attack of each night that grows
    // it — a 3-day or week campaign's first hours being its night 1, worked
    // out here from its first counted boundary, not read from the store
    const tn = this.campaignNightKey(s, clock.now);
    const grows = t.growthPer === 'night' ? !Object.hasOwn(was?.nights || {}, tn) : first;
    // The allowance, counted here per campaign night: never more than it a night
    if (t.allowance) {
      const n = ((rec.attacksByNight ||= {})[`${u}:${tn}`] = (rec.attacksByNight[`${u}:${tn}`] || 0) + 1);
      if (n > t.allowance) say(`${u} landed ${n} attacks in the campaign's night ${tn}, over the allowance of ${t.allowance}`);
    }
    const want = !grows || late ? 0 : Math.max(0, rec.hpFor(growers) - maxBefore);
    if (joined !== want) say(`${u} ${!grows ? 'attacked again' : late ? 'joined in the last minutes' : 'joined'}: the monster grew +${joined} HP, expected +${want}`);
    // Damage: base × the monster's weapon multiplier (× silver) + hitBonus, halved when Spooked, never more than was left
    const { SIEGE } = mods.rewards;
    const silver = /🥈 ×/.test(hpLine[2] || '');
    let raw = SIEGE.damage[outcome] * (m.damage?.[weapon] ?? 1);
    if (silver) raw *= m.traits?.silverMult ?? SIEGE.silverMult;
    if (raw > 0) raw += m.traits?.hitBonus ?? 0;
    if (was?.spooked) raw *= SIEGE.spookedMult;
    if (was && mods.store.poisonedNow(was, clock.now)) raw *= SIEGE.poisoned.mult;
    raw = Math.max(0, Math.round(raw));
    const hpBefore = (before.siege?.id === s.id ? before.siege.hp : rec.hp0) + joined;
    if (outcome === 'poisoned') {
      if (damage > Math.min(raw, hpBefore)) say(`${u}'s poison did ${damage} now, more than ${Math.min(raw, hpBefore)}`);
    } else if (damage !== Math.min(raw, hpBefore)) {
      say(`${u}'s ${weapon} ${outcome} did ${damage}, but the rules give min(${raw}, ${hpBefore} left) = ${Math.min(raw, hpBefore)}`);
    }
    if (outcome !== 'poisoned') {
      const left = hpBefore - damage;
      const heal = weapon === 'food' && outcome === 'splash' && (m.traits?.missHeal || 0) > 0 && left > 0 ? Math.min(Math.round(m.traits.missHeal * mods.pace.timingsOf(s).heal.miss * s.maxHp), s.maxHp - left) : 0;
      if (healed !== heal) say(`${u}'s ${outcome} healed ${healed}, the rules say ${heal}`);
      if (s.hp !== left + healed) say(`after ${u}'s attack the store has ${s.hp} HP, expected ${left} + ${healed}`);
    }
    if (p.spooked !== (outcome === 'spooked')) say(`${u} spooked=${p.spooked} after a ${outcome}`);
    if (outcome === 'poisoned' && !(p.poison && p.poison.until === clock.now + SIEGE.poison.minutes * MINUTE)) say(`${u}'s poison wasn't started: ${JSON.stringify(p.poison)}`);
    // R6: a fizzle splashes back — poisoned, unless their Antidote fired (and the reply says which)
    if (outcome === 'fizzled') {
      const antidote = /Antidote cured it at once/.test(content);
      if (antidote === mods.store.poisonedNow(p, clock.now)) say(`${u}'s fizzle: antidote ${antidote}, poisoned ${JSON.stringify(p.poisoned)}`);
      if (!antidote && !/The potion splashed back/.test(content)) say(`${u}'s fizzle poisoned them without saying so`);
    }
  }

  /** /siege status, /scoreboard and /leaderboard: a live siege's HP as stored */
  checkStatusReply(i, s, say) {
    const live = s && s.status === 'live' && clock.now < s.endsAt;
    const hp = s && `\`${Math.max(0, s.hp)}/${s.maxHp}\``;
    const texts = [...new Set([...i.responses, ...i.edited])].map(m => m.text);
    if (i.commandName === 'siege' && i.subcommand === 'status' && i.replyMessage?.embeds?.length) {
      if (!live) say('/siege status showed a card with no siege on');
      else if (!texts.some(t => t.includes(hp))) say(`/siege status doesn't show the stored ${hp}`);
    }
    if ((i.commandName === 'leaderboard' || i.commandName === 'scoreboard') && texts.length) {
      const showing = texts.some(t => /is attacking!/.test(t));
      if (showing && !live) say(`/${i.commandName} shows a siege that isn't on`);
      if (showing && !texts.some(t => t.includes(hp))) say(`/${i.commandName} shows a siege's HP that isn't the stored ${hp}`);
    }
  }

  /**
   * A digest kept for a report (checkPace's rec.kept) is told when a report
   * names it in its digest field, or the results in their digest line — of
   * whichever siege the message is, the current one or the last
   */
  noteToldDigests(events) {
    for (const e of events) {
      if (e.kind !== 'send') continue;
      const rec = this.sieges.get(e.message.siegeId);
      if (!rec?.kept?.size) continue;
      let where = '';
      if (e.message.kindTag === 'report') where = (e.snap?.embeds?.[0]?.fields || []).find(f => f.name === '😋 Digested while nobody was around')?.value || '';
      if (e.message.kindTag === 'results') where = (e.snap?.content || '').split('\n').find(l => l.startsWith('😋 Digested while nobody was around:')) || '';
      for (const [k, name] of rec.kept) {
        if (!where.includes(name)) continue;
        rec.kept.delete(k);
        rec.told.add(k);
      }
    }
  }

  /** At the end: every siege's arrivals and results, as promised */
  finalChecks() {
    const problems = [];
    for (const rec of this.sieges.values()) this.checkMessageCounts(rec, (m) => problems.push(m), { final: true });
    // 2.74.0: a digest kept for a report, never told — once its siege's results are out
    for (const rec of this.sieges.values()) {
      const posted = this.messagesFor(rec.id, 'results').length > 0;
      if (posted && rec.kept?.size) problems.push(`siege ${rec.id}: ${[...rec.kept.values()].join(', ')} digested while nobody was around, and never told in a report or the results`);
    }
    if (problems.length) this.fail('final checks', problems.join('\n'));
  }

  // ── reading what happened ─────────────────────────────────────────────

  /** Every step and every message, as it looked then, as an HTML page (SIM_REPORT=dir) */
  writeTranscript(name) {
    const dir = process.env.SIM_REPORT;
    if (!dir) return null;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.html`);
    fs.writeFileSync(file, transcriptHtml(name, this.steps, this.discord.events));
    return file;
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function transcriptHtml(name, steps, events) {
  const byStep = new Map();
  for (const e of events) {
    if (!byStep.has(e.step)) byStep.set(e.step, []);
    byStep.get(e.step).push(e);
  }
  const rows = steps.map((st) => {
    const evs = (byStep.get(st.no) || []).map((e) => {
      const snap = e.snap || { content: '', embeds: [] };
      const embeds = (snap.embeds || []).map((d) => `<div class="embed"${d.color ? ` style="border-color:#${d.color.toString(16).padStart(6, '0')}"` : ''}><b>${esc(d.title)}</b><div>${esc(d.description).replace(/\n/g, '<br>')}</div>${(d.fields || []).map(f => `<div class="field"><b>${esc(f.name)}</b><br>${esc(f.value).replace(/\n/g, '<br>')}</div>`).join('')}${d.footer ? `<small>${esc(d.footer.text)}</small>` : ''}</div>`).join('');
      const pings = e.message?.allowedMentions?.users?.length ? ` · pings ${esc(e.message.allowedMentions.users.join(', '))}` : '';
      return `<div class="msg ${esc(e.kind)}"><div class="meta">${esc(e.kind)}${e.to ? ` → ${esc(e.to)}` : ''}${e.via ? ` · ${esc(e.via)}` : ''} · #${esc(e.channel)}${pings}</div>${snap.content ? `<div>${esc(snap.content).replace(/\n/g, '<br>')}</div>` : ''}${embeds}</div>`;
    }).join('\n');
    return `<div class="step"><span class="t">${fmtTime(st.at)}</span> ${esc(st.label)}</div>${evs}`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><style>
body{font:14px system-ui;background:#313338;color:#dbdee1;max-width:760px;margin:2em auto;padding:0 16px}
.step{margin:14px 0 4px;color:#f2f3f5;font-weight:600}.t{color:#949ba4;font-weight:400;font-family:monospace}
.msg{background:#2b2d31;border-radius:6px;padding:10px;margin:6px 0 6px 18px}.ephemeral{border-left:3px solid #5865f2}
.edit,.editReply{border-left:3px solid #f0b232}.meta{font-size:11px;color:#949ba4;margin-bottom:4px}
.embed{border-left:4px solid #4ec5ed;padding:6px 10px;margin:6px 0;background:#232428}.field{margin-top:6px}
</style><h1>${esc(name)}</h1>${rows}`;
}
