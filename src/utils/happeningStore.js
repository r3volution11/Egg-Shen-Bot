/**
 * Happenings' state: one file per guild, guild_happenings/<guildId>.json.
 *
 * What's kept: the happening in progress (or the last one, until the next
 * starts), who has been playing lately (`activity`, so a happening only
 * starts when someone is around to see it), today's start count, and a
 * short history. The happenings themselves — names, mods, rates — are in
 * src/data/gameHappenings.js.
 *
 * Two kinds of reader:
 *   - every play (gamePlay/gameScores) calls activeHappenings() and
 *     noteActivity(). Both are synchronous, cheap, and never throw: a broken
 *     happenings file must never break a /doom.
 *   - the scheduler (happeningScheduler.js) and /eggshen-config-games start,
 *     announce and end them.
 *
 * Every change is ONE synchronous load-modify-save (mutate) with no await
 * inside, and every write after a start is keyed by the happening's id, so a
 * scheduler pass that awaited Discord can't write over a happening that
 * replaced the one it loaded (CLAUDE.md: never save an object loaded before
 * an await). Saving is atomic with a .bak, as escapeStore.js does.
 *
 * Schema (version 1):
 *   activity:  { channelId, at, recent: { [userId]: ms } }
 *   happening: null | { id, kind, source: 'random'|'admin', startedBy,
 *                startedAt, endsAt, channelId, messageId, claimedAt,
 *                unannounced, endedAt, endNoticeId }
 *   lastEndedAt, spawned: { day, count }, history: [≤20 {kind, source,
 *   startedAt, endedAt}]
 * Keys this module doesn't know (R5's siege) are kept as they are.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { HAPPENINGS, CALENDAR_HAPPENINGS, HAPPENING_RULES } from '../data/gameHappenings.js';
import { luck as gameLuck } from './gameLuck.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Overridable so each Jest worker gets its own directory (tests/jest.setup.js)
const happeningsDir = process.env.GUILD_HAPPENINGS_DIR || join(__dirname, '../../guild_happenings');

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A member's activity stamp is rewritten at most this often (it's written on every play) */
export const ACTIVITY_WRITE_MS = MINUTE;
/** Activity stamps older than this are dropped on the next write */
export const ACTIVITY_KEEP_MS = 7 * DAY;
const HISTORY_KEEP = 20;

/**
 * How many minutes a busy server spends "active" (2+ members played in the
 * last activeWindowMinutes) on a day it plays at all — the yardstick the
 * spawn chance is spread over. See spawnChance().
 *
 * Why 240: the games cluster around the evening watch party. A busy night is
 * about three hours of play, and the server stays "active" for the 30-minute
 * window after the last play, so roughly four hours of minutes pass the
 * player check. A fixed "60 ticks a day" would be wrong in both directions:
 * the scheduler ticks every minute of the day, but only the active minutes
 * may spawn, and how many there are depends entirely on the server.
 */
export const ACTIVE_MINUTES_PER_DAY = 240;

/** The scheduler checks once a minute; the spawn chance is per check */
export const SPAWN_TICK_MINUTES = 1;

// ── the real moon ───────────────────────────────────────────────────────

/** A known new moon (2000-01-06 18:14 UTC), and the mean synodic month */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_DAYS = 29.530588;

/** Days since the last new moon, 0 to 29.53 (the mean phase; good to within a day) */
export function moonAge(now = Date.now()) {
  const days = (now - NEW_MOON_EPOCH) / DAY;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

/**
 * Is the real moon full tonight? Within a day either side of the mean full
 * moon: the true one wanders up to ~14 hours from the mean, so ±1 day never
 * misses a real full moon and takes in the night before and after.
 */
export function isRealFullMoon(now = Date.now()) {
  return Math.abs(moonAge(now) - SYNODIC_DAYS / 2) <= 1;
}

// ── storage ─────────────────────────────────────────────────────────────

const filePath = (guildId) => join(happeningsDir, `${guildId}.json`);

/** The UTC day a moment falls on (gameScores.dayKey; not imported, as gameScores imports this) */
const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

const emptyActivity = () => ({ channelId: null, at: 0, recent: {} });
const emptyState = () => ({
  version: 1,
  activity: emptyActivity(),
  happening: null,
  lastEndedAt: 0,
  spawned: { day: null, count: 0 },
  history: [],
});

const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** Fill in whatever a file lacks (or has the wrong shape for), keeping keys we don't know */
function normalize(raw) {
  const data = { ...emptyState(), ...(isObject(raw) ? raw : {}) };
  if (!isObject(data.activity)) data.activity = emptyActivity();
  if (!isObject(data.activity.recent)) data.activity.recent = {};
  if (!isObject(data.happening) || !Object.hasOwn(HAPPENINGS, data.happening.kind)) data.happening = null;
  if (!isObject(data.spawned)) data.spawned = { day: null, count: 0 };
  if (!Array.isArray(data.history)) data.history = [];
  if (!Number.isFinite(data.lastEndedAt)) data.lastEndedAt = 0;
  return data;
}

/**
 * A guild's happenings state; an empty one if there's no file. A damaged
 * file is recovered from the .bak the last save kept and moved aside (as
 * loadEvent and loadScores do); with no usable .bak it's moved aside and
 * the guild starts fresh — losing activity stamps costs nothing.
 */
export function loadState(guildId) {
  const path = filePath(guildId);
  if (!existsSync(path)) return emptyState();
  try {
    return normalize(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    try {
      const restored = JSON.parse(readFileSync(`${path}.bak`, 'utf8'));
      renameSync(path, `${path}.damaged-${Date.now()}`);
      copyFileSync(`${path}.bak`, path);
      console.warn(`[Happenings] File for ${guildId} was damaged (${error.message}); restored the previous save`);
      return normalize(restored);
    } catch {
      console.error(`[Happenings] File for ${guildId} is damaged with no usable backup; moved aside:`, error.message);
      try { renameSync(path, `${path}.damaged-${Date.now()}`); } catch { /* already gone */ }
      return emptyState();
    }
  }
}

function saveState(guildId, data) {
  if (!existsSync(happeningsDir)) mkdirSync(happeningsDir, { recursive: true });
  const path = filePath(guildId);
  // Write-then-rename: a kill mid-save leaves the old file or the new one,
  // never half of one. The replaced version is kept as .bak.
  writeFileSync(`${path}.tmp`, JSON.stringify(data));
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  renameSync(`${path}.tmp`, path);
}

/**
 * Load, change, save — synchronously. `fn` returns the result to hand
 * back; a result with `error` saves nothing.
 */
export function mutate(guildId, fn) {
  const data = loadState(guildId);
  const result = fn(data);
  if (result?.error) return result;
  saveState(guildId, data);
  return result ?? {};
}

const newId = () => crypto.randomBytes(5).toString('hex');

/** Is this happening on at `now`? By the clock, not by whether anyone has ended it yet. */
export function inProgress(happening, now = Date.now()) {
  return !!happening && !happening.endedAt && now < happening.endsAt;
}

// ── read on every play ──────────────────────────────────────────────────

const describeHappening = (kind, def, extra) => ({
  kind, name: def.name, emoji: def.emoji, tag: def.tag, about: def.about, mods: def.mods, ...extra,
});

/** The calendar happenings on the (UTC) day `now` falls on */
export function calendarHappenings(now = Date.now()) {
  const day = new Date(now);
  const out = [];
  for (const [kind, def] of Object.entries(CALENDAR_HAPPENINGS)) {
    try {
      if (def.on(day)) out.push(describeHappening(kind, def, { endsAt: null, calendar: true }));
    } catch { /* a broken date rule mustn't stop the others */ }
  }
  return out;
}

/**
 * Everything bending the games right now: the random or admin-started
 * happening — only while `now < endsAt`, checked here, so a late or dead
 * scheduler can't stretch one — plus any calendar happening today.
 *
 * Synchronous and never throws: a missing or unreadable file means just
 * the calendar ones. Pass the game settings to honour the admin switch:
 * with `happenings: false` nothing is active, calendar ones included.
 *
 * @returns {Array<{kind, name, emoji, tag, about, mods, endsAt: ?number, calendar: boolean}>}
 */
export function activeHappenings(guildId, now = Date.now(), settings = null) {
  if (settings && settings.happenings === false) return [];
  const out = [];
  try {
    const h = loadState(guildId).happening;
    if (inProgress(h, now)) out.push(describeHappening(h.kind, HAPPENINGS[h.kind], { endsAt: h.endsAt, calendar: false }));
  } catch (error) {
    console.error(`[Happenings] Couldn't read happenings for ${guildId}:`, error.message);
  }
  try {
    out.push(...calendarHappenings(now));
  } catch { /* never */ }
  return out;
}

/**
 * Note that a member just played in `channelId`. Called on every play, so it
 * writes only when this member's stamp is over a minute old or the channel
 * changed (the last channel played in is one place a happening may be
 * announced); stamps over a week old are pruned on the write. Synchronous,
 * never throws.
 * @returns {boolean} whether it wrote
 */
export function noteActivity(guildId, { channelId = null, userId } = {}, now = Date.now()) {
  if (!guildId || !userId) return false;
  try {
    const { activity } = loadState(guildId);
    const last = activity.recent[userId];
    const channelChanged = !!channelId && activity.channelId !== channelId;
    if (Number.isFinite(last) && now - last < ACTIVITY_WRITE_MS && !channelChanged) return false;
    mutate(guildId, (data) => {
      const a = data.activity;
      a.recent[userId] = now;
      if (channelId) a.channelId = channelId;
      a.at = now;
      for (const [id, at] of Object.entries(a.recent)) {
        if (!Number.isFinite(at) || now - at > ACTIVITY_KEEP_MS) delete a.recent[id];
      }
    });
    return true;
  } catch (error) {
    console.error(`[Happenings] Couldn't note activity for ${guildId}:`, error.message);
    return false;
  }
}

/** Distinct members active in a state's activity within `minutes` of `now` */
function countRecent(data, minutes, now) {
  const since = now - minutes * MINUTE;
  return Object.values(data.activity.recent).filter(at => Number.isFinite(at) && at > since).length;
}

/** How many distinct members played in the last `minutes`. Never throws. */
export function recentPlayers(guildId, minutes = HAPPENING_RULES.activeWindowMinutes, now = Date.now()) {
  try {
    return countRecent(loadState(guildId), minutes, now);
  } catch {
    return 0;
  }
}

// ── start and end ───────────────────────────────────────────────────────

/** Put an ended happening into the history, and start the gap from when it stopped */
function finish(data, h, endedAt) {
  h.endedAt = endedAt;
  data.lastEndedAt = Math.max(data.lastEndedAt || 0, endedAt);
  data.history.push({ kind: h.kind, source: h.source, startedAt: h.startedAt, endedAt });
  if (data.history.length > HISTORY_KEEP) data.history = data.history.slice(-HISTORY_KEEP);
}

/** A happening that ran out but nobody ended (the scheduler was down) ends at its endsAt */
function settleExpired(data, now) {
  const h = data.happening;
  if (h && !h.endedAt && now >= h.endsAt) finish(data, h, h.endsAt);
}

const startedToday = (data, now) => (data.spawned?.day === dayKey(now) ? data.spawned.count || 0 : 0);

function begin(data, kind, { source, startedBy = null, channelId = null }, now) {
  settleExpired(data, now);
  const happening = {
    id: newId(),
    kind,
    source,
    startedBy,
    startedAt: now,
    endsAt: now + HAPPENINGS[kind].minutes * MINUTE,
    channelId, // where it's announced, once known
    messageId: null, // the announcement, once sent
    claimedAt: null, // set just BEFORE the announcement is sent (see claimAnnouncement)
    unannounced: null, // why it never will be: 'late' | 'no-channel' | 'send-failed'
    endedAt: null,
    endNoticeId: null, // the announcement, once edited to say it's over
  };
  data.happening = happening;
  // Admin starts count too: the daily limit is about how much a day holds
  data.spawned = { day: dayKey(now), count: startedToday(data, now) + 1 };
  return happening;
}

/**
 * Start a happening now. One at a time; an admin start (`source: 'admin'`)
 * skips the frequency, gap and daily limits, but not that.
 * @returns {{happening} | {error: 'unknown-kind'} | {error: 'in-progress', happening}}
 */
export function startHappening(guildId, kind, { source = 'admin', startedBy = null, channelId = null } = {}, now = Date.now()) {
  if (typeof kind !== 'string' || !Object.hasOwn(HAPPENINGS, kind)) return { error: 'unknown-kind' };
  return mutate(guildId, (data) => {
    if (inProgress(data.happening, now)) return { error: 'in-progress', happening: data.happening };
    return { happening: begin(data, kind, { source, startedBy, channelId }, now) };
  });
}

/**
 * End happening `id` now (or at its endsAt, if that's passed: the gap counts
 * from when it actually stopped). Keyed by id and idempotent: only the first
 * call reports `ended`.
 * @returns {{ended: true, happening} | {error}}
 */
export function endHappening(guildId, id, now = Date.now()) {
  return mutate(guildId, (data) => {
    const h = data.happening;
    if (!h || h.id !== id) return { error: 'not-current' };
    if (h.endedAt) return { error: 'already-ended', happening: h };
    finish(data, h, Math.min(now, h.endsAt));
    return { ended: true, happening: h };
  });
}

/**
 * Claim the right to announce happening `id`, saved BEFORE the send. Only
 * the first claim succeeds, so a send that may or may not have gone out
 * (the bot died mid-send) is never repeated: a restart can drop an
 * announcement, never send two.
 * @returns {{happening} | {error}}
 */
export function claimAnnouncement(guildId, id, channelId, now = Date.now()) {
  return mutate(guildId, (data) => {
    const h = data.happening;
    if (!h || h.id !== id) return { error: 'not-current' };
    if (h.endedAt) return { error: 'ended' };
    if (h.messageId || h.claimedAt || h.unannounced) return { error: 'already-claimed' };
    h.claimedAt = now;
    h.channelId = channelId;
    return { happening: h };
  });
}

/** The announcement for happening `id` was sent. Keyed by id, so it can't land on a newer one. */
export function recordHappeningMessage(guildId, id, messageId) {
  return mutate(guildId, (data) => {
    const h = data.happening;
    if (!h || h.id !== id) return { error: 'not-current' };
    h.messageId = messageId;
    return { happening: h };
  });
}

/** Happening `id` will never be announced (it still applies: plays carry its tag) */
export function markUnannounced(guildId, id, reason) {
  return mutate(guildId, (data) => {
    const h = data.happening;
    if (!h || h.id !== id) return { error: 'not-current' };
    if (h.messageId || h.unannounced) return { error: 'already-settled' };
    h.unannounced = reason;
    return { happening: h };
  });
}

/** The announcement of ended happening `id` has been edited to say so (or can't be) */
export function recordEndNotice(guildId, id, value) {
  return mutate(guildId, (data) => {
    const h = data.happening;
    if (!h || h.id !== id) return { error: 'not-current' };
    h.endNoticeId = value;
    return { happening: h };
  });
}

// ── random spawns ───────────────────────────────────────────────────────

/** The admin frequency's multiplier; an unset or unknown value is `normal` */
export function frequencyMultiplier(settings) {
  const f = settings?.happeningFrequency;
  return Object.hasOwn(HAPPENING_RULES.frequency, f ?? '') ? HAPPENING_RULES.frequency[f] : HAPPENING_RULES.frequency.normal;
}

/** A kind's rate tonight: Full Moon is likelier when the real moon is full */
export function kindRate(kind, now = Date.now()) {
  const rate = HAPPENINGS[kind].rate;
  return kind === 'fullmoon' && isRealFullMoon(now) ? rate * HAPPENING_RULES.realFullMoonBoost : rate;
}

/**
 * The chance that a random happening starts on one scheduler check.
 *
 * Each kind starts at its own pace: `rate` × frequency happenings per
 * active day, spread evenly over its ACTIVE_MINUTES_PER_DAY minutes. A
 * check in an active minute therefore starts *some* happening with chance
 *
 *     p = Σ rate(kind) × frequency × SPAWN_TICK_MINUTES / ACTIVE_MINUTES_PER_DAY
 *
 * summed over the kinds enough members are around for, and WHICH one is
 * drawn in proportion to rate. At `normal`, with every kind eligible,
 * Σ rate = 1.93, so p ≈ 0.8% a minute: over a 240-minute active day that's
 * 1.93 starts if nothing held them back. Something always does — one at a
 * time, 2 hours between, 3 a day — so a busy server really sees about one
 * a day at normal (tests/happening-store.test.js measures both).
 */
export function spawnChance(kinds, settings, now = Date.now()) {
  const total = kinds.reduce((sum, kind) => sum + kindRate(kind, now), 0);
  return Math.min(1, (total * frequencyMultiplier(settings) * SPAWN_TICK_MINUTES) / ACTIVE_MINUTES_PER_DAY);
}

/**
 * Could a random happening start now, and which kinds? Every rule but the
 * dice: switched on, nothing in progress, the gap since the last one, the
 * daily limit, and enough members active for each kind.
 * @returns {{ok: true, kinds: string[]} | {ok: false, reason: string}}
 */
export function spawnEligibility(data, settings, now = Date.now()) {
  if (settings?.happenings === false || frequencyMultiplier(settings) <= 0) return { ok: false, reason: 'off' };
  const h = data.happening;
  if (inProgress(h, now)) return { ok: false, reason: 'in-progress' };
  // One that ran out unended stopped at its endsAt
  const lastEnded = Math.max(data.lastEndedAt || 0, h && !h.endedAt ? h.endsAt : 0);
  if (now - lastEnded < HAPPENING_RULES.gapMinutes * MINUTE) return { ok: false, reason: 'gap' };
  if (startedToday(data, now) >= HAPPENING_RULES.maxPerDay) return { ok: false, reason: 'daily-limit' };
  const players = countRecent(data, HAPPENING_RULES.activeWindowMinutes, now);
  const kinds = Object.keys(HAPPENINGS).filter(k => HAPPENINGS[k].rate > 0 && players >= HAPPENINGS[k].minPlayers);
  if (!kinds.length) return { ok: false, reason: 'too-few-players' };
  return { ok: true, kinds };
}

/** Which kind, by rate weights, from a luck draw in [0, 1) */
function pickKind(kinds, now, r) {
  const weights = kinds.map(k => kindRate(k, now));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < kinds.length; i++) {
    x -= weights[i];
    if (x < 0) return kinds[i];
  }
  return kinds[kinds.length - 1];
}

/**
 * One scheduler check: maybe start a random happening. Synchronous; the
 * rules are re-checked on the file as loaded inside the one save, so two
 * passes (or a pass and an admin start) can't both start one.
 *
 * `luck` is two draws: whether (luck() < spawnChance) and which. With
 * GAME_LUCK=off luck() is just under 1, so nothing ever starts by chance.
 *
 * @returns {{happening} | null}
 */
export function maybeSpawn(guildId, settings, now = Date.now(), luck = gameLuck) {
  try {
    const result = mutate(guildId, (data) => {
      const eligible = spawnEligibility(data, settings, now);
      if (!eligible.ok) return { error: eligible.reason };
      if (!(luck() < spawnChance(eligible.kinds, settings, now))) return { error: 'not-this-time' };
      const kind = pickKind(eligible.kinds, now, luck());
      return { happening: begin(data, kind, { source: 'random' }, now) };
    });
    return result.happening ? { happening: result.happening } : null;
  } catch (error) {
    console.error(`[Happenings] Spawn check failed for ${guildId}:`, error.message);
    return null;
  }
}

/** Test-only: where the files are */
export const _happeningsDir = happeningsDir;
