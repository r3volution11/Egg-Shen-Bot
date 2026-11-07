/**
 * Scores for the social games: /potion, /foodfight, /doom and /rescue —
 * and, since R5, /siege attacks (the fifth game: see siegeStore.js).
 *
 * Every line those commands post is tagged with an outcome, and each outcome
 * moves points for the person playing and, when they aimed at a member, for
 * that member (POINTS). Doug's design, 2026-10-02:
 *   - each harmful play has a helpful counterpart (feed for throw, /rescue
 *     for /doom, helpful potions), and a rescue shields someone from the
 *     next /doom for a while
 *   - points count for a person's first N plays per game per day; plays
 *     after that still happen, unscored (anti-farming)
 *   - plays are rate-limited per game and across games (checkPlayLimit)
 *   - stats are kept all-time, per year and per month (UTC), for
 *     /scoreboard and /leaderboard
 *
 * One JSON file per server. Every change is one synchronous load-modify-save
 * (mutateScores) with an atomic write (tmp + rename) and a .bak of the
 * version it replaced, so a restart can't leave a half-written file, a
 * damaged file is recovered from the last good one, and two plays can't
 * overwrite each other (see CLAUDE.md).
 *
 * R3 adds the rewards, all inside recordPlay's one save: items from the
 * Glovebox, defences, recurring prizes, titles, and nights in a row. The
 * numbers are in src/data/gameRewards.js, the words in gameRewardLines.js,
 * and the pure rules in gameRules.js.
 *
 * R4 adds twists (a small chance, on a scored play, of something happening
 * to the player: TWISTS in gameRewards.js, words in gameEventLines.js) and
 * the statuses they leave in users[uid].effects, and applies the server's
 * happenings (gameHappenings.js `mods`) to the points — still inside the
 * same one save.
 *
 * R5 adds `siege`: an attack on a monster is a play like any other here
 * (cap, item, streak, nights, prizes, titles) except that twists, statuses
 * and happenings never touch it, and the monster is never scored. What a
 * finished siege pays out arrives through applySiegeResult, in one save.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ITEMS, DEFENCES, DAILY, FULL_STACK_POINTS, TITLE_POINTS, PRIZES, RANDOM_PRIZE_ITEMS, TITLES,
  NIGHTS_SHOWN, NIGHT_LIGHT_DAYS, MULTIPLIER_CAPS, TWISTS, TWIST_RULES, SIEGE, SIEGE_PACE_KEYS,
} from '../data/gameRewards.js';
import {
  ITEM_USED, ITEM_KEPT, SHIELD_BROKEN, DEFENCE_LINES, prizeLine, prizeHeldLine, titleLine, NIGHT_LINES,
} from '../data/gameRewardLines.js';
import { twistLine, STATUS_USED, HAPPENING_LINES, calendarLine } from '../data/gameEventLines.js';
import {
  actionFor, itemEffect, scalePoints, nightKey, nightsBetween, shiftNight, nightTier, earnsNightLight, qualifiesFor,
  owns, lifetimeFrom, pickLine, GOOD, liveHappenings, happeningPoints, happeningMod, streakKeepers,
} from './gameRules.js';
import { luck } from './gameLuck.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Overridable so test workers each use their own directory
const gamesDir = process.env.GUILD_GAMES_DIR || join(__dirname, '../../guild_games');

/** Every game, in the order cards and choices list them. `siege` (R5) is the fifth. */
export const GAMES = ['potion', 'foodfight', 'doom', 'rescue', 'siege'];

export const GAME_NAMES = {
  potion: 'Potions',
  foodfight: 'Food Fight',
  doom: 'Doom',
  rescue: 'Rescue',
  siege: 'Siege',
};

/**
 * [actor, target] points per outcome. Potions are scored by what the potion
 * does: `helped` (a helpful potion that worked), `hurt` (a harmful one that
 * worked), or `backfired`. `blocked` is a /doom on someone a rescue shielded.
 */
export const POINTS = {
  foodfight: { hit: [3, -1], miss: [-1, 1], backfire: [-2, 2], tasty: [1, 2], gross: [-1, -1], spill: [-2, 1] },
  doom: { doomed: [3, -1], escaped: [-1, 2], backfired: [-2, 1], blocked: [0, 0] },
  rescue: { rescued: [1, 2], caught: [-1, -1], sacrificed: [-2, 3] },
  potion: { helped: [1, 2], hurt: [2, -2], backfired: [-2, 1] },
  // R5: an attack on a monster. Only the attacker is scored: the monster
  // is no member (its target is {kind: 'monster'}), so its side is 0.
  // food: splat/splash/splatback · doom: smite/dodged/spooked · potion:
  // poisoned/fizzled (SIEGE.outcomes maps the game lines' own outcomes).
  siege: {
    splat: [1, 0], splash: [0, 0], splatback: [-1, 0],
    smite: [2, 0], dodged: [0, 0], spooked: [-2, 0],
    poisoned: [1, 0], fizzled: [-1, 0],
  },
};

/**
 * Outcomes that extend a streak; any other (but `blocked`) ends it. Also
 * what the nights-in-a-row buff pays on. Defined in gameRules.js since R4
 * (the happening rules need it there); exported here as it always was.
 */
export { GOOD };

/** Rescue outcomes that shield the one rescued from the next /doom */
const SHIELDING = new Set(['rescued', 'sacrificed']);

export const DEFAULT_GAME_SETTINGS = {
  cooldownSeconds: 20, // each game, per person
  perMinute: 6, // all games together, per person
  dailyScoredPlays: 20, // per game, per person, per UTC day
  shieldMinutes: 60,
  // Where the games can be played: 'all', 'only' (just `channels`), or
  // 'except' (everywhere but `channels`). Doug asked for both, 2026-10-02.
  channelMode: 'all',
  channels: [],
  // R4. Twists: a small chance on each scored play of something happening
  // to the player (good or bad). On after the upgrade, as Doug asked;
  // admins can turn the chance down (0 = never) or switch them off.
  twists: true,
  twistPercent: 4, // per scored play, 0–15
  // Happenings: server-wide events (src/data/gameHappenings.js). Random
  // ones are started by the happening scheduler; calendar ones just are.
  happenings: true,
  happeningFrequency: 'normal', // HAPPENING_RULES.frequency: off | rare | normal | often
  happeningChannel: null, // where they're announced; null = the scheduler picks
  // R5: how long a siege lasts, unless its monster or the admin says
  siegeMinutes: SIEGE.minutes.default, // SIEGE.minutes.min–max
  // R6: how often a monster attacks by itself (SIEGE.random.perWeek)
  siegeFrequency: 'normal', // off | rare | normal | often
  // 2.74.0: how long the games' events take (SIEGE_PACES): a siege's
  // default length and timings, how often a random one comes, how long
  // happenings last. `siegeMinutes` above is a QUICK siege's length.
  // Doug, 2026-11-04: every server moves to week, existing ones included
  // (there are no migrations: a config without the key reads as week).
  pace: 'week', // quick | evening | day | days3 | week
};

/** Admin frequency choices for random sieges, in the order offered */
export const SIEGE_FREQUENCIES = Object.freeze(['off', 'rare', 'normal', 'often']);

/** The paces an admin can pick, shortest first (SIEGE_PACE_KEYS) */
export const GAME_PACES = SIEGE_PACE_KEYS;

/** Admin frequency choices for random happenings, in the order offered */
export const HAPPENING_FREQUENCIES = Object.freeze(['off', 'rare', 'normal', 'often']);

/** The most an admin can set the twist chance to: past this it stops being a twist */
export const TWIST_PERCENT_MAX = 15;

/** The server's game settings. Configs predating the key lack it. */
export function getGameSettings(config) {
  const g = config?.games || {};
  const pick = (key, min, max) => {
    const v = Number(g[key]);
    return Number.isFinite(v) && v >= min && v <= max ? v : DEFAULT_GAME_SETTINGS[key];
  };
  // A switch: only a real boolean counts, so a config that never had the key
  // (every server before R4) reads as the default, on
  const flag = (key) => (typeof g[key] === 'boolean' ? g[key] : DEFAULT_GAME_SETTINGS[key]);
  // The twist chance is a whole percentage. Out of range is clamped rather
  // than reset: an admin who typed 20 meant "as many as allowed", not 4.
  // Not a number at all (or never set) is the default.
  const twistRaw = g.twistPercent === null || g.twistPercent === undefined || g.twistPercent === '' ? NaN : Number(g.twistPercent);
  const twistPercent = Number.isFinite(twistRaw)
    ? Math.min(TWIST_PERCENT_MAX, Math.max(0, Math.round(twistRaw)))
    : DEFAULT_GAME_SETTINGS.twistPercent;
  return {
    cooldownSeconds: pick('cooldownSeconds', 0, 3600),
    perMinute: pick('perMinute', 1, 60),
    dailyScoredPlays: pick('dailyScoredPlays', 0, 1000),
    shieldMinutes: pick('shieldMinutes', 0, 1440),
    channelMode: ['all', 'only', 'except'].includes(g.channelMode) ? g.channelMode : 'all',
    channels: Array.isArray(g.channels) ? g.channels.filter(id => typeof id === 'string') : [],
    twists: flag('twists'),
    twistPercent,
    happenings: flag('happenings'),
    happeningFrequency: HAPPENING_FREQUENCIES.includes(g.happeningFrequency) ? g.happeningFrequency : DEFAULT_GAME_SETTINGS.happeningFrequency,
    // A channel id string; anything else (unset, cleared to null or '')
    // means the scheduler picks. Whether the channel still exists, and the
    // bot can post there, is the scheduler's check at announce time.
    happeningChannel: typeof g.happeningChannel === 'string' && g.happeningChannel ? g.happeningChannel : null,
    siegeMinutes: pick('siegeMinutes', SIEGE.minutes.min, SIEGE.minutes.max),
    siegeFrequency: SIEGE_FREQUENCIES.includes(g.siegeFrequency) ? g.siegeFrequency : DEFAULT_GAME_SETTINGS.siegeFrequency,
    pace: GAME_PACES.includes(g.pace) ? g.pace : DEFAULT_GAME_SETTINGS.pace,
  };
}

/**
 * May the games be played in this channel? A thread counts as its parent
 * channel, so listing a channel covers its threads.
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function channelAllowed(settings, channelId, parentId = null) {
  const listed = settings.channels.includes(channelId) || (parentId && settings.channels.includes(parentId));
  if (settings.channelMode === 'only' && !listed) {
    return { ok: false, message: settings.channels.length
      ? `🎲 Games are played in ${settings.channels.map(id => `<#${id}>`).join(', ')} on this server.`
      : '🎲 Games are switched off in every channel on this server.' };
  }
  if (settings.channelMode === 'except' && listed) {
    return { ok: false, message: '🎲 Games aren\'t played in this channel. Try another one!' };
  }
  return { ok: true };
}

// ── periods ─────────────────────────────────────────────────────────────

/** The period keys a moment counts toward: all-time, its year, its month (UTC) */
export function periodKeys(now = Date.now()) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { all: 'all', year: `y${y}`, month: `m${y}-${m}` };
}

/** The UTC day a moment falls on — daily caps here, and Escape Velocity's one run a day. */
export const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

// ── storage ─────────────────────────────────────────────────────────────

const fileFor = (guildId) => join(gamesDir, `${guildId}.json`);
const emptyScores = () => ({ users: {}, daily: {}, shields: {} });

/**
 * A server's scores. A damaged file is recovered from the .bak the last
 * save kept, and moved aside rather than overwritten by the next save (as
 * loadEvent and loadTournament do): a year of points is worth keeping.
 */
export function loadScores(guildId) {
  const file = fileFor(guildId);
  if (!existsSync(file)) return emptyScores();
  try {
    return { ...emptyScores(), ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch (error) {
    try {
      const restored = JSON.parse(readFileSync(`${file}.bak`, 'utf8'));
      renameSync(file, `${file}.damaged-${Date.now()}`);
      copyFileSync(`${file}.bak`, file);
      console.warn(`[GameScores] Scores for ${guildId} were damaged (${error.message}); restored the previous save`);
      return { ...emptyScores(), ...restored };
    } catch {
      console.error(`[GameScores] Couldn't read scores for ${guildId}, and no usable backup; moved aside:`, error.message);
      try { renameSync(file, `${file}.damaged-${Date.now()}`); } catch { /* already gone */ }
      return emptyScores();
    }
  }
}

function saveScores(guildId, data) {
  if (!existsSync(gamesDir)) mkdirSync(gamesDir, { recursive: true });
  const file = fileFor(guildId);
  const tmp = `${file}.tmp`;
  // Write-then-rename: a kill mid-save leaves the old file or the new one,
  // never half of one. The replaced version is kept as .bak.
  writeFileSync(tmp, JSON.stringify(data));
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  renameSync(tmp, file);
}

/**
 * The one way scores change: load, change, save, with nothing in between
 * that can wait. `fn` must be synchronous — an await inside it would let
 * another play load, save, and then be overwritten by this one (CLAUDE.md:
 * never save an object loaded before an await).
 * @returns whatever fn returns
 */
export function mutateScores(guildId, fn) {
  const data = loadScores(guildId);
  const out = fn(data);
  saveScores(guildId, data);
  return out;
}

// `bonus` (points from rewards, already inside `points`) is added the first
// time a period gets one, so stats written before R3 read the same.
const emptyStats = () => ({ points: 0, plays: 0, scoredPlays: 0, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 });

function userFor(data, userId, name) {
  const user = (data.users[userId] ||= { name, games: {} });
  if (name) user.name = name;
  user.games ||= {};
  return user;
}

function statsFor(data, userId, name, game, period) {
  const g = (userFor(data, userId, name).games[game] ||= {});
  return (g[period] ||= emptyStats());
}

/**
 * A member's points this month, every game together, bonuses included —
 * what their card adds up. A loss that isn't a play (a twist, an escaped
 * monster) never takes this below 0: it's a joke at your expense, not a
 * way to lose a month.
 */
function monthTotal(user, monthKey) {
  return Object.values(user?.games || {}).reduce((n, g) => n + (g?.[monthKey]?.points || 0), 0);
}

// ── the day's counters ──────────────────────────────────────────────────

/**
 * This member's counters for today (UTC), started fresh on a new day:
 * scored plays per game, and R3's prizes, defences, item uses and nights
 * buffs. Configs and files from before R3 lack the new keys; they're read
 * as 0.
 */
function dayFor(data, userId, today) {
  const d = data.daily[userId];
  if (!d || d.day !== today) return (data.daily[userId] = { day: today, plays: {} });
  d.plays ||= {};
  return d;
}

/** One of today's counters, without starting a day (reads) */
function todayCount(data, userId, key, now) {
  const d = data.daily?.[userId];
  return d && d.day === dayKey(now) ? (d[key] || 0) : 0;
}

/** Would this member's next play of `game` be scored, or is it past the daily cap? */
export function wouldScore(data, userId, game, settings = DEFAULT_GAME_SETTINGS, now = Date.now()) {
  const d = data.daily?.[userId];
  const played = d && d.day === dayKey(now) ? (d.plays?.[game] || 0) : 0;
  return played < settings.dailyScoredPlays;
}

// ── the Glovebox ────────────────────────────────────────────────────────

/** Add one of an item; false (and nothing added) when the stack is full */
function stash(user, key) {
  const box = (user.glovebox ||= {});
  if ((box[key] || 0) >= ITEMS[key].cap) return false;
  box[key] = (box[key] || 0) + 1;
  return true;
}

/** Use one up; an empty slot is removed so the file stays small */
function take(user, key) {
  const box = user.glovebox || {};
  if ((box[key] || 0) <= 1) delete box[key];
  else box[key] -= 1;
}

/**
 * Why this member can't use this item in this play, or null if they can:
 * 'unknown', 'unfit' (not this game or action), 'missing' (none held),
 * 'limit' (DAILY.itemUses used today). Shared by beginPlay's refusal,
 * resolvePlay's draw and recordPlay's re-check, so all three agree.
 */
export function itemProblem(data, userId, key, { game, action }, now = Date.now()) {
  if (!owns(ITEMS, key)) return 'unknown';
  if (!itemEffect(key, game, action)) return 'unfit';
  if (!((data.users[userId]?.glovebox?.[key] || 0) > 0)) return 'missing';
  if (todayCount(data, userId, 'itemUses', now) >= DAILY.itemUses) return 'limit';
  return null;
}

/** How many active items this member has used today */
export const itemUsesToday = (data, userId, now = Date.now()) => todayCount(data, userId, 'itemUses', now);

// ── defences ────────────────────────────────────────────────────────────

/** Is this member's rescue shield up? */
export const shieldActive = (data, userId, now = Date.now()) => (data.shields?.[userId] || 0) > now;

/** May one more defence fire for this member today? (shield, Garlic and Antidote together) */
export const defencesLeft = (data, userId, now = Date.now()) => todayCount(data, userId, 'defences', now) < DAILY.defences;

/** Will this passive defence ('garlic', 'antid') fire for this member now? */
export function defenceReady(data, userId, key, now = Date.now()) {
  const user = data.users[userId];
  return (user?.glovebox?.[key] || 0) > 0
    && !((user?.cooldowns?.[key] || 0) > now)
    && defencesLeft(data, userId, now);
}

// ── titles ──────────────────────────────────────────────────────────────

const TITLE_BY_KEY = Object.fromEntries(TITLES.map(t => [t.key, t]));
const PRIZE_BY_KEY = Object.fromEntries(PRIZES.map(p => [p.key, p]));

/**
 * The first time a member is checked after R3 they get their title counts
 * (lifetimeFrom: from their all-time stats, once) and every title those
 * already qualify for, silently and with no +10: a deploy mustn't flood
 * the server with points for things done months ago. Called before a
 * play's stats are added, so the play that crosses a line still earns it.
 */
function seedTitles(user, now) {
  user.lifetime ||= lifetimeFrom(user);
  if (user.titles) return;
  const earned = {};
  for (const t of TITLES) if (qualifiesFor(user, t)) earned[t.key] = now;
  user.titles = { earned, shown: null };
}

/**
 * A member's titles as { key: earned ms }. Read-only: someone not checked
 * since R3 gets what seedTitles would grant them, with `null` for when.
 */
export function earnedTitles(user) {
  if (user?.titles) return user.titles.earned || {};
  return Object.fromEntries(TITLES.filter(t => qualifiesFor(user, t)).map(t => [t.key, null]));
}

/** The title a member shows with their name, or null */
export function shownTitleOf(user) {
  const key = user?.titles?.shown;
  const title = owns(user?.titles?.earned, key) && owns(TITLE_BY_KEY, key) ? TITLE_BY_KEY[key] : null;
  return title ? { key: title.key, title: title.title, badge: title.badge } : null;
}

/**
 * Show one of your titles (or none, key null) with your name.
 * @returns {{ok: true, shown: ?string} | {ok: false, reason: 'unknown'|'notEarned'}}
 */
export function setShownTitle(guildId, userId, key, now = Date.now()) {
  if (key !== null && !owns(TITLE_BY_KEY, key)) return { ok: false, reason: 'unknown' };
  return mutateScores(guildId, (data) => {
    const user = data.users[userId];
    if (!user) return key === null ? { ok: true, shown: null } : { ok: false, reason: 'notEarned' };
    seedTitles(user, now);
    if (key !== null && !owns(user.titles.earned, key)) return { ok: false, reason: 'notEarned' };
    user.titles.shown = key;
    return { ok: true, shown: key };
  });
}

// ── nights in a row ─────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Can this member's Night Light burn now? (held, and none burned in NIGHT_LIGHT_DAYS) */
export function canBurnLight(user, now = Date.now()) {
  const used = user?.nights?.lightUsedAt;
  return (user?.glovebox?.nlight || 0) > 0 && !(used && now - used < NIGHT_LIGHT_DAYS * DAY_MS);
}

/**
 * Count tonight for this member's row (any scored play counts once a
 * night). A single missed night is saved by a Night Light if one can burn
 * — that night shows as saved and doesn't add to the count; two missed
 * nights break the row whatever they hold. A play dated before the last
 * night counted (an import, a test) leaves the row alone.
 * @returns {?{current, best, saved: boolean, milestone: ?object, lightEarned: boolean, buff: ?object}}
 */
function countNight(user, now) {
  const tonight = nightKey(now);
  const n = (user.nights ||= { last: null, current: 0, best: 0, recent: [], saved: [], lightUsedAt: null });
  n.recent ||= [];
  n.saved ||= [];
  const info = { current: n.current, best: n.best, saved: false, milestone: null, lightEarned: false, buff: null };
  if (n.last === tonight) return info;
  const gap = n.last ? nightsBetween(n.last, tonight) : null;
  if (gap !== null && gap < 0) return null;

  if (gap === 1) {
    n.current += 1;
  } else if (gap === 2 && canBurnLight(user, now)) {
    take(user, 'nlight');
    n.lightUsedAt = now;
    n.saved = [...n.saved, shiftNight(tonight, -1)].slice(-NIGHTS_SHOWN);
    n.current += 1;
    info.saved = true;
  } else {
    n.current = 1;
  }
  n.best = Math.max(n.best || 0, n.current);
  n.last = tonight;
  n.recent = [...n.recent, tonight].slice(-NIGHTS_SHOWN);

  info.current = n.current;
  info.best = n.best;
  // The row only ever grows by one, so a tier is crossed exactly at its `at`
  const tier = nightTier(n.current);
  if (tier && tier.at === n.current) info.milestone = tier;
  info.lightEarned = earnsNightLight(n.current);
  return info;
}

// ── statuses (R4) ───────────────────────────────────────────────────────

const STATUS_MS = TWIST_RULES.statusHours * 60 * 60 * 1000;

/**
 * The statuses twists left on a member that are still running, by key:
 * { luckybreak: {at, until}, refill: {at, until, playsLeft}, … }. One past
 * its 24 hours, or with no plays left, is over whether or not a save has
 * cleared it yet. Read-only: the card and resolvePlay call it too.
 */
export function activeStatuses(user, now = Date.now()) {
  const out = {};
  for (const [key, s] of Object.entries(user?.effects || {})) {
    if (!owns(TWISTS, key) || !TWISTS[key].status || !s) continue;
    if (!(s.until > now) || (TWISTS[key].plays && !(s.playsLeft > 0))) continue;
    out[key] = s;
  }
  return out;
}

/**
 * Give a member a status. A repeat REFRESHES it — 24 hours from now, its
 * plays back to full — rather than stacking: two Bitten twists are one
 * Bitten for three more plays, not six plays of halving. A status with an
 * `opposite` clears it (a Lucky Break ends a Jinx, and the other way).
 */
function setStatus(user, key, now) {
  const twist = TWISTS[key];
  const effects = (user.effects ||= {});
  effects[key] = { at: now, until: now + STATUS_MS, ...(twist.plays ? { playsLeft: twist.plays } : {}) };
  if (twist.opposite) delete effects[twist.opposite];
}

/** Drop statuses that are over, so the file only holds what's running */
function pruneStatuses(user, now) {
  if (!user.effects) return;
  const running = activeStatuses(user, now);
  for (const key of Object.keys(user.effects)) if (!running[key]) delete user.effects[key];
  if (!Object.keys(user.effects).length) delete user.effects;
}

// ── shields ─────────────────────────────────────────────────────────────

/** Until when this person is shielded from /doom, or null */
export function shieldedUntil(guildId, userId, now = Date.now()) {
  const until = loadScores(guildId).shields?.[userId];
  return until && until > now ? until : null;
}

// ── recording a play ────────────────────────────────────────────────────

/**
 * Record one play and move the points — and everything a play can earn —
 * in ONE synchronous load-modify-save. In order (R3, with R4's steps):
 *   the daily cap → the item (a capped play ignores it completely) →
 *   defences (decided by resolvePlay, used up here) → base points →
 *   multipliers (happenings × item × Director's Cut, capped) → flat
 *   additions and statuses (the item's, Bitten) → streaks (Be Kind,
 *   Rewind and Second Wind keep one) → stats and shields (Sunrise) →
 *   Free Refill, Mosquito Swarm and a happening's goodBonus → nights in a
 *   row and its buff → prize counters and prizes (DAILY.prizes a day) →
 *   titles, for the player and a member target → the twist roll (R4) and
 *   the Plot Twist title.
 *
 * Commands reach this through finishPlay → resolvePlay, which draws the
 * line with the item, happenings, statuses and defences applied. Tests
 * (and anything else) may still pass a bare `outcome`, `'blocked'`
 * included.
 *
 * Rewards are earned on scored plays only: a capped play still counts in
 * the stats, and what it adds to a title's count is picked up by the next
 * scored play. Statuses wait for a scored play too, and for one where
 * something happened (not a blocked doom): a Free Refill spent on a play
 * worth nothing would be no refill at all. Happenings bend every play,
 * capped or not — they're the weather, not a reward.
 *
 * @param {string} guildId
 * @param {object} play
 * @param {string} play.game - one of GAMES
 * @param {string} [play.action] - 'throw'|'feed'|'fate'|'attempt'|'give'; worked out from the outcome if not given
 * @param {{id: string, name: string}} play.actor
 * @param {{kind: string, pingUserIds: string[], name: string}} play.target - from resolveSocialTarget
 * @param {string} play.outcome - a key of POINTS[game]; for potions 'worked' or 'backfired'
 * @param {'helpful'|'harmful'} [play.effect] - potions only
 * @param {object} [play.settings] - getGameSettings(config)
 * @param {?string} [play.item] - the Glovebox item asked for (an ITEMS key)
 * @param {object} [play.mods] - from resolvePlay: { defence?: 'garlic'|'antid'|'shield',
 *   happenings?: kinds whose weights shaped the draw, statuses?: ['luckybreak'|'jinxed'] that shaped it }
 * @param {object[]} [play.happenings] - activeHappenings(guildId, now): the SAME list resolvePlay drew with
 * @param {boolean} [play.pot] - a siege attack at a day+ pace (the siege's timings say `pot`): its
 *   own points go into the pot — the win pool, paid at the end — so it scores 0 here, and what it
 *   would have scored comes back as `potPoints`. It's still a scored play: the cap, the item, the
 *   streak, nights, prizes and titles all count it.
 * @returns {{outcome, action, scored, capped, potted, potPoints, actorDelta, targetDelta, actorPoints, streak, shieldedUntil, targetId,
 *   item: ?{key, used, note}, defence: ?{key, readyAt?}, shieldBroken, rewards: object[], titles: object[],
 *   nights: ?object, bonus: number, targetBonus: number,
 *   twist: ?object, statuses: object[], happenings: Array<{kind, tag}>, happeningLines: object[], calendar: object[]}}
 *   twist: { key, good, points?, item?, overflow?, until?, cancelled?, streak?, gameName? }
 *   statuses: the statuses that acted on THIS play, in the order they did
 *   happenings: those that changed this play, for the label's tags
 *   happeningLines: { kind: 'goodBonus'|'keptStreak', happening, points? }
 *   calendar: calendar happenings to mention (once per member per UTC day)
 */
export function recordPlay(guildId, { game, action = null, actor, target, outcome, effect, settings = DEFAULT_GAME_SETTINGS, item = null, mods = {}, happenings = [], pot = false }, now = Date.now()) {
  if (game === 'potion' && outcome === 'worked') outcome = effect === 'harmful' ? 'hurt' : 'helped';
  const points = owns(POINTS, game) && owns(POINTS[game], outcome) ? POINTS[game][outcome] : null;
  if (!points) throw new Error(`Unknown outcome "${outcome}" for ${game}`);
  action ||= actionFor(game, outcome);
  // A siege attack (R5) is the fight, not a game of chance with friends:
  // no happening bends it, no twist fires on it, and a member's statuses
  // (a twist's leftovers) wait for their next play of the other games.
  // Enforced here, not only by what the caller passes.
  const siege = game === 'siege';
  // 2.74.0: at a day+ pace an attack pays into the pot, not the attacker.
  // Measured: with attacks scoring their own points a typical member's
  // share ran 1–2 points above quick over the same 90 days; with the pot
  // every long pace sits at or below it (design §0.4).
  const potted = siege && pot === true;
  // Checked against the clock here too: a happening past its endsAt does
  // nothing, even if the store still holds it (gameRules.liveHappenings)
  const live = siege ? [] : liveHappenings(happenings, now);

  return mutateScores(guildId, (data) => {
    const keys = periodKeys(now);
    const periods = Object.values(keys);
    const today = dayKey(now);

    // The daily cap: plays still happen and are counted, unscored
    const daily = dayFor(data, actor.id, today);
    const playsToday = daily.plays[game] || 0;
    daily.plays[game] = playsToday + 1;
    const scored = playsToday < settings.dailyScoredPlays;

    // Only a member other than the actor is scored as a target. A role or
    // @everyone, or yourself, moves only your own points.
    const targetId = target?.kind === 'member' && target.pingUserIds[0] !== actor.id ? target.pingUserIds[0] : null;
    const me = userFor(data, actor.id, actor.name);
    const them = targetId ? userFor(data, targetId, target.name) : null;
    seedTitles(me, now);
    if (them) seedTitles(them, now);

    // The item. resolvePlay made the same check a moment ago with no await
    // since, so this only differs for a direct call — but if it does, the
    // play goes ahead without the item, and says so.
    let itemInfo = null;
    if (item) {
      const problem = scored ? itemProblem(data, actor.id, item, { game, action }, now) : 'capped';
      if (problem) {
        itemInfo = { key: item, used: false, note: problem };
      } else {
        take(me, item);
        daily.itemUses = (daily.itemUses || 0) + 1;
        itemInfo = { key: item, used: true, note: null };
      }
    }
    const fx = itemInfo?.used ? itemEffect(item, game, action) : null;

    // Defences: one per incoming play, DAILY.defences a day, and only
    // against a play that scores — a capped doom costs its target nothing,
    // not even their shield. A shield block arrives as the outcome; Garlic
    // and the Antidote as resolvePlay's pick, used up here only if still
    // there.
    let defence = null;
    if (targetId && outcome === 'blocked' && scored) {
      defence = { key: 'shield' };
    } else if (targetId && scored && owns(DEFENCES, mods.defence) && defenceReady(data, targetId, mods.defence, now)) {
      take(them, mods.defence);
      const readyAt = now + DEFENCES[mods.defence].cooldownHours * 60 * 60 * 1000;
      (them.cooldowns ||= {})[mods.defence] = readyAt;
      defence = { key: mods.defence, readyAt };
    }
    if (defence) {
      const theirs = dayFor(data, targetId, today);
      theirs.defences = (theirs.defences || 0) + 1;
    }

    // R4: which happenings changed this play (their tags go on the label):
    // those that shaped the draw (resolvePlay), and those below
    const touched = new Set(Array.isArray(mods.happenings) ? mods.happenings : []);
    const good = GOOD.has(outcome);
    const bad = !good && outcome !== 'blocked';
    // Statuses act on a scored play where something happened (see above),
    // and never on a siege attack
    const acts = scored && outcome !== 'blocked' && !siege;
    pruneStatuses(me, now);
    const status = acts ? activeStatuses(me, now) : {};
    const statuses = [];
    // Lucky Break and Jinxed shaped the draw (resolvePlay); they're spent now
    for (const key of Array.isArray(mods.statuses) ? mods.statuses : []) {
      if (key !== 'luckybreak' && key !== 'jinxed') continue;
      if (!status[key]) continue;
      delete me.effects[key];
      statuses.push({ key });
    }

    // Points: base, then multipliers, then flat additions. A potted siege
    // attack works them out too, then scores 0: what it would have scored
    // is `potPoints`, kept on the fighter (siegeStore.notePotPoints) for a
    // win the daily reward limit holds back (applySiegeResult)
    let [actorPts, targetPts] = scored ? points : [0, 0];
    if (defence?.key === 'antid') [actorPts, targetPts] = DEFENCES.antid.points;
    // Happenings multiply BOTH sides; items and Director's Cut only your
    // gains. scalePoints caps the products (MULTIPLIER_CAPS), so an item
    // never makes a target lose more, and Double Feature on a Golden Pie
    // is ×3, not ×4.
    const hp = scored ? happeningPoints(live, { game, action, outcome }) : { mult: 1, kinds: [] };
    const scale = (cut) => scalePoints([actorPts, targetPts], { gain: (fx?.gain || 1) * hp.mult * cut, loss: hp.mult, target: hp.mult });
    // Director's Cut: the next GOOD outcome's points ×2 — spent on it even
    // when the cap leaves nothing to double, and the line says so
    const cut = acts && good && status.dcut;
    const scaled = scale(cut ? 2 : 1);
    if (cut) {
      statuses.push({ key: 'dcut', wasted: scaled[0] === scale(1)[0] });
      delete me.effects.dcut;
    }
    if (hp.kinds.length && (actorPts !== 0 || (targetId && targetPts !== 0))) hp.kinds.forEach(k => touched.add(k));
    [actorPts, targetPts] = scaled;
    if (fx?.actorPlus) actorPts += fx.actorPlus;
    if (fx?.targetPlus && targetId) targetPts += fx.targetPlus;
    // No happening, status or twist ever acts on a siege attack (above and
    // below), so this is all it would have scored — a backfire's −1 too, as
    // it would have at quick. A monster isn't a member: there's no target's
    // side to zero.
    const potPoints = potted ? actorPts : 0;
    if (potted) actorPts = 0;

    // Bitten: this play's gain halved, rounded down. Each acting play uses
    // one of its plays, gain or not — "for your next 3 plays".
    if (status.bitten) {
      status.bitten.playsLeft -= 1;
      if (actorPts > 0) {
        const before = actorPts;
        actorPts = Math.floor(actorPts / 2);
        statuses.push({ key: 'bitten', before, after: actorPts, left: status.bitten.playsLeft });
      }
    }

    // Streak: good outcomes extend it, bad ones end it; a blocked doom
    // neither. A bad outcome keeps it during Be Kind, Rewind (every play,
    // capped or not: it's the server's weather), or once with Second Wind
    // — spent only when there's a streak to keep, and not when a
    // happening is keeping it anyway.
    const all = statsFor(data, actor.id, actor.name, game, 'all');
    const life = me.lifetime;
    const hadStreak = (all.streak || 0) > 0 || (scored && (life.streak[game] || 0) > 0);
    const happeningLines = [];
    let kept = false;
    if (bad && hadStreak) {
      const keepers = streakKeepers(live);
      if (keepers.length) {
        kept = true;
        for (const k of keepers) {
          touched.add(k);
          happeningLines.push({ kind: 'keptStreak', happening: k });
        }
      } else if (status.secondwind) {
        kept = true;
        delete me.effects.secondwind;
        statuses.push({ key: 'secondwind' });
      }
    }
    if (good) all.streak = (all.streak || 0) + 1;
    else if (bad && !kept) all.streak = 0;

    for (const period of periods) {
      const s = statsFor(data, actor.id, actor.name, game, period);
      s.points += actorPts;
      s.plays += 1;
      if (scored) s.scoredPlays += 1;
      s.counts[outcome] = (s.counts[outcome] || 0) + 1;
      s.bestStreak = Math.max(s.bestStreak || 0, all.streak || 0);
      if (targetId) {
        const t = statsFor(data, targetId, target.name, game, period);
        t.points += targetPts;
        t.receivedPoints = (t.receivedPoints || 0) + targetPts;
        t.received[outcome] = (t.received[outcome] || 0) + 1;
      }
    }

    // Shields: a rescue grants one (Holy Water: 3× as long; Sunrise: 2×;
    // both: 6×, MULTIPLIER_CAPS.shield); a doom on a shielded member is
    // blocked and uses it up, and a Cursed VHS tears through it, using it
    // up too
    let shieldUntil = null;
    let shieldBroken = false;
    if (targetId && game === 'rescue' && SHIELDING.has(outcome) && settings.shieldMinutes > 0) {
      const sm = happeningMod(live, 'shieldMult');
      sm.kinds.forEach(k => touched.add(k));
      const times = Math.min(MULTIPLIER_CAPS.shield, (fx?.shieldTimes || 1) * sm.value);
      shieldUntil = now + Math.round(settings.shieldMinutes * 60 * 1000 * times);
      data.shields[targetId] = Math.max(data.shields[targetId] || 0, shieldUntil);
    }
    if (targetId && game === 'doom') {
      if (outcome === 'blocked') {
        if (scored) delete data.shields[targetId];
      } else if (fx?.ignoresDefences && shieldActive(data, targetId, now)) {
        delete data.shields[targetId];
        shieldBroken = true;
      }
    }
    for (const [id, until] of Object.entries(data.shields)) if (until <= now) delete data.shields[id];

    // ── rewards: scored plays only ──
    const rewards = [];
    const titles = [];
    const bonus = { [actor.id]: 0, ...(targetId ? { [targetId]: 0 } : {}) };
    // Bonus points go to the play's game, every current period, and are
    // kept apart as `bonus` as well as counted in `points`
    const give = (userId, name, pts) => {
      if (!pts) return;
      for (const period of periods) {
        const s = statsFor(data, userId, name, game, period);
        s.points += pts;
        s.bonus = (s.bonus || 0) + pts;
      }
      bonus[userId] += pts;
    };

    // What a twist may still take from the player: TWIST_RULES.dailyLoss a
    // day, all twists together, and never below 0 for the month (every
    // game this month, bonuses included, as their card adds it up)
    const lossRoom = () => Math.max(0, Math.min(TWIST_RULES.dailyLoss - (daily.twistLoss || 0), monthTotal(me, keys.month)));
    /** Take up to n points as a twist loss; returns what was taken */
    const takeLoss = (n) => {
      const taken = Math.max(0, Math.min(n, lossRoom()));
      if (taken) {
        give(actor.id, actor.name, -taken);
        daily.twistLoss = (daily.twistLoss || 0) + taken;
      }
      return taken;
    };

    // One recurring prize counter moves; a prize past today's cap waits
    // at need − 1 for the first qualifying play of the next day
    const bump = (who, userId, name, user, day, prize, inc) => {
      const progress = (user.progress ||= {});
      const have = (progress[prize.key] || 0) + inc;
      if (have < prize.need) {
        progress[prize.key] = have;
        return;
      }
      if ((day.prizes || 0) >= DAILY.prizes) {
        progress[prize.key] = prize.need - 1;
        const waiting = (user.waiting ||= {});
        if (!waiting[prize.key]) rewards.push({ kind: 'held', who, userId, prize: prize.key });
        waiting[prize.key] = today;
        return;
      }
      day.prizes = (day.prizes || 0) + 1;
      progress[prize.key] = have - prize.need;
      if (user.waiting) delete user.waiting[prize.key];
      const key = prize.item || RANDOM_PRIZE_ITEMS[Math.floor(luck() * RANDOM_PRIZE_ITEMS.length)];
      const overflow = !stash(user, key);
      give(userId, name, prize.points + (overflow ? FULL_STACK_POINTS : 0));
      rewards.push({ kind: 'prize', who, userId, prize: prize.key, item: key, points: prize.points, overflow });
    };

    const checkTitles = (who, userId, name, user) => {
      for (const title of TITLES) {
        if (owns(user.titles.earned, title.key) || !qualifiesFor(user, title)) continue;
        user.titles.earned[title.key] = now;
        give(userId, name, TITLE_POINTS);
        titles.push({ who, userId, key: title.key });
      }
    };

    /**
     * The twist roll (R4). One luck() draw says whether one fires
     * (settings.twistPercent% × the happenings' twistMult), one which —
     * among the twists that would DO something now, and only the good ones
     * after a bad one — and a third picks an item for Glovebox Find or a
     * Car Break-In. Its points are bonus, in this play's game; a status is
     * for the player's later plays. Never on a capped play or a blocked
     * doom (the caller's check), never more than TWIST_RULES.perDay a day,
     * and never to the target.
     */
    const rollTwist = () => {
      if ((settings.twists ?? DEFAULT_GAME_SETTINGS.twists) === false) return null;
      const percent = Number(settings.twistPercent ?? DEFAULT_GAME_SETTINGS.twistPercent);
      if (!(percent > 0) || (daily.twists || 0) >= TWIST_RULES.perDay) return null;
      const tm = happeningMod(live, 'twistMult');
      if (!(luck() < Math.min(1, (percent / 100) * tm.value))) return null;

      const streakNow = Math.max(all.streak || 0, life.streak[game] || 0);
      const stealable = Object.keys(ITEMS).filter(k => !TWIST_RULES.safe.includes(k) && (me.glovebox?.[k] || 0) > 0);
      // A twist that would do nothing isn't drawn: no loss left to take
      // today, no gain to cancel, no streak to freeze
      const idle = {
        pickpocket: lossRoom() <= 0,
        call: lossRoom() <= 0,
        reel: actorPts <= 0,
        brainfreeze: streakNow <= 0,
      };
      const pool = Object.keys(TWISTS).filter(k => (!me.lastTwistBad || TWISTS[k].good) && !idle[k]);
      let key = pickLine(pool.map(k => ({ outcome: k })), Object.fromEntries(pool.map(k => [k, TWISTS[k].weight])), luck).outcome;
      // A break-in on an empty Glovebox (or one holding only a Night
      // Light): nothing to steal, so the mosquitoes get them instead
      if (key === 'breakin' && !stealable.length) key = 'mosquito';

      const twist = { key, good: TWISTS[key].good };
      const anyOf = (list) => list[Math.min(list.length - 1, Math.floor(luck() * list.length))];
      switch (key) {
        case 'loose':
        case 'fan':
          give(actor.id, actor.name, TWISTS[key].points);
          twist.points = TWISTS[key].points;
          break;
        case 'find': {
          twist.item = anyOf(TWIST_RULES.findItems);
          twist.overflow = !stash(me, twist.item);
          if (twist.overflow) give(actor.id, actor.name, FULL_STACK_POINTS);
          break;
        }
        case 'ghost': {
          // A shield like a rescue's; one already up for longer stays as it is
          const until = now + TWIST_RULES.ghostMinutes * 60 * 1000;
          data.shields[actor.id] = Math.max(data.shields[actor.id] || 0, until);
          twist.until = data.shields[actor.id];
          break;
        }
        case 'pickpocket':
        case 'call':
          twist.points = -takeLoss(-TWISTS[key].points);
          break;
        case 'breakin':
          twist.item = anyOf(stealable);
          take(me, twist.item);
          break;
        case 'reel': {
          // This play's own points go; what it earned besides (a prize, a
          // title, the nights buff) stays. The points prize counter gives
          // back what it counted, as far as it can (a prize it paid stays).
          twist.cancelled = actorPts;
          for (const period of periods) statsFor(data, actor.id, actor.name, game, period).points -= actorPts;
          if (me.progress?.points) me.progress.points = Math.max(0, me.progress.points - actorPts);
          actorPts = 0;
          break;
        }
        case 'brainfreeze':
          twist.streak = streakNow;
          twist.gameName = GAME_NAMES[game] || game;
          all.streak = 0;
          life.streak[game] = 0;
          break;
        default:
          // luckybreak, refill, dcut, secondwind, bitten, jinxed, mosquito
          setStatus(me, key, now);
      }
      daily.twists = (daily.twists || 0) + 1;
      me.lastTwistBad = !twist.good;
      tm.kinds.forEach(k => touched.add(k));
      return twist;
    };

    let nights = null;
    let twist = null;
    if (scored) {
      // What titles count: scored plays only (gameRules.js lifetimeFrom).
      // The stats above count capped plays too, and keep doing so for the
      // card; these don't, so a capped play can't be farmed for a title.
      (life.do[game] ||= {})[outcome] = (life.do[game][outcome] || 0) + 1;
      if (good) {
        life.streak[game] = (life.streak[game] || 0) + 1;
        life.bestStreak = Math.max(life.bestStreak || 0, life.streak[game]);
      } else if (bad && !kept) {
        life.streak[game] = 0;
      }
      if (them) (them.lifetime.got[game] ||= {})[outcome] = (them.lifetime.got[game][outcome] || 0) + 1;

      // Statuses and happenings that add to (or take from) this play, as
      // bonus: Free Refill's +1 on a good outcome, a Mosquito bite (a
      // twist loss, so inside the day's and the month's floor), and a
      // happening's goodBonus (Friday the 13th)
      if (status.refill) {
        status.refill.playsLeft -= 1;
        if (good) {
          give(actor.id, actor.name, TWISTS.refill.points);
          statuses.push({ key: 'refill', points: TWISTS.refill.points, left: status.refill.playsLeft });
        }
      }
      if (status.mosquito) {
        status.mosquito.playsLeft -= 1;
        const bit = takeLoss(-TWISTS.mosquito.points);
        if (bit) statuses.push({ key: 'mosquito', points: -bit, left: status.mosquito.playsLeft });
      }
      if (good) {
        for (const h of live) {
          const n = Number(h.mods?.goodBonus);
          if (!(Number.isFinite(n) && n > 0)) continue;
          give(actor.id, actor.name, n);
          touched.add(h.kind);
          happeningLines.push({ kind: 'goodBonus', happening: h.kind, points: n });
        }
      }

      // Nights in a row (yours), and its tier's +1 on the day's first good outcomes
      nights = countNight(me, now);
      if (nights) {
        const tier = nightTier(nights.current);
        if (tier && good && (daily.buffs || 0) < tier.buffs) {
          daily.buffs = (daily.buffs || 0) + 1;
          give(actor.id, actor.name, 1);
          nights.buff = { tier, used: daily.buffs };
        }
        // Night Lights don't count toward the day's prizes
        if (nights.lightEarned) {
          const overflow = !stash(me, 'nlight');
          if (overflow) give(actor.id, actor.name, FULL_STACK_POINTS);
          rewards.push({ kind: 'nightlight', who: 'actor', userId: actor.id, current: nights.current, overflow });
        }
      }

      // Prize counters: your own outcomes, and positive play points as the
      // player or the target (never bonus points)
      for (const prize of PRIZES) {
        const inc = prize.key === 'points'
          ? Math.max(0, actorPts)
          : (prize.game === game && prize.outcomes.includes(outcome) ? 1 : 0);
        if (inc) bump('actor', actor.id, actor.name, me, daily, prize, inc);
      }
      if (them && targetPts > 0) bump('target', targetId, target.name, them, dayFor(data, targetId, today), PRIZE_BY_KEY.points, targetPts);

      checkTitles('actor', actor.id, actor.name, me);
      if (them) checkTitles('target', targetId, target.name, them);

      // The twist, last: it can cancel this play's gain (Reel Change) or
      // freeze the streak just extended (Brain Freeze), and the 30th earns
      // Plot Twist
      if (outcome !== 'blocked' && !siege) twist = rollTwist();
      if (twist) {
        life.twists = (life.twists || 0) + 1;
        checkTitles('actor', actor.id, actor.name, me);
      }
    }
    pruneStatuses(me, now);

    // A calendar happening is mentioned once per member per UTC day, on
    // the first play that day: it's on all day, with no announcement
    const calendar = [];
    for (const h of live) {
      if (!h.calendar || !h.kind) continue;
      const seen = (daily.calendar ||= []);
      if (seen.includes(h.kind)) continue;
      seen.push(h.kind);
      calendar.push({ kind: h.kind, name: h.name, emoji: h.emoji, about: h.about });
    }

    const byKind = new Map(live.map(h => [h.kind, h]));
    return {
      outcome,
      action,
      scored,
      capped: !scored,
      potted,
      potPoints,
      actorDelta: actorPts,
      targetDelta: targetId ? targetPts : null,
      actorPoints: me.games[game].all.points,
      streak: all.streak || 0,
      shieldedUntil: shieldUntil,
      targetId,
      item: itemInfo,
      defence,
      shieldBroken,
      rewards,
      titles,
      nights: nights && { current: nights.current, best: nights.best, saved: nights.saved, milestone: nights.milestone, buff: nights.buff },
      bonus: bonus[actor.id],
      targetBonus: targetId ? bonus[targetId] : 0,
      twist,
      statuses,
      // In the order the happenings are listed, each once
      happenings: live.filter(h => touched.has(h.kind)).map(h => ({ kind: h.kind, tag: h.tag || h.emoji || '' })),
      happeningLines: happeningLines.map(l => ({ ...l, happening: byKind.get(l.happening) || { kind: l.happening } })),
      calendar,
    };
  });
}

// ── a finished siege (R5) ───────────────────────────────────────────────

/** How many finished sieges' payouts are remembered, to make paying one idempotent */
const SIEGES_PAID_KEPT = 20;

/**
 * Pay out a finished siege — every fighter's points, loot, siege counters
 * and the titles those earn — in ONE load-modify-save. What each fighter
 * gets was decided by siegeStore.finishSiege (planSiegeRewards); this only
 * applies it, with the rules that need the scores file:
 *   - points go to the `siege` game, every current period, as bonus (so
 *     they never feed the points prize, as no bonus does)
 *   - a loss (an escape) never takes a member's month below 0, the same
 *     floor a twist's loss has (monthTotal)
 *   - loot goes in the Glovebox; a full stack is FULL_STACK_POINTS instead
 *   - lifetime.siege counts wins, MVPs and kaiju beaten, and any title
 *     that crosses its line is earned, +TITLE_POINTS, as on a play
 *   - a win's rewards (points, loot, the counters) are paid for at most
 *     SIEGE.rewardedPerDay sieges per member per UTC day (daily[uid].sieges):
 *     past that the grant is `limited`, paying nothing — admins can start
 *     sieges back to back, and nothing else stops one being farmed — but
 *     at a pot pace what its attacks would have scored (`g.own`), as they
 *     would have at quick
 *   - the server's sieges won and escaped are counted per period
 *     (siegeStats), for the leaderboard — once per siege id, like the rest
 *
 * Idempotent by siege id: the scores file remembers the last
 * SIEGES_PAID_KEPT payouts, and paying one again changes nothing and hands
 * back what it paid the first time. finishSiege writes the happenings file
 * after this one, so a kill between the two saves can't pay a siege twice.
 *
 * @param {string} guildId
 * @param {object} p
 * @param {string} p.siegeId
 * @param {Array<{userId, name, points?, loss?, loot?: ?string, win?, mvp?, kaiju?}>} p.grants
 * @param {'won'|'escaped'|'ended'} [p.status] - counted in siegeStats when won or escaped
 * @returns {{grants: Array<{userId, name, points, loot: ?{item, overflow}, titles: string[], total, limited?: true}>, repeat?: true}}
 *   points: the payout actually moved (a loss as a negative, after the floor);
 *   total: everything this siege moved for them (points, a full stack's
 *   +2, titles' +10s); limited: today's SIEGE.rewardedPerDay sieges were
 *   already rewarded, so this one paid nothing; every other field of the
 *   grant is passed through
 */
export function applySiegeResult(guildId, { siegeId, grants = [], status = null, now = Date.now() }) {
  return mutateScores(guildId, (data) => {
    const paid = (data.siegesPaid ||= {});
    if (owns(paid, siegeId)) return { grants: paid[siegeId].grants, repeat: true };
    const keys = periodKeys(now);
    const periods = Object.values(keys);
    const today = dayKey(now);
    if (status === 'won' || status === 'escaped') {
      for (const period of periods) {
        const st = ((data.siegeStats ||= {})[period] ||= { won: 0, escaped: 0 });
        st[status] = (st[status] || 0) + 1;
      }
    }

    const out = grants.map((g) => {
      const user = userFor(data, g.userId, g.name);
      seedTitles(user, now);
      const give = (pts) => {
        if (!pts) return;
        for (const period of periods) {
          const s = statsFor(data, g.userId, g.name, 'siege', period);
          s.points += pts;
          s.bonus = (s.bonus || 0) + pts;
        }
      };
      // A reward (a win's points, loot or counters) past today's limit is
      // held back whole; an escape's loss isn't a reward, and still applies
      const rewarding = (Number(g.points) || 0) > 0 || !!g.loot || !!g.win;
      if (rewarding) {
        const day = dayFor(data, g.userId, today);
        if ((day.sieges || 0) >= SIEGE.rewardedPerDay) {
          // At a pot pace the attacks' own points went into the pot, so
          // holding the share back left the member nothing for the fight —
          // where at quick the limit leaves exactly those points (they
          // scored as they landed). So they're paid here: what the attacks
          // would have scored (`own`, planSiegeRewards from notePotPoints),
          // never below 0. The limit still stops the farming it's for: no
          // share, no MVP bonus, no loot, no win (review, 2026-11-06).
          const own = Math.max(0, Math.round(Number(g.own) || 0));
          give(own);
          return { ...g, points: own, loot: null, win: false, mvp: false, kaiju: false, titles: [], total: own, limited: true };
        }
        day.sieges = (day.sieges || 0) + 1;
      }
      let points = Math.max(0, Math.round(Number(g.points) || 0));
      give(points);
      if (g.loss > 0) {
        const taken = Math.min(Math.round(g.loss), Math.max(0, monthTotal(user, keys.month)));
        give(-taken);
        points -= taken;
      }
      let loot = null;
      if (g.loot && owns(ITEMS, g.loot)) {
        const overflow = !stash(user, g.loot);
        if (overflow) give(FULL_STACK_POINTS);
        loot = { item: g.loot, overflow };
      }
      const counts = (user.lifetime.siege ||= { wins: 0, mvps: 0, kaiju: 0 });
      if (g.win) counts.wins = (counts.wins || 0) + 1;
      if (g.win && g.mvp) counts.mvps = (counts.mvps || 0) + 1;
      if (g.win && g.kaiju) counts.kaiju = (counts.kaiju || 0) + 1;
      // R6: a Silver Bullet every SIEGE wins (PRIZES 'siegewins'), outside
      // the daily prize cap: a paid win is already limited to 2 a day
      let prize = null;
      if (g.win) {
        const p = PRIZE_BY_KEY.siegewins;
        const progress = (user.progress ||= {});
        progress.siegewins = (progress.siegewins || 0) + 1;
        if (progress.siegewins >= p.need) {
          progress.siegewins -= p.need;
          const overflow = !stash(user, p.item);
          give(p.points + (overflow ? FULL_STACK_POINTS : 0));
          prize = { item: p.item, points: p.points, overflow };
        }
      }
      const titles = [];
      for (const title of TITLES) {
        if (owns(user.titles.earned, title.key) || !qualifiesFor(user, title)) continue;
        user.titles.earned[title.key] = now;
        give(TITLE_POINTS);
        titles.push(title.key);
      }
      const total = points + (loot?.overflow ? FULL_STACK_POINTS : 0) + titles.length * TITLE_POINTS
        + (prize ? prize.points + (prize.overflow ? FULL_STACK_POINTS : 0) : 0);
      return { ...g, points, loot, titles, total, ...(prize ? { prize } : {}) };
    });

    paid[siegeId] = { at: now, grants: out };
    const ids = Object.keys(paid).sort((a, b) => (paid[a].at || 0) - (paid[b].at || 0));
    for (const id of ids.slice(0, Math.max(0, ids.length - SIEGES_PAID_KEPT))) delete paid[id];
    return { grants: out };
  });
}

// ── the monster fights back (R6) ────────────────────────────────────────

/** How many digest penalties are remembered, to make each one idempotent */
const SIEGE_PENALTIES_KEPT = 100;

/** Give `pts` to a member's siege game, every current period, as bonus */
function giveSiege(data, userId, name, pts, now) {
  if (!pts) return;
  for (const period of Object.values(periodKeys(now))) {
    const s = statsFor(data, userId, name, 'siege', period);
    s.points += pts;
    s.bonus = (s.bonus || 0) + pts;
  }
}

/**
 * A member's Antidote fires by itself the moment the monster (or their own
 * fizzled potion) poisons them: held, off its cooldown, and a defence left
 * today. Used up, its cooldown starts, and it counts as one of the day's
 * defences — in ONE save of the scores file.
 * @returns {{fired: boolean}}
 */
export function fireAntidote(guildId, userId, now = Date.now()) {
  return mutateScores(guildId, (data) => {
    if (!data.users[userId] || !defenceReady(data, userId, 'antid', now)) return { fired: false };
    const user = data.users[userId];
    take(user, 'antid');
    (user.cooldowns ||= {}).antid = now + DEFENCES.antid.cooldownHours * 60 * 60 * 1000;
    const day = dayFor(data, userId, dayKey(now));
    day.defences = (day.defences || 0) + 1;
    return { fired: true };
  });
}

/**
 * A grabbed fighter nobody freed in time: −`loss`, never taking their
 * month below 0 (as an escape's loss), in the siege game as bonus.
 * Idempotent by `key` (siege, fighter and grab): a pass that dies after
 * this save and runs again can't take it twice.
 * @returns {{points: number, repeat?: true}} the points moved (≤ 0)
 */
export function applySiegePenalty(guildId, { key, userId, name, loss, now = Date.now() }) {
  return mutateScores(guildId, (data) => {
    const done = (data.siegePenalties ||= {});
    if (owns(done, key)) return { points: done[key].points, repeat: true };
    const user = userFor(data, userId, name);
    seedTitles(user, now);
    const taken = Math.min(Math.round(loss), Math.max(0, monthTotal(user, periodKeys(now).month)));
    giveSiege(data, userId, name, -taken, now);
    done[key] = { at: now, points: -taken };
    const keys = Object.keys(done).sort((a, b) => done[a].at - done[b].at);
    for (const k of keys.slice(0, Math.max(0, keys.length - SIEGE_PENALTIES_KEPT))) delete done[k];
    return { points: -taken };
  });
}

/**
 * One more of a member's siege counters that only R6 moves — `grabbed`
 * (an announced grab) or `assists` (a fighter freed or cured with a scored
 * play) — and any title it earns (Monster Chow, Field Medic), +TITLE_POINTS
 * to the siege game as bonus, in one save.
 * @returns {{titles: string[]}}
 */
export function countSiegeEvent(guildId, { userId, name, counter, now = Date.now() }) {
  return mutateScores(guildId, (data) => {
    const user = userFor(data, userId, name);
    seedTitles(user, now);
    const counts = (user.lifetime.siege ||= { wins: 0, mvps: 0, kaiju: 0 });
    counts[counter] = (counts[counter] || 0) + 1;
    const titles = [];
    for (const title of TITLES) {
      if (owns(user.titles.earned, title.key) || !qualifiesFor(user, title)) continue;
      user.titles.earned[title.key] = now;
      giveSiege(data, userId, name, TITLE_POINTS, now);
      titles.push(title.key);
    }
    return { titles };
  });
}

// ── reading ─────────────────────────────────────────────────────────────

const PERIOD_KEY = { 'all-time': 'all', year: 'year', month: 'month' };

/** 'all-time' | 'year' | 'month' → the stored key for now */
export function periodKey(period = 'all-time', now = Date.now()) {
  const keys = periodKeys(now);
  return keys[PERIOD_KEY[period] || 'all'];
}

/**
 * One person's stats in every game for a period, with their rank in each
 * (and overall) among everyone who has played.
 *
 * `games` is what the total, the overall rank and `players` count: the
 * games switched on, or the one game a card is about. A switched-off game
 * left in would rank someone on points their card doesn't show.
 * `players` is how many people that rank is out of ("2nd of 7 players").
 */
export function getScoreboard(guildId, userId, period = 'all-time', now = Date.now(), { games: counted = GAMES } = {}) {
  const data = loadScores(guildId);
  const key = periodKey(period, now);
  const user = data.users[userId];
  const games = {};
  for (const game of GAMES) {
    const s = user?.games?.[game]?.[key];
    const all = user?.games?.[game]?.all;
    games[game] = s
      ? { ...s, streak: all?.streak || 0, rank: rankOf(data, userId, [game], key) }
      : null;
  }
  const total = counted.reduce((n, g) => n + (games[g]?.points || 0), 0);
  const until = data.shields?.[userId];
  return {
    name: user?.name || null,
    games,
    total,
    rank: rankOf(data, userId, counted, key),
    // The same people rankOf ranks against, so a rank is never "3rd of 2"
    players: Object.values(data.users).filter(u => playedIn(u, counted, key)).length,
    shieldedUntil: until && until > now ? until : null,
  };
}

function pointsIn(user, games, key) {
  return games.reduce((n, g) => n + (user.games?.[g]?.[key]?.points || 0), 0);
}
function playedIn(user, games, key) {
  return games.some(g => user.games?.[g]?.[key]);
}

function rankOf(data, userId, games, key) {
  const me = data.users[userId];
  if (!me || !playedIn(me, games, key)) return null;
  const mine = pointsIn(me, games, key);
  return 1 + Object.values(data.users).filter(u => playedIn(u, games, key) && pointsIn(u, games, key) > mine).length;
}

/** What each game's "received" leaders are: the outcome counted, and its label */
export const RECEIVED_LEADERS = [
  { game: 'foodfight', outcome: 'hit', label: '🎯 Most splatted' },
  { game: 'foodfight', outcome: 'tasty', label: '🍽️ Best fed' },
  { game: 'doom', outcome: 'doomed', label: '💀 Most doomed' },
  { game: 'rescue', outcome: 'rescued', label: '🛟 Most rescued' },
  { game: 'potion', outcome: 'hurt', label: '☠️ Most poisoned' },
  { game: 'potion', outcome: 'helped', label: '💚 Most healed' },
];

/**
 * The server's standings for a game (or 'all') in a period: top players by
 * points, each game's leader, the "received" leaders, the best streak, and
 * the period's totals — everything /leaderboard's card shows.
 *
 * `games` is which games 'all' means: the ones switched on. A game an admin
 * turned off shouldn't decide who leads the server, or be "most played".
 *
 * @returns {{
 *   rows: Array<{userId, name, points, plays, shownTitle}>, // top `limit`
 *   perGame: Object<string, {userId, name, points, plays} | null>,
 *   received: Array<{label, userId, name, count}>,
 *   bestStreak: {userId, name, game, count} | null,
 *   totals: {players, plays, points, mostPlayed: {game, plays} | null, sieges?: {won, escaped}},
 * }}
 *   totals.sieges: the server's sieges won and escaped in the period (R5),
 *   on the all-games and Siege boards; absent when there were none
 */
export function getLeaderboard(guildId, game = 'all', period = 'all-time', { limit = 15, games: enabled = GAMES } = {}, now = Date.now()) {
  const data = loadScores(guildId);
  const key = periodKey(period, now);
  const games = game === 'all' ? enabled : [game];
  const users = Object.entries(data.users).filter(([, u]) => playedIn(u, games, key));

  // Standings over some games: anyone who played or was played on. Someone
  // whose only record is a blocked doom (0 and 0) isn't standing anywhere.
  const standings = (over) => users
    .map(([id, u]) => ({
      userId: id,
      name: u.name,
      points: pointsIn(u, over, key),
      plays: over.reduce((n, g) => n + (u.games?.[g]?.[key]?.plays || 0), 0),
    }))
    .filter(r => r.plays > 0 || r.points !== 0)
    .sort((a, b) => b.points - a.points || b.plays - a.plays || String(a.name).localeCompare(String(b.name)));

  const everyone = standings(games);
  // Each row carries the title its member shows (R3), for the badge
  const rows = everyone.slice(0, limit).map(r => ({ ...r, shownTitle: shownTitleOf(data.users[r.userId]) }));
  const perGame = Object.fromEntries(games.map(g => [g, standings([g])[0] || null]));

  const received = RECEIVED_LEADERS
    .filter(r => games.includes(r.game))
    .map(r => {
      const best = users
        .map(([id, u]) => ({ userId: id, name: u.name, count: u.games?.[r.game]?.[key]?.received?.[r.outcome] || 0 }))
        .sort((a, b) => b.count - a.count)[0];
      return best && best.count > 0 ? { label: r.label, ...best } : null;
    })
    .filter(Boolean);

  const streak = users
    .flatMap(([id, u]) => games.map(g => ({ userId: id, name: u.name, game: g, count: u.games?.[g]?.[key]?.bestStreak || 0 })))
    .sort((a, b) => b.count - a.count)[0];

  // Plays are counted once, by the player; points include what targets were
  // given or lost, so the period's points are everyone's net change.
  // Ties for most played go to the first game in GAMES order (a stable sort).
  const playsOf = (g) => users.reduce((n, [, u]) => n + (u.games?.[g]?.[key]?.plays || 0), 0);
  const mostPlayed = games.map(g => ({ game: g, plays: playsOf(g) })).sort((a, b) => b.plays - a.plays)[0];
  const totals = {
    players: everyone.length,
    plays: everyone.reduce((n, r) => n + r.plays, 0),
    points: everyone.reduce((n, r) => n + r.points, 0),
    mostPlayed: mostPlayed && mostPlayed.plays > 0 ? mostPlayed : null,
  };
  const sieges = games.includes('siege') ? data.siegeStats?.[key] : null;
  if (sieges && ((sieges.won || 0) + (sieges.escaped || 0)) > 0) totals.sieges = { won: sieges.won || 0, escaped: sieges.escaped || 0 };

  return { rows, perGame, received, bestStreak: streak && streak.count > 0 ? streak : null, totals };
}

// ── admin ───────────────────────────────────────────────────────────────

/**
 * Clear scores: everything, one game, one person, or one person's game.
 *
 * A person (or everyone) is cleared completely: points, the Glovebox,
 * titles, nights, prize counters, cooldowns, a twist's statuses and the
 * twist counts, their day's counters and their shield. One game clears
 * that game's stats and its prize counters, but keeps titles, the
 * Glovebox and statuses — they were earned (or suffered) in any game, and
 * the points counter (which spans every game) keeps going.
 * @returns {number} how many people's records changed
 */
export function resetScores(guildId, { game = null, userId = null } = {}) {
  return mutateScores(guildId, (data) => {
    let changed = 0;
    for (const [id, u] of Object.entries(data.users)) {
      if (userId && id !== userId) continue;
      if (game) {
        if (u.games?.[game]) { delete u.games[game]; changed++; }
        for (const p of PRIZES) {
          if (p.game !== game) continue;
          if (u.progress) delete u.progress[p.key];
          if (u.waiting) delete u.waiting[p.key];
        }
        // …and its title counts, so titles not yet earned there start over
        // (R5: the siege's own counters — wins, MVPs, kaiju — with it)
        if (u.lifetime) for (const side of ['do', 'got', 'streak']) delete u.lifetime[side]?.[game];
        if (u.lifetime && game === 'siege') delete u.lifetime.siege;
      } else {
        delete data.users[id];
        changed++;
      }
    }
    if (!game) {
      for (const id of Object.keys(data.shields)) if (!userId || id === userId) delete data.shields[id];
      for (const id of Object.keys(data.daily)) if (!userId || id === userId) delete data.daily[id];
    }
    // The server's sieges won and escaped go with the whole server's record,
    // or the siege game's (one person's reset leaves the server's count)
    if (!userId && (!game || game === 'siege')) delete data.siegeStats;
    return changed;
  });
}

/** Remove a server's whole score file (tests, and full resets) */
export function deleteScores(guildId) {
  for (const f of [fileFor(guildId), `${fileFor(guildId)}.tmp`, `${fileFor(guildId)}.bak`]) if (existsSync(f)) unlinkSync(f);
}

// ── play limits ─────────────────────────────────────────────────────────

// In memory: losing a 20-second cooldown to a restart is harmless
const recentPlays = new Map(); // `${guildId}:${userId}` → { last: {game: ms}, times: [ms] }

/**
 * May this person play this game now? Each game once per cooldown, and at
 * most perMinute plays across all games — quick enough to fire off a
 * potion, a throw and a rescue in a row, not enough to spam. Records the
 * play when it's allowed.
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function checkPlayLimit(guildId, userId, game, settings = DEFAULT_GAME_SETTINGS, now = Date.now()) {
  const key = `${guildId}:${userId}`;
  const rec = recentPlays.get(key) || { last: {}, times: [] };
  rec.times = rec.times.filter(t => now - t < 60 * 1000);

  const last = rec.last[game];
  const wait = last ? Math.ceil((last + settings.cooldownSeconds * 1000 - now) / 1000) : 0;
  if (wait > 0) {
    return { ok: false, message: `⏳ ${GAME_NAMES[game]} cooldown: ${wait}s. Try another game meanwhile!` };
  }
  if (rec.times.length >= settings.perMinute) {
    const free = Math.ceil((rec.times[0] + 60 * 1000 - now) / 1000);
    return { ok: false, message: `⏳ Easy there: ${settings.perMinute} plays a minute. Next one in ${free}s.` };
  }
  rec.last[game] = now;
  rec.times.push(now);
  recentPlays.set(key, rec);
  return { ok: true };
}

/** Forget recent plays (tests) */
export function resetPlayLimits() {
  recentPlays.clear();
}

// ── the result line ─────────────────────────────────────────────────────

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
/** A total, with the same minus sign as the change beside it */
const total = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

/**
 * The subtext line under a play: what happened to the points.
 * @param {object} result - from recordPlay
 * @param {object} names - { actor: display name, target: display name or null }
 */
export function resultLine(game, result, { actor, target }, { label } = {}) {
  if (result.outcome === 'blocked') {
    return `-# 🛡️ Blocked! ${target || 'They'} ${target ? 'was' : 'were'} shielded by a rescue. No points; the shield is used up.`;
  }
  if (result.capped) {
    return `-# ${actor} reached today's ${GAME_NAMES[game]} scoring cap: just for fun now.`;
  }
  const parts = [`${label ? `${label} ` : ''}${actor} ${signed(result.actorDelta)} (${total(result.actorPoints)} pts${result.streak >= 2 ? ` · 🔥 ${result.streak} in a row` : ''})`];
  if (result.targetDelta !== null && target) parts.push(`${target} ${signed(result.targetDelta)}`);
  if (result.shieldedUntil && target) parts.push(`🛡️ ${target} is shielded from /doom until <t:${Math.floor(result.shieldedUntil / 1000)}:t>`);
  return `-# ${parts.join(' · ')}`;
}

/**
 * The `-#` lines under the points line: an item used (or kept, and why),
 * a defence that fired, the statuses that acted on this play (R4), what a
 * happening did (a +1, a streak kept), a Night Light, a nights milestone
 * or buff, prizes (or one held by the daily cap), the twist (R4), titles,
 * and a calendar happening's once-a-day mention — in that order, which is
 * the order they happened in. finishPlay trims the play's own line to make
 * room for these, never these.
 * @param {object} result - from recordPlay
 * @param {{actor: string, target: ?string}} names - display names; target null when no member was scored
 * @returns {string[]}
 */
export function extraLines(result, { actor, target }) {
  const names = { actor, target };
  const who = (r) => (r.who === 'target' ? target : actor) || 'Someone';
  const out = [];

  const item = result.item;
  if (item?.used) {
    const line = ITEM_USED[item.key]?.[result.action];
    if (line) out.push(line(names, result));
  } else if (item?.note) {
    out.push(ITEM_KEPT[item.note === 'unknown' ? 'unfit' : item.note](item.key, names));
  }
  if (result.shieldBroken && target) out.push(SHIELD_BROKEN(names));
  if (result.defence && DEFENCE_LINES[result.defence.key] && target) out.push(DEFENCE_LINES[result.defence.key](names));

  const player = actor || 'Someone';
  for (const s of result.statuses || []) if (STATUS_USED[s.key]) out.push(STATUS_USED[s.key](s, player));
  for (const l of result.happeningLines || []) {
    if (l.kind === 'goodBonus') out.push(HAPPENING_LINES.goodBonus(l.happening, player, l.points));
    else if (l.kind === 'keptStreak') out.push(HAPPENING_LINES.keptStreak(l.happening, player));
  }

  const nights = result.nights;
  if (nights?.saved) out.push(NIGHT_LINES.saved({ who: actor, current: nights.current }));
  if (nights?.milestone) out.push(NIGHT_LINES.tier({ who: actor, current: nights.current, tier: nights.milestone }));
  if (nights?.buff) out.push(NIGHT_LINES.buff(nights.buff));

  for (const r of result.rewards || []) {
    if (r.kind === 'nightlight') out.push(NIGHT_LINES.light({ who: who(r), current: r.current, overflow: r.overflow }));
    else if (r.kind === 'prize') out.push(prizeLine({ who: who(r), prize: PRIZE_BY_KEY[r.prize], item: r.item, points: r.points, overflow: r.overflow }));
    else if (r.kind === 'held') out.push(prizeHeldLine({ who: who(r), prize: PRIZE_BY_KEY[r.prize] }));
  }
  if (result.twist) out.push(twistLine(result.twist, player));
  for (const t of result.titles || []) out.push(titleLine({ who: who(t), title: TITLE_BY_KEY[t.key] }));
  for (const h of result.calendar || []) out.push(calendarLine(h));

  return out.filter(Boolean).map(line => `-# ${line}`);
}
