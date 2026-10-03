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
 * with an atomic write (tmp + rename), so a restart can't leave a half-written
 * file and two plays can't overwrite each other (see CLAUDE.md).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

/** Outcomes that extend a streak; any other (but `blocked`) ends it */
const GOOD = new Set(['hit', 'tasty', 'doomed', 'rescued', 'helped', 'hurt']);

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

const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

// ── storage ─────────────────────────────────────────────────────────────

const fileFor = (guildId) => join(gamesDir, `${guildId}.json`);

export function loadScores(guildId) {
  const file = fileFor(guildId);
  if (!existsSync(file)) return { users: {}, daily: {}, shields: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { users: {}, daily: {}, shields: {}, ...data };
  } catch (error) {
    console.error(`[GameScores] Couldn't read scores for ${guildId}:`, error.message);
    return { users: {}, daily: {}, shields: {} };
  }
}

function saveScores(guildId, data) {
  if (!existsSync(gamesDir)) mkdirSync(gamesDir, { recursive: true });
  const file = fileFor(guildId);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}

const emptyStats = () => ({ points: 0, plays: 0, scoredPlays: 0, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 });

function statsFor(data, userId, name, game, period) {
  const user = (data.users[userId] ||= { name, games: {} });
  if (name) user.name = name;
  const g = (user.games[game] ||= {});
  return (g[period] ||= emptyStats());
}

// ── shields ─────────────────────────────────────────────────────────────

/** Until when this person is shielded from /doom, or null */
export function shieldedUntil(guildId, userId, now = Date.now()) {
  const until = loadScores(guildId).shields?.[userId];
  return until && until > now ? until : null;
}

// ── recording a play ────────────────────────────────────────────────────

/**
 * Record one play and move the points.
 * @param {string} guildId
 * @param {object} play
 * @param {string} play.game - one of GAMES
 * @param {{id: string, name: string}} play.actor
 * @param {{kind: string, pingUserIds: string[], name: string}} play.target - from resolveSocialTarget
 * @param {string} play.outcome - a key of POINTS[game]; for potions 'worked' or 'backfired'
 * @param {'helpful'|'harmful'} [play.effect] - potions only
 * @param {object} [play.settings] - getGameSettings(config)
 * @returns {{outcome, scored, capped, actorDelta, targetDelta, actorPoints, streak, shieldedUntil, targetId}}
 */
export function recordPlay(guildId, { game, actor, target, outcome, effect, settings = DEFAULT_GAME_SETTINGS }, now = Date.now()) {
  if (game === 'potion' && outcome === 'worked') outcome = effect === 'harmful' ? 'hurt' : 'helped';
  const points = POINTS[game]?.[outcome];
  if (!points) throw new Error(`Unknown outcome "${outcome}" for ${game}`);

  const data = loadScores(guildId);
  const periods = Object.values(periodKeys(now));

  // The daily cap: plays still happen and are counted, unscored
  const today = dayKey(now);
  const daily = (data.daily[actor.id] ||= { day: today, plays: {} });
  if (daily.day !== today) { daily.day = today; daily.plays = {}; }
  const playsToday = daily.plays[game] || 0;
  daily.plays[game] = playsToday + 1;
  const scored = playsToday < settings.dailyScoredPlays;

  // Only a member other than the actor is scored as a target. A role or
  // @everyone, or yourself, moves only your own points.
  const targetId = target?.kind === 'member' && target.pingUserIds[0] !== actor.id ? target.pingUserIds[0] : null;
  const [actorPts, targetPts] = scored ? points : [0, 0];

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

  // Shields: a rescue grants one; a doom on a shielded member uses it up
  let shieldUntil = null;
  if (targetId && game === 'rescue' && SHIELDING.has(outcome) && settings.shieldMinutes > 0) {
    shieldUntil = now + settings.shieldMinutes * 60 * 1000;
    data.shields[targetId] = Math.max(data.shields[targetId] || 0, shieldUntil);
  }
  if (targetId && game === 'doom' && outcome === 'blocked') delete data.shields[targetId];
  for (const [id, until] of Object.entries(data.shields)) if (until <= now) delete data.shields[id];

  saveScores(guildId, data);
  return {
    outcome,
    scored,
    capped: !scored,
    actorDelta: actorPts,
    targetDelta: targetId ? targetPts : null,
    actorPoints: data.users[actor.id].games[game].all.points,
    streak,
    shieldedUntil: shieldUntil,
    targetId,
  };
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
 */
export function getScoreboard(guildId, userId, period = 'all-time', now = Date.now()) {
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
  const total = GAMES.reduce((n, g) => n + (games[g]?.points || 0), 0);
  const until = data.shields?.[userId];
  return {
    name: user?.name || null,
    games,
    total,
    rank: rankOf(data, userId, GAMES, key),
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
 * points, the "received" leaders, and the best streak.
 */
export function getLeaderboard(guildId, game = 'all', period = 'all-time', { limit = 10 } = {}, now = Date.now()) {
  const data = loadScores(guildId);
  const key = periodKey(period, now);
  const games = game === 'all' ? GAMES : [game];
  const users = Object.entries(data.users).filter(([, u]) => playedIn(u, games, key));

  const rows = users
    .map(([id, u]) => ({
      userId: id,
      name: u.name,
      points: pointsIn(u, games, key),
      plays: games.reduce((n, g) => n + (u.games?.[g]?.[key]?.plays || 0), 0),
    }))
    .filter(r => r.plays > 0 || r.points !== 0)
    .sort((a, b) => b.points - a.points || b.plays - a.plays || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);

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

  return { rows, received, bestStreak: streak && streak.count > 0 ? streak : null };
}

// ── admin ───────────────────────────────────────────────────────────────

/**
 * Clear scores: everything, one game, one person, or one person's game.
 * @returns {number} how many people's records changed
 */
export function resetScores(guildId, { game = null, userId = null } = {}) {
  const data = loadScores(guildId);
  let changed = 0;
  for (const [id, u] of Object.entries(data.users)) {
    if (userId && id !== userId) continue;
    if (game) {
      if (u.games?.[game]) { delete u.games[game]; changed++; }
    } else {
      delete data.users[id];
      changed++;
    }
  }
  if (!game) {
    for (const id of Object.keys(data.shields)) if (!userId || id === userId) delete data.shields[id];
  }
  saveScores(guildId, data);
  return changed;
}

/** Remove a server's whole score file (tests, and full resets) */
export function deleteScores(guildId) {
  for (const f of [fileFor(guildId), `${fileFor(guildId)}.tmp`]) if (existsSync(f)) unlinkSync(f);
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
