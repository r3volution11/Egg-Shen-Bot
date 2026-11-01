/**
 * Scores for the social games: /potion, /foodfight, /doom and /rescue.
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
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ITEMS, DEFENCES, DAILY, FULL_STACK_POINTS, TITLE_POINTS, PRIZES, RANDOM_PRIZE_ITEMS, TITLES,
  NIGHTS_SHOWN, NIGHT_LIGHT_DAYS,
} from '../data/gameRewards.js';
import {
  ITEM_USED, ITEM_KEPT, SHIELD_BROKEN, DEFENCE_LINES, prizeLine, prizeHeldLine, titleLine, NIGHT_LINES,
} from '../data/gameRewardLines.js';
import {
  actionFor, itemEffect, scalePoints, nightKey, nightsBetween, shiftNight, nightTier, earnsNightLight, qualifiesFor,
  owns, lifetimeFrom,
} from './gameRules.js';
import { luck } from './gameLuck.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Overridable so test workers each use their own directory
const gamesDir = process.env.GUILD_GAMES_DIR || join(__dirname, '../../guild_games');

export const GAMES = ['potion', 'foodfight', 'doom', 'rescue'];

export const GAME_NAMES = {
  potion: 'Potions',
  foodfight: 'Food Fight',
  doom: 'Doom',
  rescue: 'Rescue',
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
};

/**
 * Outcomes that extend a streak; any other (but `blocked`) ends it. Also
 * what the nights-in-a-row buff pays on.
 */
export const GOOD = new Set(['hit', 'tasty', 'doomed', 'rescued', 'helped', 'hurt']);

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
};

/** The server's game settings. Configs predating the key lack it. */
export function getGameSettings(config) {
  const g = config?.games || {};
  const pick = (key, min, max) => {
    const v = Number(g[key]);
    return Number.isFinite(v) && v >= min && v <= max ? v : DEFAULT_GAME_SETTINGS[key];
  };
  return {
    cooldownSeconds: pick('cooldownSeconds', 0, 3600),
    perMinute: pick('perMinute', 1, 60),
    dailyScoredPlays: pick('dailyScoredPlays', 0, 1000),
    shieldMinutes: pick('shieldMinutes', 0, 1440),
    channelMode: ['all', 'only', 'except'].includes(g.channelMode) ? g.channelMode : 'all',
    channels: Array.isArray(g.channels) ? g.channels.filter(id => typeof id === 'string') : [],
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

// ── shields ─────────────────────────────────────────────────────────────

/** Until when this person is shielded from /doom, or null */
export function shieldedUntil(guildId, userId, now = Date.now()) {
  const until = loadScores(guildId).shields?.[userId];
  return until && until > now ? until : null;
}

// ── recording a play ────────────────────────────────────────────────────

/**
 * Record one play and move the points — and, since R3, everything a play
 * can earn — in ONE synchronous load-modify-save. In order:
 *   the daily cap → the item (a capped play ignores it completely) →
 *   defences (decided by resolvePlay, used up here) → base points →
 *   multipliers → flat additions → stats and shields → nights in a row and
 *   its buff → prize counters and prizes (DAILY.prizes a day) → titles,
 *   for the player and a member target.
 *
 * Commands reach this through finishPlay → resolvePlay, which draws the
 * line with the item and defences applied. Tests (and anything else) may
 * still pass a bare `outcome`, `'blocked'` included.
 *
 * Rewards are earned on scored plays only: a capped play still counts in
 * the stats, and what it adds to a title's count is picked up by the next
 * scored play.
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
 * @param {object} [play.mods] - from resolvePlay: { defence: 'garlic'|'antid' }
 * @returns {{outcome, action, scored, capped, actorDelta, targetDelta, actorPoints, streak, shieldedUntil, targetId,
 *   item: ?{key, used, note}, defence: ?{key, readyAt?}, shieldBroken, rewards: object[], titles: object[],
 *   nights: ?object, bonus: number, targetBonus: number}}
 */
export function recordPlay(guildId, { game, action = null, actor, target, outcome, effect, settings = DEFAULT_GAME_SETTINGS, item = null, mods = {} }, now = Date.now()) {
  if (game === 'potion' && outcome === 'worked') outcome = effect === 'harmful' ? 'hurt' : 'helped';
  const points = owns(POINTS, game) && owns(POINTS[game], outcome) ? POINTS[game][outcome] : null;
  if (!points) throw new Error(`Unknown outcome "${outcome}" for ${game}`);
  action ||= actionFor(game, outcome);

  return mutateScores(guildId, (data) => {
    const periods = Object.values(periodKeys(now));
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

    // Points: base, then multipliers, then flat additions
    let [actorPts, targetPts] = scored ? points : [0, 0];
    if (defence?.key === 'antid') [actorPts, targetPts] = DEFENCES.antid.points;
    [actorPts, targetPts] = scalePoints([actorPts, targetPts], { gain: fx?.gain || 1 });
    if (fx?.actorPlus) actorPts += fx.actorPlus;
    if (fx?.targetPlus && targetId) targetPts += fx.targetPlus;

    // Streak: good outcomes extend it, bad ones end it; a blocked doom neither
    const all = statsFor(data, actor.id, actor.name, game, 'all');
    if (GOOD.has(outcome)) all.streak = (all.streak || 0) + 1;
    else if (outcome !== 'blocked') all.streak = 0;
    const streak = all.streak || 0;

    for (const period of periods) {
      const s = statsFor(data, actor.id, actor.name, game, period);
      s.points += actorPts;
      s.plays += 1;
      if (scored) s.scoredPlays += 1;
      s.counts[outcome] = (s.counts[outcome] || 0) + 1;
      s.bestStreak = Math.max(s.bestStreak || 0, streak);
      if (targetId) {
        const t = statsFor(data, targetId, target.name, game, period);
        t.points += targetPts;
        t.receivedPoints = (t.receivedPoints || 0) + targetPts;
        t.received[outcome] = (t.received[outcome] || 0) + 1;
      }
    }

    // Shields: a rescue grants one (Holy Water: 3× as long); a doom on a
    // shielded member is blocked and uses it up, and a Cursed VHS tears
    // through it, using it up too
    let shieldUntil = null;
    let shieldBroken = false;
    if (targetId && game === 'rescue' && SHIELDING.has(outcome) && settings.shieldMinutes > 0) {
      shieldUntil = now + settings.shieldMinutes * 60 * 1000 * (fx?.shieldTimes || 1);
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

    let nights = null;
    if (scored) {
      // What titles count: scored plays only (gameRules.js lifetimeFrom).
      // The stats above count capped plays too, and keep doing so for the
      // card; these don't, so a capped play can't be farmed for a title.
      const mine = me.lifetime;
      (mine.do[game] ||= {})[outcome] = (mine.do[game][outcome] || 0) + 1;
      if (GOOD.has(outcome)) {
        mine.streak[game] = (mine.streak[game] || 0) + 1;
        mine.bestStreak = Math.max(mine.bestStreak || 0, mine.streak[game]);
      } else if (outcome !== 'blocked') {
        mine.streak[game] = 0;
      }
      if (them) (them.lifetime.got[game] ||= {})[outcome] = (them.lifetime.got[game][outcome] || 0) + 1;

      // Nights in a row (yours), and its tier's +1 on the day's first good outcomes
      nights = countNight(me, now);
      if (nights) {
        const tier = nightTier(nights.current);
        if (tier && GOOD.has(outcome) && (daily.buffs || 0) < tier.buffs) {
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
    }

    return {
      outcome,
      action,
      scored,
      capped: !scored,
      actorDelta: actorPts,
      targetDelta: targetId ? targetPts : null,
      actorPoints: me.games[game].all.points,
      streak,
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
    };
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
 *   totals: {players, plays, points, mostPlayed: {game, plays} | null},
 * }}
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

  return { rows, perGame, received, bestStreak: streak && streak.count > 0 ? streak : null, totals };
}

// ── admin ───────────────────────────────────────────────────────────────

/**
 * Clear scores: everything, one game, one person, or one person's game.
 *
 * A person (or everyone) is cleared completely: points, the Glovebox,
 * titles, nights, prize counters, cooldowns, their day's counters and
 * their shield. One game clears that game's stats and its prize counters,
 * but keeps titles and the Glovebox — they were earned, and the points
 * counter (which spans every game) keeps going.
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
        if (u.lifetime) for (const side of ['do', 'got', 'streak']) delete u.lifetime[side]?.[game];
      } else {
        delete data.users[id];
        changed++;
      }
    }
    if (!game) {
      for (const id of Object.keys(data.shields)) if (!userId || id === userId) delete data.shields[id];
      for (const id of Object.keys(data.daily)) if (!userId || id === userId) delete data.daily[id];
    }
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
 * a defence that fired, a Night Light, a nights milestone or buff, prizes
 * (or one held by the daily cap), and titles — in that order. finishPlay
 * trims the play's own line to make room for these, never these.
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

  const nights = result.nights;
  if (nights?.saved) out.push(NIGHT_LINES.saved({ who: actor, current: nights.current }));
  if (nights?.milestone) out.push(NIGHT_LINES.tier({ who: actor, current: nights.current, tier: nights.milestone }));
  if (nights?.buff) out.push(NIGHT_LINES.buff(nights.buff));

  for (const r of result.rewards || []) {
    if (r.kind === 'nightlight') out.push(NIGHT_LINES.light({ who: who(r), current: r.current, overflow: r.overflow }));
    else if (r.kind === 'prize') out.push(prizeLine({ who: who(r), prize: PRIZE_BY_KEY[r.prize], item: r.item, points: r.points, overflow: r.overflow }));
    else if (r.kind === 'held') out.push(prizeHeldLine({ who: who(r), prize: PRIZE_BY_KEY[r.prize] }));
  }
  for (const t of result.titles || []) out.push(titleLine({ who: who(t), title: TITLE_BY_KEY[t.key] }));

  return out.map(line => `-# ${line}`);
}
