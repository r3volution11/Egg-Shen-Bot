/**
 * /siege's state and rules (R5): a monster the whole server fights
 * together. The monsters are in src/data/siegeMonsters.js, the numbers in
 * SIEGE (src/data/gameRewards.js); the card is drawn by siegeCard.js and
 * the clock is the happening scheduler's (happeningScheduler.js).
 *
 * The siege lives in the happenings file (happeningStore.js keeps keys it
 * doesn't know) as `siege`, with the server's difficulty dial `siegeDial`
 * and `lastSiegeAt` beside it:
 *
 *   siege: null | {
 *     id, monster (a MONSTERS key), status: 'live'|'won'|'escaped'|'ended',
 *     source: 'admin'|'random', startedBy, channelId,
 *     startedAt, endsAt, finishedAt, hp, maxHp, a7, dial, healed,
 *     poolScale,  // a random siege's win pool × this (SIEGE.random)
 *     participants: { [userId]: { name, damage, attacks, frees, cures,
 *       firstAt, firstAttackAt, lastAt, spooked,
 *       poison: {perMin, until, lastTickAt}|null,   // theirs ON the monster
 *       caught: null | {at, until, actionId, by: 'monster'|'sacrifice'},
 *       poisoned: null | {at, until (null: until cured), actionId, by: 'monster'|'fizzle'},
 *       out } },
 *     nextActionAt,  // R6: when the monster acts next
 *     pending: null | {id, kind: 'grab'|'poison'|'roar', victims, line, decidedAt, claimedAt},
 *     lastAction: null | {id, kind, victims, messageId, at},
 *     killingBlow: null | { userId, name, at, by },
 *     log: [≤ SIEGE.logKeep { at, text }],
 *     rev,  // bumped by every change the card shows; markCardEdited compares it
 *     card: null | { messageId, dirty, editedAt, claimedAt, gone },
 *     result: null | { status, grants, mvp, announcedAt, messageId, claimedAt, tries, unannounced },
 *   }
 *   unannounced: why results were never posted — 'no-channel'/'send-failed'
 *   (SIEGE.resultTries refusals), 'refused' (Discord won't take it),
 *   'send-unknown' (a send that may have gone out), 'restart' (a claim a
 *   restart cut short), 'unknown-monster' (closed: its monster is gone)
 *
 * R6, the monster fights back: every few minutes it grabs, poisons or
 * roars (decideAction → the scheduler pings the victims with a NEW message
 * → markAnnounced applies it). Another member's /rescue frees a grabbed
 * fighter and a helpful /potion cures a poisoned one (siegeAssist, inside
 * the play's own synchronous block); one not freed in time is digested
 * (digestDue). The action is claimed before its ping is sent and applied
 * after: one whose ping never went out is void (voidStaleAction), so a
 * restart can never punish someone who wasn't told.
 *
 * Every change is ONE synchronous load-modify-save (happeningStore.mutate)
 * keyed by the siege's id: a late write for a siege that has since ended
 * or been replaced finds a different id, or a status that isn't live, and
 * does nothing (CLAUDE.md: never save an object loaded before an await).
 * The Discord side — posting the arrival, editing the card, posting the
 * results — is claim-before-send, like a happening's announcement: the
 * claim is saved before the send, so a restart can drop a message but
 * never post one twice.
 */

import crypto from 'crypto';
import { mutate, loadState, ACTIVE_MINUTES_PER_DAY } from './happeningStore.js';
import { applySiegeResult, fireAntidote, applySiegePenalty, countSiegeEvent } from './gameScores.js';
import { owns } from './gameRules.js';
import { cardName } from './gameBoards.js';
import { clipText } from './embedFit.js';
import { luck as gameLuck } from './gameLuck.js';
import { SIEGE, RANDOM_PRIZE_ITEMS } from '../data/gameRewards.js';
import { MONSTERS, MONSTER_KEYS } from '../data/siegeMonsters.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/**
 * A multiplier from the monster data: a finite number ≥ 0, else `fallback`.
 * Not `Number(x) || 1`: a monster that shrugs a weapon off (×0) must stay ×0.
 */
const factor = (x, fallback = 1) => {
  const n = Number(x);
  return x !== null && x !== undefined && x !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

export const SIEGE_STATUSES = Object.freeze(['live', 'won', 'escaped', 'ended']);

/** A monster by key, or null (a key from a file or an option is checked, not trusted) */
export const monsterOf = (key) => (owns(MONSTERS, key) ? MONSTERS[key] : null);

/** "**The Blob**": how a monster is named in a play's line, where {target} goes */
export const monsterMention = (monster) => `**${monster.name}**`;

/**
 * The monster as a play's target, for resolvePlay and recordPlay: not a
 * member, so only the attacker is scored, and nobody is pinged for it.
 */
export const monsterTarget = (monster) => ({
  kind: 'monster', name: monster.name, mention: monsterMention(monster), pingUserIds: [], isBot: false,
});

// ── the numbers ─────────────────────────────────────────────────────────

/** The server's difficulty dial: stored next to the siege, 1 until a siege moves it */
export function dialOf(data) {
  const d = Number(data?.siegeDial);
  return Number.isFinite(d) && d > 0 ? clamp(d, SIEGE.dial.min, SIEGE.dial.max) : SIEGE.dial.start;
}

/**
 * The dial after a finish: moved only by a win or an escape that enough
 * fought — and an escape only when they dealt at least
 * SIEGE.dialEscapeMinDamage of its max HP (`damageShare`). Without that,
 * two members letting sieges walk away untouched drove the dial to its
 * floor, and every monster after was trivial for everyone.
 */
export function nextDial(dial, status, fighters, damageShare = 1) {
  if (fighters < SIEGE.dial.minFighters) return dial;
  if (status === 'escaped' && !(damageShare >= SIEGE.dialEscapeMinDamage)) return dial;
  const factor = status === 'won' ? SIEGE.dial.win : status === 'escaped' ? SIEGE.dial.escape : 1;
  // Rounded so the file doesn't grow 0.30000000000000004s
  return Math.round(clamp(dial * factor, SIEGE.dial.min, SIEGE.dial.max) * 1e6) / 1e6;
}

/**
 * HP = round(clamp((2·A7 + 45·F)·D, 40, 2000) · monster.hp), with F the
 * fighters so far: what a siege starts with (F = 0) and what its max HP is
 * as fighters join. The floor and the ceiling apply to the whole sum, so
 * a small server's first fighter lifts a 40-HP monster to 45, not 85.
 */
export function siegeHp({ a7 = 0, fighters = 0, dial = SIEGE.dial.start, monsterHp = 1 } = {}) {
  const { perActive, perFighter, min, max } = SIEGE.hp;
  return Math.round(clamp((perActive * a7 + perFighter * fighters) * dial, min, max) * monsterHp);
}

/**
 * What a new fighter's first attack adds to max and current HP: the
 * formula's max HP with `fighters` (them included) less what it is now,
 * never negative — so never past the ceiling, and a server whose activity
 * already set the HP above what its fighters would grows nothing at first.
 */
export function joinGrowth(maxHp, { a7 = 0, fighters = 1, dial = SIEGE.dial.start, monsterHp = 1 } = {}) {
  return Math.max(0, siegeHp({ a7, fighters, dial, monsterHp }) - maxHp);
}

/** Does a fighter joining at `now` still grow the monster? Not in its last SIEGE.noGrowthLastMinutes */
export const growsAt = (siege, now) => now < siege.endsAt - SIEGE.noGrowthLastMinutes * MINUTE;

/** A7: members with a play in the last SIEGE.hp.activeDays days (happenings' activity.recent) */
export function activeMembers(state, now = Date.now()) {
  const since = now - SIEGE.hp.activeDays * DAY;
  const recent = isObject(state?.activity?.recent) ? state.activity.recent : {};
  return Object.values(recent).filter(at => Number.isFinite(at) && at > since).length;
}

/**
 * One attack's damage, before the monster's HP caps it: the outcome's base
 * × the monster's weapon multiplier × the Silver Bullet's, + the monster's
 * hitBonus on any hit that does damage, halved when the attacker is
 * Spooked. Rounded, never below 0.
 */
export function attackDamage({ outcome, weapon, monster, silver = false, spooked = false, poisoned = false }) {
  const base = owns(SIEGE.damage, outcome) ? SIEGE.damage[outcome] : 0;
  let raw = base * factor(monster?.damage?.[weapon]);
  if (silver) raw *= silverMultOf(monster);
  if (raw > 0) raw += factor(monster?.traits?.hitBonus, 0);
  if (spooked) raw *= SIEGE.spookedMult;
  // R6: a poisoned fighter (the monster's, or their own fizzle) hits at half
  if (poisoned) raw *= SIEGE.poisoned.mult;
  return Math.max(0, Math.round(raw));
}

// ── R6: a fighter's state ───────────────────────────────────────────────

/** Grabbed, and the grab announced: can't attack until freed */
export const isCaught = (p) => !!(p && isObject(p.caught) && p.caught.at);
/** Digested: out of this siege */
export const isOut = (p) => !!p?.out;
/** Poisoned by the monster (or their own fizzle) now: until cured, or its time */
export const poisonedNow = (p, now = Date.now()) => !!(p && isObject(p.poisoned) && (p.poisoned.until === null || now < p.poisoned.until));
/** Free to fight and to be acted on: has attacked, isn't caught, isn't out */
export const isFree = (p) => !!p && (p.attacks || 0) > 0 && !isCaught(p) && !isOut(p);

/** The poison's damage a minute on this monster (its traits.poisonMult) */
export function poisonPerMinute(monster) {
  return Math.max(0, Math.round(SIEGE.poison.perMinute * factor(monster?.traits?.poisonMult)));
}

/** The Silver Bullet's multiplier against this monster */
export function silverMultOf(monster) {
  return factor(monster?.traits?.silverMult, SIEGE.silverMult);
}

/** What a fighter did for the fight: damage, and (R6) fighters freed and poisons cured */
export const contributionOf = (p) => (Number(p?.damage) || 0) + SIEGE.credit.free * (Number(p?.frees) || 0) + SIEGE.credit.cure * (Number(p?.cures) || 0);

/**
 * The fighters, best first: by contribution, then who joined first, then
 * by id — so the MVP, the top 3 and the order luck is drawn in are the
 * same every time the same siege is read.
 * @returns {Array<{userId, name, damage, attacks, contribution, firstAt, ...}>}
 */
export function fightersOf(siege) {
  const all = isObject(siege?.participants) ? siege.participants : {};
  return Object.entries(all)
    .map(([userId, p]) => ({ ...p, userId, contribution: contributionOf(p) }))
    .filter(f => (f.attacks || 0) > 0 || f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution || (a.firstAt || 0) - (b.firstAt || 0) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/** One fighter's place: { damage, contribution, rank, of } or null if they haven't fought */
export function standingOf(siege, userId) {
  const fighters = fightersOf(siege);
  const i = fighters.findIndex(f => f.userId === userId);
  if (i < 0) return null;
  return { damage: fighters[i].damage || 0, contribution: fighters[i].contribution, rank: i + 1, of: fighters.length };
}

/**
 * Who gets what when a siege finishes — pure: the scores file applies it
 * (applySiegeResult), and holds back a member's rewards past
 * SIEGE.rewardedPerDay sieges today. Luck is drawn in the fighters' order
 * (fightersOf): the MVP's loot first (silver or not, then which item),
 * then, for each other fighter with at least SIEGE.rewards.lootShare of
 * the contribution, whether they get loot and, if so, which.
 *
 *   won:     a pool of 8 a fighter (24–200) split by contribution share,
 *            each 2–30; the MVP +5 and loot for sure; the others 25% ×
 *            traits.loot. Every fighter's win counts; the MVP's MVP; a
 *            beaten SIEGE.kaiju counts for everyone. ONE fighter alone
 *            gets the pool share only (`solo`): no bonus, no loot, no win.
 *   escaped: −3 for everyone who attacked, when 2 or more fought.
 *   ended:   nothing (an admin called it off).
 *
 * @returns {{grants: object[], mvp: ?{userId, name}}}
 */
export function planSiegeRewards(siege, status, luck = gameLuck) {
  const monster = monsterOf(siege?.monster);
  const fighters = fightersOf(siege);
  const base = (f) => ({ userId: f.userId, name: f.name, damage: f.damage || 0, contribution: f.contribution, attacks: f.attacks || 0 });

  if (status === 'won' && fighters.length) {
    const r = SIEGE.rewards;
    // One fighter alone: the pool share and nothing more (siege titles need company)
    const solo = fighters.length === 1;
    // A random siege's pool is scaled (SIEGE.random.poolScaleAt): a server
    // set to `often` gets more sieges, not more points
    const scale = Number.isFinite(siege.poolScale) && siege.poolScale > 0 ? Math.min(1, siege.poolScale) : 1;
    const pool = Math.round(clamp(r.perFighter * fighters.length, r.poolMin, r.poolMax) * scale);
    const total = fighters.reduce((n, f) => n + f.contribution, 0);
    const lootChance = Math.min(1, r.lootChance * factor(monster?.traits?.loot));
    const anyOf = (list) => list[Math.min(list.length - 1, Math.floor(luck() * list.length))];
    const lootItem = () => (luck() < r.silverChance ? 'silver' : anyOf(RANDOM_PRIZE_ITEMS));
    const grants = fighters.map((f, i) => {
      // A win needs damage, so total is above 0; split evenly if it somehow isn't
      const share = total > 0 ? f.contribution / total : 1 / fighters.length;
      const mvp = i === 0;
      let points = clamp(Math.round(pool * share), r.eachMin, r.eachMax);
      if (solo) return { ...base(f), share, points, loss: 0, loot: null, win: false, mvp: false, kaiju: false, solo: true };
      if (mvp) points += r.mvpBonus;
      let loot = null;
      if (mvp) loot = lootItem();
      else if (share >= r.lootShare && luck() < lootChance) loot = lootItem();
      return { ...base(f), share, points, loss: 0, loot, win: true, mvp, kaiju: siege.monster === SIEGE.kaiju };
    });
    return { grants, mvp: { userId: fighters[0].userId, name: fighters[0].name } };
  }

  if (status === 'escaped') {
    const penalised = fighters.length >= SIEGE.escape.minFighters;
    const grants = fighters.map(f => ({
      ...base(f), share: 0, points: 0, loss: penalised && (f.attacks || 0) > 0 ? SIEGE.escape.loss : 0, loot: null, win: false, mvp: false, kaiju: false,
    }));
    return { grants, mvp: null };
  }

  return { grants: [], mvp: null };
}

/**
 * A random monster for a siege nobody chose: by `weight`, among those in
 * season (`months`, UTC). One luck draw; with GAME_LUCK=off, the last.
 */
export function randomMonster(now = Date.now(), luck = gameLuck) {
  const month = new Date(now).getUTCMonth() + 1;
  const keys = MONSTER_KEYS.filter(k => MONSTERS[k].weight > 0 && (!Array.isArray(MONSTERS[k].months) || MONSTERS[k].months.includes(month)));
  const total = keys.reduce((n, k) => n + MONSTERS[k].weight, 0);
  let x = luck() * total;
  for (const k of keys) {
    x -= MONSTERS[k].weight;
    if (x < 0) return k;
  }
  return keys[keys.length - 1];
}

// ── reading ─────────────────────────────────────────────────────────────

/** The server's siege (live or the last one), or null. Never throws: the cards read it. */
export function currentSiege(guildId) {
  try {
    const s = loadState(guildId).siege;
    return isObject(s) && typeof s.id === 'string' && monsterOf(s.monster) ? s : null;
  } catch {
    return null;
  }
}

/** Can it still be attacked? Live, and its time not up — by the clock, not by whether the scheduler has noticed */
export const isLive = (siege, now = Date.now()) => !!siege && siege.status === 'live' && now < siege.endsAt;

/**
 * The live siege as the game card and the leaderboard show it — one line,
 * "🟢 The Blob is attacking! [bar] `412/980` HP · ends …" — with this
 * member's own damage and place when a member is given and has fought.
 * Null when no siege is on.
 * @returns {?{monster: string, emoji: string, hp, maxHp, endsAt, you: ?{damage, rank}}}
 */
export function siegeCardData(guildId, userId = null, now = Date.now()) {
  const s = currentSiege(guildId);
  if (!isLive(s, now)) return null;
  const m = monsterOf(s.monster);
  const me = userId ? standingOf(s, userId) : null;
  return {
    monster: m.name, emoji: m.emoji, hp: Math.max(0, s.hp), maxHp: s.maxHp, endsAt: s.endsAt,
    you: me ? { damage: me.damage, rank: me.rank } : null,
  };
}

/**
 * What the cards draw from a siege: the monster's words, HP, time, the
 * fighters and the top 3, the log, how it ended.
 */
export function siegeView(siege, now = Date.now()) {
  const monster = monsterOf(siege.monster);
  const fighters = fightersOf(siege);
  const all = Object.values(isObject(siege.participants) ? siege.participants : {});
  return {
    id: siege.id,
    monster: { key: siege.monster, name: monster.name, emoji: monster.emoji, about: monster.about },
    status: siege.status,
    hp: Math.max(0, siege.hp || 0),
    maxHp: Math.max(1, siege.maxHp || 1),
    startedAt: siege.startedAt,
    endsAt: siege.endsAt,
    finishedAt: siege.finishedAt || null,
    fighters: fighters.length,
    top: fighters.slice(0, 3).map(f => ({ userId: f.userId, name: f.name, damage: f.damage || 0, contribution: f.contribution })),
    log: Array.isArray(siege.log) ? siege.log : [],
    // R6: who's grabbed (and until when they can be freed), who's poisoned
    caught: all.filter(isCaught).map(p => ({ name: p.name, until: p.caught.until })).sort((a, b) => a.until - b.until),
    poisoned: all.filter(p => poisonedNow(p, now)).map(p => ({ name: p.name, until: p.poisoned.until })),
    killingBlow: siege.killingBlow || null,
    result: siege.result || null,
  };
}

// ── writing: every change keyed by the siege's id ───────────────────────

const newId = () => crypto.randomBytes(5).toString('hex');

/** The card shows something new: bump the revision, and mark it for the next edit */
function touch(s) {
  s.rev = (s.rev || 0) + 1;
  if (s.card) s.card.dirty = true;
}

/** Add a line to the card's log, keeping the last SIEGE.logKeep */
function log(s, text, at) {
  s.log = [...(Array.isArray(s.log) ? s.log : []), { at, text: clipText(text, 200) }].slice(-SIEGE.logKeep);
}

/**
 * Run fn on siege `siegeId`, if it's the current one; `{error: 'not-current'}`
 * otherwise, with nothing saved.
 */
function withSiege(guildId, siegeId, fn) {
  return mutate(guildId, (data) => {
    const s = data.siege;
    if (!isObject(s) || s.id !== siegeId) return { error: 'not-current' };
    return fn(s, data);
  });
}

/**
 * Close a live siege whose monster key no longer exists: ended, nothing
 * paid, nothing to post. (In place, inside the caller's mutate.)
 */
function closeOrphan(s, now) {
  if (s.status !== 'live') return false;
  s.status = 'ended';
  s.finishedAt = now;
  for (const p of Object.values(isObject(s.participants) ? s.participants : {})) if (isObject(p)) p.poison = null;
  s.result = { status: 'ended', grants: [], mvp: null, announcedAt: now, messageId: null, claimedAt: null, tries: 0, unannounced: 'unknown-monster' };
  if (s.card) s.card.dirty = false;
  return true;
}

/**
 * Close the stored siege if its monster is unknown (currentSiege hides it,
 * so nothing else can reach it — and a live one blocks every start and
 * every random happening). Called by the scheduler each pass and by
 * /siege end.
 * @returns {{siege} | {error}}
 */
export function closeOrphanSiege(guildId, now = Date.now()) {
  return mutate(guildId, (data) => {
    const s = data.siege;
    if (!isObject(s) || monsterOf(s.monster) || s.status !== 'live') return { error: 'none' };
    closeOrphan(s, now);
    return { siege: s };
  });
}

/** A results claim with no message recorded that's older than SIEGE.resultClaimMinutes: the bot died mid-send */
const staleClaim = (result, now) => !!result?.claimedAt && !result.announcedAt && now - result.claimedAt >= SIEGE.resultClaimMinutes * MINUTE;

/** Stop trying to post the results, for `reason` (in place, inside the caller's mutate) */
function giveUp(s, reason, now) {
  s.result.announcedAt = now;
  s.result.unannounced = reason;
}

const newFighter = (name, now) => ({
  name, damage: 0, attacks: 0, frees: 0, cures: 0, firstAt: now, firstAttackAt: null, lastAt: now,
  spooked: false, poison: null, caught: null, poisoned: null, out: false,
});

/**
 * Start a siege now. One at a time, and not while the last one's results
 * are still waiting to be posted (they'd be lost with it).
 * @param {object} p
 * @param {string} p.monster - a MONSTERS key
 * @param {number} p.minutes - how long it lasts (the caller resolves the option, the monster and the setting)
 * @returns {{siege} | {error: 'unknown-monster'|'bad-minutes'|'in-progress'|'results-pending', siege?}}
 */
export function spawnSiege(guildId, { monster, minutes, startedBy = null, channelId = null, source = 'admin', poolScale = 1, check = null }, now = Date.now()) {
  const m = monsterOf(monster);
  if (!m) return { error: 'unknown-monster' };
  if (!(Number.isFinite(minutes) && minutes > 0)) return { error: 'bad-minutes' };
  return mutate(guildId, (data) => {
    const old = isObject(data.siege) ? data.siege : null;
    // A siege whose monster no longer exists (a key renamed in a deploy)
    // can't be fought, shown or ended by anyone: it's closed, not waited on
    if (old && !monsterOf(old.monster)) closeOrphan(old, now);
    if (old?.status === 'live') return { error: 'in-progress', siege: old };
    if (old?.result && !old.result.announcedAt) {
      // Claimed and never recorded: a restart cut the send short. It's
      // never sent twice, so it's given up — and doesn't hold this start
      if (staleClaim(old.result, now)) giveUp(old, 'restart', now);
      else return { error: 'results-pending', siege: old };
    }
    // A random spawn re-checks its rules on the file as loaded here
    const refused = check ? check(data) : null;
    if (refused) return { error: refused };
    const a7 = activeMembers(data, now);
    const dial = dialOf(data);
    const hp = siegeHp({ a7, fighters: 0, dial, monsterHp: Number(m.hp) || 1 });
    const siege = {
      id: newId(),
      monster,
      status: 'live',
      source,
      startedBy,
      channelId,
      startedAt: now,
      endsAt: now + Math.round(minutes * MINUTE),
      finishedAt: null,
      hp,
      maxHp: hp,
      a7,
      dial, // what its HP was worked out with, and new fighters' growth is
      healed: 0, // HP the monster got back (Gremlins' misses, the Wolfman's actions)
      poolScale: Number.isFinite(poolScale) && poolScale > 0 ? Math.min(1, poolScale) : 1,
      participants: {},
      nextActionAt: now + SIEGE.actions.everyMinutes * MINUTE,
      pending: null,
      lastAction: null,
      killingBlow: null,
      log: [],
      rev: 0,
      card: null,
      result: null,
    };
    data.siege = siege;
    data.lastSiegeAt = now;
    return { siege };
  });
}

/**
 * Claim the right to post siege `siegeId`'s card, saved BEFORE the send:
 * only the first claim succeeds, so a send that may or may not have gone
 * out is never tried again — a restart can lose the card, never post two.
 */
export function claimCard(guildId, siegeId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.card) return { error: 'already-claimed' };
    s.card = { messageId: null, dirty: false, editedAt: null, claimedAt: now, gone: false };
    return { siege: s };
  });
}

/** The card was posted: its message id, and the revision it showed */
export function recordSiegeCard(guildId, siegeId, messageId, now = Date.now(), rev = null) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.card) return { error: 'not-claimed' };
    s.card.messageId = messageId;
    s.card.editedAt = now;
    s.card.dirty = rev !== null && rev !== (s.rev || 0);
    return { siege: s };
  });
}

/**
 * The card was edited to show revision `rev`. Anything that changed since
 * (an attack while the edit was in flight) leaves it dirty for the next.
 */
export function markCardEdited(guildId, siegeId, rev, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.card) return { error: 'not-claimed' };
    s.card.editedAt = now;
    s.card.dirty = rev !== (s.rev || 0);
    return { siege: s };
  });
}

/** The card's message is gone (deleted, or its channel): stop editing it */
export function markCardGone(guildId, siegeId) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.card) return { error: 'not-claimed' };
    s.card.gone = true;
    s.card.dirty = false;
    return { siege: s };
  });
}

/**
 * Whole minutes of a fighter's poison due up to `at` (capped by the
 * poison's end and the siege's), dealt to the monster and credited to
 * them; no overkill. A late scheduler pass catches up exactly: however
 * the minutes fall, one poison deals SIEGE.poison.minutes ticks.
 * @returns {number} HP removed
 */
function settlePoison(s, userId, p, at) {
  const po = p.poison;
  if (!isObject(po)) return 0;
  const end = Math.min(at, po.until, s.endsAt);
  const due = Math.max(0, Math.floor((end - po.lastTickAt) / MINUTE));
  let dealt = 0;
  if (due > 0) {
    const from = po.lastTickAt;
    const per = po.perMin || 0;
    dealt = Math.min(due * per, Math.max(0, s.hp));
    po.lastTickAt += due * MINUTE;
    if (dealt > 0) {
      s.hp -= dealt;
      p.damage = (p.damage || 0) + dealt;
      if (s.hp <= 0 && !s.killingBlow) {
        // The minute it actually ran out, not when a late pass noticed
        const at2 = from + Math.ceil(dealt / per) * MINUTE;
        s.killingBlow = { userId, name: p.name, at: at2, by: 'poison' };
        log(s, `🏆 ${cardName(p.name)}'s poison finished it off`, at2);
      }
    }
  }
  if (po.lastTickAt >= po.until || at >= s.endsAt) p.poison = null;
  return dealt;
}

/** What each outcome reads as in the card's log */
const LOG_VERBS = {
  splat: ['💥', 'splatted it'], splash: ['💨', 'missed'], splatback: ['🔄', 'got splattered back'],
  smite: ['⚡', 'smote it'], dodged: ['💨', 'was dodged'], spooked: ['😱', 'got spooked'],
  poisoned: ['🧪', 'poisoned it'], fizzled: ['🫧', 'fizzled'],
};

/**
 * One attack on siege `siegeId`. Called with no await since the caller's
 * own live check, the line draw (resolvePlay) and before recordPlay, so
 * all of them see the same files — and this re-checks everything anyway:
 * an attack landing after the monster died, its time ran out or an admin
 * ended it is refused here and records nothing.
 *
 * In order: a new fighter joins (HP grows); their poison's due minutes
 * are settled; the damage (attackDamage) comes off the HP, never below 0,
 * and is credited; Gremlins heal on a food miss; Spooked is spent or set;
 * a poison starts (or restarts); the killing blow; the log.
 *
 * @param {object} a
 * @param {string} a.userId
 * @param {string} a.name - display name
 * @param {'food'|'doom'|'potion'} a.weapon
 * @param {string} a.outcome - a siege outcome (POINTS.siege)
 * @param {boolean} [a.silver] - a Silver Bullet is being used
 * @returns {{siege, hit: {damage, raw, joined, healed, wasSpooked, spooked, poison: ?{perMin, minutes, restarted}, killingBlow: boolean, silverMult: ?number, hp, maxHp}}
 *   | {error: 'not-current'|'not-live'|'time-up'|'beaten'|'unknown-weapon', siege?}}
 */
export function siegeAttack(guildId, siegeId, { userId, name, weapon, outcome, silver = false }, now = Date.now()) {
  if (!owns(SIEGE.outcomes, weapon)) return { error: 'unknown-weapon' };
  return withSiege(guildId, siegeId, (s, data) => {
    const monster = monsterOf(s.monster);
    if (!monster) return { error: 'not-current' };
    if (s.status !== 'live') return { error: 'not-live', siege: s };
    if (now >= s.endsAt) return { error: 'time-up', siege: s };
    if (!(s.hp > 0)) return { error: 'beaten', siege: s };
    s.participants = isObject(s.participants) ? s.participants : {};
    // R6: grabbed or digested, they can't (the caller refused it first; this is the same check, saved)
    if (isCaught(s.participants[userId])) return { error: 'caught', siege: s };
    if (isOut(s.participants[userId])) return { error: 'out', siege: s };

    // A new fighter (their first attack — a member who only freed or cured
    // someone is in the fight with none yet): max HP becomes the formula's
    // with one more fighter, and current HP rises by the same (each fighter
    // once) — except in the last few minutes, when a newcomer mustn't hand
    // it the HP to escape
    let joined = 0;
    let p = s.participants[userId];
    if (!isObject(p)) p = s.participants[userId] = newFighter(name, now);
    if (!((p.attacks || 0) > 0)) {
      p.firstAttackAt = now;
      if (growsAt(s, now)) {
        // The dial this siege started with: it only moves when a siege ends
        const dial = Number.isFinite(s.dial) && s.dial > 0 ? s.dial : dialOf(data);
        const fighters = Object.values(s.participants).filter(x => (x.attacks || 0) > 0).length + 1;
        joined = joinGrowth(s.maxHp, { a7: Number(s.a7) || 0, fighters, dial, monsterHp: Number(monster.hp) || 1 });
        s.maxHp += joined;
        s.hp += joined;
      }
      if (joined) log(s, `📈 ${cardName(name)} joined the fight · +${joined} HP`, now);
    }
    p.name = name;

    // A restarted poison first deals the minutes the old one still owed
    if (outcome === 'poisoned') settlePoison(s, userId, p, now);

    const wasSpooked = !!p.spooked;
    const wasPoisoned = poisonedNow(p, now);
    const raw = attackDamage({ outcome, weapon, monster, silver, spooked: wasSpooked, poisoned: wasPoisoned });
    const damage = Math.min(raw, Math.max(0, s.hp));
    s.hp -= damage;
    p.damage = (p.damage || 0) + damage;

    // Gremlins: a missed throw feeds them
    let healed = 0;
    const missHeal = factor(monster.traits?.missHeal, 0);
    if (weapon === 'food' && outcome === 'splash' && missHeal > 0 && s.hp > 0) {
      healed = Math.min(Math.round(missHeal * s.maxHp), s.maxHp - s.hp);
      s.hp += healed;
      s.healed = (s.healed || 0) + healed;
    }

    // Spooked: this attack spent it; a spooked doom sets it for the next
    p.spooked = outcome === 'spooked';

    let poison = null;
    if (outcome === 'poisoned') {
      const perMin = poisonPerMinute(monster);
      const restarted = isObject(p.poison);
      p.poison = perMin > 0 ? { perMin, until: now + SIEGE.poison.minutes * MINUTE, lastTickAt: now } : null;
      if (p.poison) poison = { perMin, minutes: SIEGE.poison.minutes, restarted };
    }

    // R6: a potion that fizzles splashes back — the attacker is poisoned
    // too (their Antidote fires first, if it can)
    let selfPoisoned = null;
    if (outcome === 'fizzled') selfPoisoned = poisonFighter(guildId, s, userId, p, { by: 'fizzle', actionId: null, monster }, now);

    p.attacks = (p.attacks || 0) + 1;
    p.lastAt = now;

    const [icon, verb] = LOG_VERBS[outcome] || ['⚔️', 'attacked'];
    log(s, `${icon} ${cardName(name)} ${verb}${damage ? ` · ${damage}` : ''}${healed ? ` · it healed ${healed}` : ''}`, now);
    let killingBlow = false;
    if (s.hp <= 0 && damage > 0 && !s.killingBlow) {
      s.killingBlow = { userId, name, at: now, by: weapon };
      killingBlow = true;
      log(s, `🏆 ${cardName(name)} landed the killing blow`, now);
    }
    touch(s);
    return {
      siege: s,
      hit: {
        damage, raw, joined, healed, wasSpooked, wasPoisoned, spooked: p.spooked, poison, killingBlow, selfPoisoned,
        silverMult: silver ? silverMultOf(monster) : null, hp: s.hp, maxHp: s.maxHp,
      },
    };
  });
}

/**
 * The scheduler's minute: every poison's due ticks, credited to whoever
 * gave it. Saves only when a tick was due.
 * @returns {{siege, dealt: number} | {error}}
 */
export function siegeTick(guildId, siegeId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.status !== 'live') return { error: 'not-live' };
    let dealt = 0;
    let changed = false;
    let shown = false;
    for (const [userId, p] of Object.entries(isObject(s.participants) ? s.participants : {})) {
      // R6: a fighter's own poisoning that has run its course
      if (isObject(p?.poisoned) && !poisonedNow(p, now)) {
        p.poisoned = null;
        log(s, `🌿 ${cardName(p.name)} shook off the poison`, now);
        changed = shown = true;
      }
      if (!isObject(p?.poison)) continue;
      const before = JSON.stringify(p.poison);
      dealt += settlePoison(s, userId, p, now);
      if (JSON.stringify(p.poison) !== before) changed = true;
    }
    if (!changed) return { error: 'nothing-due' };
    if (dealt > 0 || shown) touch(s);
    return { siege: s, dealt };
  });
}

/**
 * End siege `siegeId` as 'won', 'escaped' or 'ended' — exactly once: a
 * second call (a second pass, an admin's end racing the clock) finds it no
 * longer live and returns `not-live`, changing nothing.
 *
 * In one save of the happenings file: the rewards are planned
 * (planSiegeRewards, with luck), applied in ONE save of the scores file
 * (applySiegeResult: idempotent by siege id), the result stored for the
 * scheduler to post, every poison stopped, and then the dial moves.
 * @returns {{siege, dial: number} | {error: 'not-live'|'not-current'|'bad-status'}}
 */
export function finishSiege(guildId, siegeId, status, now = Date.now(), luck = gameLuck, { note = null } = {}) {
  if (!['won', 'escaped', 'ended'].includes(status)) return { error: 'bad-status' };
  return withSiege(guildId, siegeId, (s, data) => {
    if (s.status !== 'live') return { error: 'not-live', siege: s };
    const plan = planSiegeRewards(s, status, luck);
    // Won and escaped go to the scores file even with nobody to pay: the
    // leaderboard counts them (an admin's end counts for nothing)
    const paid = plan.grants.length || status !== 'ended'
      ? applySiegeResult(guildId, { siegeId: s.id, grants: plan.grants, status, now })
      : { grants: [] };
    const fought = fightersOf(s).length;
    const dealt = Object.values(isObject(s.participants) ? s.participants : {}).reduce((n, p) => n + (Number(p?.damage) || 0), 0);
    s.status = status;
    s.finishedAt = now;
    // Every poison stops; a grabbed fighter is let go (the fight's over: no
    // digest), and an action decided but not announced is void
    for (const p of Object.values(isObject(s.participants) ? s.participants : {})) {
      if (!isObject(p)) continue;
      p.poison = null;
      p.caught = null;
      p.poisoned = null;
    }
    s.pending = null;
    s.result = {
      status,
      grants: paid.grants,
      mvp: plan.mvp,
      // An admin's end announces nothing (the card says so); the others are posted
      announcedAt: status === 'ended' ? now : null,
      messageId: null,
      claimedAt: null,
      tries: 0,
      unannounced: note,
    };
    touch(s);
    data.siegeDial = nextDial(dialOf(data), status, fought, s.maxHp > 0 ? dealt / s.maxHp : 0);
    return { siege: s, dial: data.siegeDial };
  });
}

/** Give up on posting the results after SIEGE.resultTries */
function countTry(s, reason, now) {
  s.result.tries = (s.result.tries || 0) + 1;
  if (s.result.tries >= SIEGE.resultTries) {
    s.result.announcedAt = now;
    s.result.unannounced = reason;
    return true;
  }
  return false;
}

/**
 * Claim the right to post siege `siegeId`'s results, saved BEFORE the
 * send: once claimed they're never sent again, even if the bot dies before
 * the message id is saved. A send Discord refuses releases the claim
 * (releaseResults) for the next pass to try.
 */
export function claimResults(guildId, siegeId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.result) return { error: 'not-finished' };
    if (s.result.announcedAt || s.result.claimedAt) return { error: 'already-claimed' };
    s.result.claimedAt = now;
    return { siege: s };
  });
}

/**
 * Stop trying to post siege `siegeId`'s results: `reason` is kept as
 * `unannounced` ('restart' — a claim a restart cut short; 'send-unknown' —
 * a send that may have reached Discord; 'refused' — one Discord won't
 * take). Never sent again; the next siege can start.
 */
export function giveUpResults(guildId, siegeId, reason, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.result || s.result.announcedAt) return { error: 'settled' };
    giveUp(s, reason, now);
    return { siege: s };
  });
}

/** Is siege `s`'s results claim one a restart cut short? (the scheduler gives it up) */
export const resultsClaimStale = (s, now = Date.now()) => staleClaim(s?.result, now);

/** The results were posted */
export function recordResults(guildId, siegeId, messageId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.result) return { error: 'not-finished' };
    s.result.announcedAt = now;
    s.result.messageId = messageId;
    return { siege: s };
  });
}

/**
 * A try at posting the results failed before anything was sent (no
 * channel, no permission, Discord refused): release the claim for the next
 * pass. After SIEGE.resultTries they're given up on.
 * @returns {{siege, gaveUp: boolean} | {error}}
 */
export function releaseResults(guildId, siegeId, reason, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.result || s.result.announcedAt) return { error: 'settled' };
    s.result.claimedAt = null;
    return { siege: s, gaveUp: countTry(s, reason, now) };
  });
}

// ── R6: the monster fights back ─────────────────────────────────────────

/**
 * Poison fighter `p` (in place, inside the caller's mutate): their own
 * Antidote fires first if it can — used up, a defence for the day — and
 * then they aren't poisoned at all, a poisoning they already had included
 * (it cures). Otherwise a poisoning already on is refreshed (one that
 * never wears off stays so).
 * @returns {{antidote: boolean, until: ?number}}
 */
function poisonFighter(guildId, s, userId, p, { by, actionId, monster }, now) {
  if (fireAntidote(guildId, userId, now).fired) {
    p.poisoned = null;
    log(s, `💊 ${cardName(p.name)}'s Antidote cured the poison`, now);
    return { antidote: true, until: null };
  }
  const forever = by === 'monster' && !!monster?.traits?.poisonForever;
  const until = forever || p.poisoned?.until === null ? null : now + SIEGE.poisoned.minutes * MINUTE;
  p.poisoned = { at: now, until, actionId, by };
  return { antidote: false, until };
}

/** The free fighters, best first (fightersOf), for an action to pick from */
export const freeFighters = (siege) => fightersOf(siege).filter(f => isFree(siege.participants[f.userId]));

/** One luck draw over a { kind: weight } table */
function weighted(weights, r) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((n, [, w]) => n + w, 0);
  if (!total) return 'roar';
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** `n` distinct picks from `list`, one luck draw each */
function pickSome(list, n, luck) {
  const left = [...list];
  const out = [];
  while (out.length < n && left.length) out.push(left.splice(Math.min(left.length - 1, Math.floor(luck() * left.length)), 1)[0]);
  return out;
}

/**
 * Is the monster due to act on siege `s` at `now`? Live, HP left, time
 * left, nothing decided and still unannounced, and its time come.
 */
export const actionDue = (s, now = Date.now()) => isLive(s, now) && s.hp > 0 && !s.pending && now >= (s.nextActionAt || Infinity);

/**
 * The monster decides what it does — and the decision is saved, as a claim,
 * BEFORE anyone is pinged: `pending`. Nothing happens to anyone until the
 * ping is sent (markAnnounced); one that isn't sent within
 * SIEGE.actions.voidSeconds is void.
 *
 * Luck, in order: the kind (by SIEGE.actions.weights or the monster's
 * traits.actWeights; never a grab for Pod People), then each victim
 * (except The Thing's grab, which takes the top contributor), then the line.
 *   - a grab needs /rescue on (`rescueOn`), else it roars; it never takes
 *     the last free fighter (Killer Klowns take up to two): with only one
 *     free, it poisons instead (or roars)
 *   - a poison needs /potion on (`potionOn`) and a free fighter who isn't
 *     poisoned already (Pod People poison two), else it roars
 *   - nobody fighting yet: no action at all (a roar at an empty channel
 *     every five minutes is noise), only the clock moves on
 * @returns {{siege, action} | {error}}
 */
export function decideAction(guildId, siegeId, { rescueOn = true, potionOn = true } = {}, now = Date.now(), luck = gameLuck) {
  return withSiege(guildId, siegeId, (s) => {
    if (!actionDue(s, now)) return { error: 'not-due' };
    const monster = monsterOf(s.monster);
    if (!monster) return { error: 'not-current' };
    s.nextActionAt = now + SIEGE.actions.everyMinutes * MINUTE;
    const free = freeFighters(s);
    if (!fightersOf(s).some(f => (f.attacks || 0) > 0)) return { siege: s, action: null };
    const traits = monster.traits || {};
    const weights = { ...(isObject(traits.actWeights) ? traits.actWeights : SIEGE.actions.weights) };
    if (traits.poisonOnly) weights.grab = 0;
    let kind = weighted(weights, luck());
    let victims = [];
    if (kind === 'grab') {
      const n = Math.min(Math.max(1, Number(traits.grabCount) || 1), free.length - 1);
      if (!rescueOn) kind = 'roar';
      else if (n < 1) kind = 'poison';
      else victims = traits.grabTop ? free.slice(0, 1) : pickSome(free, n, luck);
    }
    if (kind === 'poison') {
      const poisonable = free.filter(f => !poisonedNow(s.participants[f.userId], now));
      const n = Math.max(1, Number(traits.poisonCount) || 1);
      if (!potionOn || !poisonable.length) kind = 'roar';
      else victims = pickSome(poisonable, n, luck);
    }
    if (kind === 'roar') victims = [];
    const lines = monster.lines?.[kind] || [];
    const line = lines.length ? Math.min(lines.length - 1, Math.floor(luck() * lines.length)) : 0;
    s.pending = { id: newId(), kind, victims: victims.map(v => v.userId), line, decidedAt: now, claimedAt: now };
    return { siege: s, action: s.pending };
  });
}

/** An action claimed this long ago and never announced is void */
export const actionStale = (s, now = Date.now()) => !!s?.pending && now - s.pending.claimedAt >= SIEGE.actions.voidSeconds * 1000;

/**
 * Drop siege `siegeId`'s pending action `actionId` (its ping didn't go out,
 * or Discord refused it): nobody is grabbed or poisoned by it.
 */
export function voidAction(guildId, siegeId, actionId, reason = 'void', now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.pending || s.pending.id !== actionId) return { error: 'not-pending' };
    s.pending = null;
    s.lastAction = { id: actionId, kind: 'void', victims: [], messageId: null, at: now, reason };
    return { siege: s };
  });
}

/**
 * The action's ping went out (message `messageId`): now it happens, and its
 * clocks start — the rescue window, the poison's 15 minutes. A victim who
 * is no longer free (a sacrifice swap a moment ago, say) is passed over.
 *   grab:   caught for SIEGE.grab.freeMinutes; Monster Chow counts it
 *   poison: half damage until cured (their Antidote fires at once if it can)
 *   any:    The Wolfman heals traits.actHeal of his max HP
 * @returns {{siege, applied: {grabbed: string[], poisoned: string[], antidote: string[], healed: number, titles: object}} | {error}}
 */
export function markAnnounced(guildId, siegeId, actionId, messageId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    const a = s.pending;
    if (!a || a.id !== actionId) return { error: 'not-pending' };
    s.pending = null;
    const monster = monsterOf(s.monster);
    const applied = { grabbed: [], poisoned: [], antidote: [], healed: 0, titles: {} };
    if (s.status === 'live' && monster) {
      for (const userId of a.victims) {
        const p = s.participants?.[userId];
        if (!isFree(p)) continue;
        if (a.kind === 'grab') {
          p.caught = { at: now, until: now + SIEGE.grab.freeMinutes * MINUTE, actionId, by: 'monster' };
          applied.grabbed.push(userId);
          const t = countSiegeEvent(guildId, { userId, name: p.name, counter: 'grabbed', now }).titles;
          if (t.length) applied.titles[userId] = t;
        } else if (a.kind === 'poison') {
          const r = poisonFighter(guildId, s, userId, p, { by: 'monster', actionId, monster }, now);
          (r.antidote ? applied.antidote : applied.poisoned).push(userId);
        }
      }
      const heal = factor(monster.traits?.actHeal, 0);
      if (heal > 0 && s.hp > 0) {
        applied.healed = Math.min(Math.round(heal * s.maxHp), s.maxHp - s.hp);
        s.hp += applied.healed;
        s.healed = (s.healed || 0) + applied.healed;
      }
      const names = (ids) => ids.map(id => cardName(s.participants[id].name)).join(' and ');
      if (applied.grabbed.length) log(s, `🪤 ${monster.name} grabbed ${names(applied.grabbed)}`, now);
      if (applied.poisoned.length) log(s, `🤢 ${monster.name} poisoned ${names(applied.poisoned)}`, now);
      if (a.kind === 'roar') log(s, `📣 ${monster.name} roared${applied.healed ? ` · healed ${applied.healed}` : ''}`, now);
      else if (applied.healed) log(s, `💚 ${monster.name} healed ${applied.healed}`, now);
      touch(s);
    }
    s.lastAction = { id: actionId, kind: a.kind, victims: a.victims, messageId, at: now };
    return { siege: s, applied };
  });
}

/**
 * Grabbed fighters nobody freed in time: digested — −SIEGE.grab.loss
 * (never below 0 for the month; applySiegePenalty, idempotent by the grab)
 * and out of this siege. One save of each file; the scheduler then posts
 * one NEW message pinging them.
 * @returns {{siege, digested: Array<{userId, name, points}>} | {error}}
 */
export function digestDue(guildId, siegeId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.status !== 'live') return { error: 'not-live' };
    const digested = [];
    for (const [userId, p] of Object.entries(isObject(s.participants) ? s.participants : {})) {
      if (!isCaught(p) || now < p.caught.until) continue;
      const paid = applySiegePenalty(guildId, { key: `${s.id}:${userId}:${p.caught.actionId || p.caught.at}`, userId, name: p.name, loss: SIEGE.grab.loss, now });
      p.caught = null;
      p.poisoned = null;
      p.out = true;
      digested.push({ userId, name: p.name, points: paid.points });
    }
    if (!digested.length) return { error: 'none' };
    const monster = monsterOf(s.monster);
    log(s, `😋 ${monster?.name || 'It'} digested ${digested.map(d => cardName(d.name)).join(' and ')}`, now);
    touch(s);
    return { siege: s, digested };
  });
}

/**
 * Members can no longer free or cure (/rescue or /potion switched off for
 * them): let go of the grabbed (nobody could free them) and cure the
 * poisoned (nobody could cure them — Pod People's never wears off).
 * @returns {{siege, released: string[], cured: string[]} | {error}}
 */
export function releaseWhenOff(guildId, siegeId, { rescueOn = true, potionOn = true } = {}, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.status !== 'live') return { error: 'not-live' };
    const released = [];
    const cured = [];
    for (const [userId, p] of Object.entries(isObject(s.participants) ? s.participants : {})) {
      if (!rescueOn && isCaught(p)) { p.caught = null; released.push(userId); }
      if (!potionOn && isObject(p.poisoned)) { p.poisoned = null; cured.push(userId); }
    }
    if (!released.length && !cured.length) return { error: 'none' };
    if (released.length) log(s, `🔓 ${released.length === 1 ? 'A grabbed fighter was' : 'Grabbed fighters were'} let go: /rescue is off`, now);
    if (cured.length) log(s, `🌿 The poison wore off: /potion is off`, now);
    touch(s);
    return { siege: s, released, cured };
  });
}

/**
 * A /rescue or /potion play that helps a fighter, applied to the live
 * siege in the play's own synchronous block, after recordPlay: ANOTHER
 * member (not caught, not out themselves) aimed it at them.
 *   /rescue at a grabbed fighter (once the grab is announced):
 *     rescued    → freed; the rescuer +1 `frees` (SIEGE.credit.free)
 *     sacrificed → freed too, and the rescuer is caught in their place
 *                  (a fresh window) — Holy Water never swaps
 *     caught     → still caught
 *   a helpful /potion that worked, at a poisoned fighter → cured; the
 *     giver +1 `cures` (SIEGE.credit.cure)
 * A member who only frees or cures is in the fight with no attacks.
 * @returns {{siege, assist: {kind: 'freed'|'swapped'|'still'|'cured', targetId, targetName, until?}} | {error}}
 */
export function siegeAssist(guildId, { game, actor, targetId, outcome, holyWater = false }, now = Date.now()) {
  const s0 = currentSiege(guildId);
  if (!s0 || !targetId || targetId === actor?.id) return { error: 'none' };
  return withSiege(guildId, s0.id, (s) => {
    if (!isLive(s, now)) return { error: 'not-live' };
    const all = isObject(s.participants) ? s.participants : (s.participants = {});
    const target = all[targetId];
    const me = all[actor.id];
    if (isCaught(me) || isOut(me)) return { error: 'held' };
    const helper = () => {
      if (!isObject(all[actor.id])) all[actor.id] = newFighter(actor.name, now);
      return all[actor.id];
    };
    if (game === 'rescue' && isCaught(target)) {
      if (outcome === 'caught') return { siege: s, assist: { kind: 'still', targetId, targetName: target.name } };
      if (outcome !== 'rescued' && outcome !== 'sacrificed') return { error: 'none' };
      target.caught = null;
      const h = helper();
      h.frees = (h.frees || 0) + 1;
      h.lastAt = now;
      if (outcome === 'sacrificed' && !holyWater) {
        h.caught = { at: now, until: now + SIEGE.grab.freeMinutes * MINUTE, actionId: null, by: 'sacrifice' };
        log(s, `🕯️ ${cardName(actor.name)} freed ${cardName(target.name)}, and was grabbed instead`, now);
        touch(s);
        return { siege: s, assist: { kind: 'swapped', targetId, targetName: target.name, until: h.caught.until } };
      }
      log(s, `🛟 ${cardName(actor.name)} freed ${cardName(target.name)}`, now);
      touch(s);
      return { siege: s, assist: { kind: 'freed', targetId, targetName: target.name } };
    }
    if (game === 'potion' && outcome === 'helped' && isObject(target?.poisoned)) {
      target.poisoned = null;
      const h = helper();
      h.cures = (h.cures || 0) + 1;
      h.lastAt = now;
      log(s, `🧪 ${cardName(actor.name)} cured ${cardName(target.name)}`, now);
      touch(s);
      return { siege: s, assist: { kind: 'cured', targetId, targetName: target.name } };
    }
    return { error: 'none' };
  });
}

// ── R6: random sieges ───────────────────────────────────────────────────

/** Random sieges a week at this frequency (SIEGE.random.perWeek) */
export const siegesPerWeek = (frequency) => SIEGE.random.perWeek[frequency] ?? SIEGE.random.perWeek.normal;

/**
 * The chance a random siege starts on one scheduler check (one a minute),
 * once every other rule allows it.
 *
 * A siege is at most one a day in practice: the 20-hour gap after one ends
 * covers the rest of that evening and most of the next day. So "R a week"
 * means a day sees one with probability R/7, and the checks of a day's
 * ACTIVE_MINUTES_PER_DAY active minutes (as happenings count them) must
 * together give that: 1 − (1 − p)^240 = R/7 → p = 1 − (1 − R/7)^(1/240).
 * Normal (3 a week) is about 0.23% a minute. tests/siege-sim.test.js
 * measures the rate this gives on a server that plays four hours a night.
 */
export function randomSiegeChance(frequency) {
  const perDay = Math.min(0.95, siegesPerWeek(frequency) / 7);
  if (!(perDay > 0)) return 0;
  return 1 - (1 - perDay) ** (1 / ACTIVE_MINUTES_PER_DAY);
}

/** A random siege's win pool × this: min(1, poolScaleAt / spawns a week) */
export const randomPoolScale = (frequency) => {
  const w = siegesPerWeek(frequency);
  return w > 0 ? Math.min(1, SIEGE.random.poolScaleAt / w) : 1;
};

/** Members with a play in the last `minutes` (happenings' activity.recent) */
function playedWithin(data, minutes, now) {
  const since = now - minutes * MINUTE;
  const recent = isObject(data?.activity?.recent) ? data.activity.recent : {};
  return Object.values(recent).filter(at => Number.isFinite(at) && at > since).length;
}

/**
 * May a random siege start now? Every rule but the dice: switched on, no
 * siege on (or results waiting), at least SIEGE.random.gapHours since the
 * last ended, no happening in progress, and enough members around — 2 in
 * the last 30 minutes and 3 in the last 24 hours.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function randomSiegeEligibility(data, settings, now = Date.now()) {
  if (siegesPerWeek(settings?.siegeFrequency) <= 0) return { ok: false, reason: 'off' };
  const s = isObject(data?.siege) ? data.siege : null;
  if (s?.status === 'live') return { ok: false, reason: 'siege' };
  if (s?.result && !s.result.announcedAt) return { ok: false, reason: 'results-pending' };
  const ended = s ? (s.finishedAt || s.startedAt || 0) : 0;
  if (now - ended < SIEGE.random.gapHours * 60 * MINUTE) return { ok: false, reason: 'gap' };
  const h = data?.happening;
  if (h && !h.endedAt && now < h.endsAt) return { ok: false, reason: 'happening' };
  if (playedWithin(data, SIEGE.random.recentMinutes, now) < SIEGE.random.minRecent) return { ok: false, reason: 'too-few-now' };
  if (playedWithin(data, 24 * 60, now) < SIEGE.random.minDay) return { ok: false, reason: 'too-few-today' };
  return { ok: true };
}

/** An arrival card claimed this long ago with no message recorded (SIEGE.cardClaimMinutes) */
export const cardClaimStale = (s, now = Date.now()) => !!s?.card && !s.card.messageId && !s.card.gone
  && now - (s.card.claimedAt || 0) >= SIEGE.cardClaimMinutes * MINUTE;
