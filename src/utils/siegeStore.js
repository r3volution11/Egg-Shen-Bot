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
 *     result: null | { status, grants, mvp, wangChi, jack, backing, announcedAt, messageId, claimedAt, tries, unannounced },
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
 * 2.74.0, pace: a siege runs to its preset's timings (SIEGE_PACES, picked
 * by its length: gamePace.siegeTimings), copied onto the record at the
 * start as `t` and read back with timingsOf — never from the settings, so
 * changing a server's pace never touches a siege in progress, and a siege
 * from before 2.74 (no `t`) runs to `quick`, today's rules, to the end.
 * From `evening` on:
 *   - the monster's clock is BUSY time (busyNow): it only runs while
 *     someone has attacked in the last PACE_RULES.busyMinutes, accrued
 *     inside each attack's own save (`busy` up to `lastAttackAt`), so it
 *     never grabs anyone at 3 a.m. — and it only takes fighters who are
 *     here (targetsOf: who attacked, freed or cured in that window)
 *   - each member has `allowance` attacks a night (12:00 to 12:00 UTC:
 *     `night`, `nightAttacks`; a 3-day or week campaign's first hours are
 *     its night 1: siegeNight); freeing and curing never count
 *   - HP grows on each member's first attack of each NIGHT (`nights`, `fn`)
 *   - an escape eases the dial if the fighters used most of their attacks
 *     (effortOf) or took half its HP (as at quick): nextDial
 * From `day` on, attacks pay into the pot (the win pool, per fighter-night);
 * the base HP counts the fighters the server is expected to bring
 * (`expected`, from the participation its campaigns have shown —
 * siegeParticipation), not all of A7, and the dial stays put on a
 * campaign whose turnout explains its end (turnoutExplains) — that one
 * teaches the estimate; a daily report posts each night
 * (`report`, claimed per night, from the `nightly` tallies; a boundary in a
 * campaign's first 6 hours isn't one of its nights, nor one in a day
 * siege's first hour), and a digest nobody's around for waits for it
 * (`unreported`) instead of pinging — while a report is still to come, and
 * one the siege ends before reporting is in the results; and an
 * escape's results wait for the next game played (`result.holdUntil`). At 3 days and a week the siege ends at a
 * night boundary, and a digested fighter is out for a day (`outUntil`),
 * not the whole campaign. The dial is per preset (`siegeDials[key]`; quick's
 * is the old `siegeDial`).
 *
 *   added by 2.74.0: siege.t, busy, lastAttackAt, nextActionBusy, fn,
 *     nightly: { [night]: { damage, users: { [userId]: { name, damage, frees, cures } } } },
 *     report: null | { night, last, number, claimedAt (null: released for a retry),
 *       messageId, unannounced, tries, told }, reportedThrough (the last night reported on),
 *     unreported: [{ userId, name, at, points }],
 *     result.holdUntil, result.told (the unreported ids its results named);
 *     participants[userId].nights: { [night]: first attack that night },
 *     night, nightAttacks, outUntil, own (a pot pace's attacks' own points:
 *     notePotPoints); siege.expected (E, from day on);
 *     data.siegeDials: { [pace]: dial }, data.siegeParticipation: { [pace]: share }
 *
 * 2.75.0, the real hero (design §4.3, §5): the MVP became the Wang Chi —
 * the fighter with the most HELP (helpOf: frees, cures, boosts), not the
 * most damage — and the killing blow is the Jack Burton (a laugh, and a
 * small bonus). Both × the siege's pace (`t.honour`). Members may back a
 * fighter in the first half of a siege (placeBacking), settled at the finish
 * by planSiegeRewards and paid by applySiegeResult with the rest. A free or
 * cure from a play past its game's daily scoring cap still happens, but only
 * SIEGE.credit.unscoredPerNight of them a night count (siegeAssist).
 *
 *   added by 2.75.0: siege.honours ('wang-chi': the rules it pays by; a siege
 *     live at the deploy has none — SIEGE_R2_DEPLOY says how it pays),
 *     backers: { [userId]: { name, fighterId, fighterName, stake, at } },
 *     backingClosed (the minute's pass saw backing close: the card was told),
 *     participants[userId].unscored: { night, n } (credited frees and cures
 *       from unscored plays tonight), participants[userId].boostHits (R4's:
 *       absent, read as 0, until then),
 *     result.wangChi: null | { userId, name, help, held },
 *     result.jack: null | { userId, name, by (a weapon, or 'poison') },
 *     result.backing: [{ backerId, backerName, fighterId, fighterName, stake,
 *       outcome: 'wangChi'|'push'|'lost'|'escaped'|'refunded', back, bonus, orphan? }]
 *     (result.mvp stays: the Wang Chi's { userId, name }, for older readers)
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
import { applySiegeResult, fireAntidote, applySiegePenalty, countSiegeEvent, stakeBacking, hasBackStakes } from './gameScores.js';
import { owns, nightKey, shiftNight, nightsBetween } from './gameRules.js';
import { cardName } from './gameBoards.js';
import { clipText } from './embedFit.js';
import { luck as gameLuck } from './gameLuck.js';
import { SIEGE, RANDOM_PRIZE_ITEMS, PACE_RULES, SIEGE_R2_DEPLOY } from '../data/gameRewards.js';
import { MONSTERS, MONSTER_KEYS } from '../data/siegeMonsters.js';
import {
  timingsOf, siegeTimings, siegeEndsAt, randomGapHours, paceOf, pacePreset, nightBoundaryBefore,
  firstNightBoundary, campaignNight, campaignNightKey, nextNightAt, reportBoundaryLeft,
} from './gamePace.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const BUSY_MS = PACE_RULES.busyMinutes * MINUTE;
/** Busy minutes are kept to the millisecond's thousandth: the file needn't grow 0.30000000000000004s */
const round3 = (x) => Math.round(x * 1000) / 1000;
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

/**
 * The server's difficulty dial for a preset, stored next to the siege, 1
 * until a siege at that preset moves it. Each preset has its own (2.74.0):
 * a week campaign is no guide to a 45-minute siege. Quick's is the old
 * `siegeDial`, so a server's dial carries on through the upgrade.
 */
export function dialOf(data, key = 'quick') {
  const d = Number(key === 'quick' ? data?.siegeDial : data?.siegeDials?.[key]);
  return Number.isFinite(d) && d > 0 ? clamp(d, SIEGE.dial.min, SIEGE.dial.max) : SIEGE.dial.start;
}

/** Store the dial for a preset (in place, inside the caller's mutate) */
function setDial(data, key, dial) {
  if (key === 'quick') data.siegeDial = dial;
  else data.siegeDials = { ...(isObject(data.siegeDials) ? data.siegeDials : {}), [key]: dial };
}

/**
 * The dial after a finish: moved only by a win or an escape that enough
 * fought — and an escape only when the fighters tried. Without that, two
 * members letting sieges walk away untouched drove the dial to its floor,
 * and every monster after was trivial for everyone. The step is the
 * siege's preset's (`t.dial`): bigger where sieges are rarer.
 *
 * Tried: they dealt at least SIEGE.dialEscapeMinDamage of its max HP
 * (`damageShare`) — at quick the only test, as always — or, with an
 * allowance (evening on), they used at least PACE_RULES.escapeEffort of
 * the attacks their fighter-nights allowed (`effort`). A campaign built
 * bigger than its fighters could possibly deal (2.74's first week HP)
 * escaped with less than half its HP gone, so damage alone froze the dial
 * and it escaped for ever (review, 2026-11-04); effort is what the
 * fighters control. But effort alone froze evening's the other way: a
 * 4-hour siege's fighters use about half of a night's 20 attacks, so its
 * escapes never eased the dial and its wins kept raising it (1.0 to 1.3 in
 * a month, re-tune 2026-11-05). Either shows they tried; members who join
 * and barely attack show neither.
 */
export function nextDial(dial, status, fighters, damageShare = 1, t = pacePreset('quick'), effort = null) {
  if (fighters < SIEGE.dial.minFighters) return dial;
  const tried = damageShare >= SIEGE.dialEscapeMinDamage
    || (!!t.allowance && effort !== null && effort >= PACE_RULES.escapeEffort);
  if (status === 'escaped' && !tried) return dial;
  const factor = status === 'won' ? t.dial.win : status === 'escaped' ? t.dial.escape : 1;
  // Rounded so the file doesn't grow 0.30000000000000004s
  return Math.round(clamp(dial * factor, SIEGE.dial.min, SIEGE.dial.max) * 1e6) / 1e6;
}

/**
 * HP = round(clamp((b·B·N + g·F)·D, 40, 2000·N) · monster.hp), with F the
 * fighters so far — or, from `evening` on, the fighter-nights — what a
 * siege starts with (F = 0) and what its max HP is as fighters join. b, g
 * and N are the siege's timings' (`t`: base, growth, N); B is A7 (`a7`) or,
 * from `day` on (`t.hpBase: 'fighters'`), the fighters it expects
 * (`expected`: expectedFighters). At quick b, g and N are 2, 45 and 1, the
 * formula as it always was. The floor and the ceiling apply to the whole
 * sum, so a small server's first fighter lifts a 40-HP monster to 45, not 85.
 */
export function siegeHp({ a7 = 0, expected = 0, fighters = 0, dial = SIEGE.dial.start, monsterHp = 1, t = null } = {}) {
  const { min, max } = SIEGE.hp;
  const { base, hpBase, growth, N } = t || { ...pacePreset('quick'), N: 1 };
  const B = hpBase === 'fighters' ? expected : a7;
  return Math.round(clamp((base * B * N + growth * fighters) * dial, min, max * N) * monsterHp);
}

/**
 * The share of A7 that fights a campaign at this preset, as this server has
 * shown it (siegeParticipation, an EWMA kept beside the dials), or
 * PACE_RULES.participation.start before its first
 */
export function participationOf(data, key) {
  const { start, min } = PACE_RULES.participation;
  return learnedParticipation(data, key) ? clamp(Number(data.siegeParticipation[key]), min, 1) : start;
}

/** Has this server finished a campaign at this preset that taught it its participation? */
const learnedParticipation = (data, key) => {
  const p = Number(data?.siegeParticipation?.[key]);
  return Number.isFinite(p) && p > 0;
};

/** E: the fighters a campaign expects — A7 × participation, at least 2 (or A7, if fewer), at most A7 */
export function expectedFighters(a7, participation) {
  if (!(a7 > 0)) return 0;
  return clamp(Math.round(a7 * participation), Math.min(2, a7), a7);
}

/**
 * What a new fighter's first attack (or, from `evening` on, a member's
 * first attack of a night) adds to max and current HP: the formula's max HP
 * with `fighters` (this one included) less what it is now, never negative —
 * so never past the ceiling, and a server whose activity already set the
 * HP above what its fighters would grows nothing at first.
 */
export function joinGrowth(maxHp, { a7 = 0, expected = 0, fighters = 1, dial = SIEGE.dial.start, monsterHp = 1, t = null } = {}) {
  return Math.max(0, siegeHp({ a7, expected, fighters, dial, monsterHp, t }) - maxHp);
}

/** Does a fighter joining at `now` still grow the monster? Not in its last `t.noGrowth` minutes */
export const growsAt = (siege, now) => now < siege.endsAt - timingsOf(siege).noGrowth * MINUTE;

// ── pace: busy time, the allowance, the pot ─────────────────────────────

/**
 * The monster's clock at `now`, in busy minutes: what the attacks have
 * accrued (`busy`, up to the last attack), plus the time since the last
 * attack up to PACE_RULES.busyMinutes. No write needed between attacks.
 */
export function busyNow(siege, now = Date.now()) {
  const last = Number(siege?.lastAttackAt);
  const tail = Number.isFinite(last) && last > 0 ? clamp(now - last, 0, BUSY_MS) / MINUTE : 0;
  return round3((Number(siege?.busy) || 0) + tail);
}

/**
 * Is the drive-in busy: someone attacked in the last
 * PACE_RULES.busyMinutes? A quick siege always is (it runs on the wall
 * clock, as it always did).
 */
export function isBusy(siege, now = Date.now()) {
  if (!timingsOf(siege).busy) return true;
  const last = Number(siege?.lastAttackAt);
  return Number.isFinite(last) && last > 0 && now - last < BUSY_MS;
}

/**
 * The night siege `s` counts `at` toward (gamePace.campaignNightKey): its
 * allowance, its fighter-nights and its tallies all use this one key, so
 * they can never disagree about which night it is. 12:00 to 12:00 UTC
 * (nightKey), except a 3-day or week campaign's first few hours, which are
 * its night 1.
 */
export const siegeNight = (s, at = Date.now()) => campaignNightKey(s?.startedAt, at, timingsOf(s));

/**
 * A member's attacks tonight, toward their allowance. Per NIGHT (12:00 to
 * 12:00 UTC, siegeNight), as fighter-nights and the report count them: a US
 * evening is one night, where a UTC day split it at 00:00 and gave 16
 * attacks in a quarter of an hour (review, 2026-11-04). Without the siege,
 * plain nightKey (a campaign's folded first night needs its start).
 */
export const attacksTonight = (p, now = Date.now(), s = null) => (p?.night === (s ? siegeNight(s, now) : nightKey(now)) ? Number(p.nightAttacks) || 0 : 0);

/**
 * When tonight's allowance resets: the next night boundary (12:00 UTC) —
 * or, in a 3-day or week campaign's folded first hours, its first counted
 * one (gamePace.nextNightAt). May be at or after the siege's end: the
 * caller says so (siege.js: "that's all your attacks for this siege").
 */
export const allowanceResetsAt = (now = Date.now(), s = null) => nextNightAt(s?.startedAt, now, s ? timingsOf(s) : null);

/** Fighter-nights: each fighter's nights fought (at least one each); at quick, simply the fighters */
function fighterNights(siege, fighters) {
  if (timingsOf(siege).growthPer !== 'night') return fighters.length;
  return fighters.reduce((n, f) => n + Math.max(1, Object.keys(isObject(f.nights) ? f.nights : {}).length), 0);
}

/**
 * The win pool as it stands: `t.pool.perFighter` a fighter (quick) or a
 * fighter-night, between poolMin and poolMax, × a random siege's poolScale.
 * At a `pot` pace this is the pot the attacks pay into.
 */
export function potOf(siege, fighters = fightersOf(siege)) {
  const { pool } = timingsOf(siege);
  const scale = Number.isFinite(siege?.poolScale) && siege.poolScale > 0 ? Math.min(1, siege.poolScale) : 1;
  return Math.round(clamp(pool.perFighter * fighterNights(siege, fighters), pool.poolMin, pool.poolMax) * scale);
}

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
/**
 * Digested: out of this siege — or, at 3 days and a week (`t.outMinutes`),
 * out until `outUntil`, then back in (the minute's pass clears it; this
 * reads the clock too, so nobody waits on a pass to be let back)
 */
export const isOut = (p, now = Date.now()) => !!p?.out && !(Number.isFinite(p.outUntil) && now >= p.outUntil);
/** Poisoned by the monster (or their own fizzle) now: until cured, or its time */
export const poisonedNow = (p, now = Date.now()) => !!(p && isObject(p.poisoned) && (p.poisoned.until === null || now < p.poisoned.until));
/** Free to fight and to be acted on: has attacked, isn't caught, isn't out */
export const isFree = (p, now = Date.now()) => !!p && (p.attacks || 0) > 0 && !isCaught(p) && !isOut(p, now);

/**
 * 2.76.0: is this member fighting siege `s` now — the siege live, and they
 * in it (they attacked, or helped: fightersOf's rule) and not out (a held
 * fighter is still fighting)? Nobody hexes a fighter: the siege is co-op
 * (design §3.3), and Ching Dai's Curse passes them by. Pure: the caller
 * reads the siege (currentSiege) first, outside any scores save.
 */
export function fightingNow(s, userId, now = Date.now()) {
  if (!s || !isLive(s, now) || !userId) return false;
  const p = isObject(s.participants) ? s.participants[userId] : null;
  if (!isObject(p) || isOut(p, now)) return false;
  return (p.attacks || 0) > 0 || contributionOf(p) > 0;
}

/** The poison's damage a minute on this monster (its traits.poisonMult) */
export function poisonPerMinute(monster) {
  return Math.max(0, Math.round(SIEGE.poison.perMinute * factor(monster?.traits?.poisonMult)));
}

/** The Silver Bullet's multiplier against this monster */
export function silverMultOf(monster) {
  return factor(monster?.traits?.silverMult, SIEGE.silverMult);
}

/**
 * What a fighter did for the OTHER fighters, in points: SIEGE.credit's free
 * × fighters freed + cure × poisons cured + boost × boosted attacks that
 * landed (`boostHits`: R4's blessings — absent, and read as 0, until then).
 * Only credited assists count (siegeAssist: past a game's scoring cap, the
 * first SIEGE.credit.unscoredPerNight a night).
 */
const assistsOf = (p) => SIEGE.credit.free * (Number(p?.frees) || 0)
  + SIEGE.credit.cure * (Number(p?.cures) || 0)
  + SIEGE.credit.boost * (Number(p?.boostHits) || 0);

/**
 * Help (2.75.0): the Wang Chi's measure. Today it's a fighter's assists
 * (assistsOf). R5's pact rule — freeing or curing your pact's hero counts
 * double toward the Wang Chi — adds HERE, to help only: never to
 * contribution, so a pact can't buy a bigger share of the pool.
 */
export const helpOf = (p) => assistsOf(p);

/** What a fighter did for the fight, their share of the pool: damage, and (R6) their assists */
export const contributionOf = (p) => (Number(p?.damage) || 0) + assistsOf(p);

/**
 * The fighters, best first: by contribution, then who joined first, then
 * by id — so the top 3, the held Wang Chi and the order luck is drawn in
 * are the same every time the same siege is read.
 * @returns {Array<{userId, name, damage, attacks, contribution, firstAt, ...}>}
 */
export function fightersOf(siege) {
  const all = isObject(siege?.participants) ? siege.participants : {};
  return Object.entries(all)
    .map(([userId, p]) => ({ ...p, userId, contribution: contributionOf(p) }))
    .filter(f => (f.attacks || 0) > 0 || f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution || (a.firstAt || 0) - (b.firstAt || 0) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/**
 * The Wang Chi (design §5): the fighter with the most help (helpOf), if it's
 * at least SIEGE.rewards.wangChiMinHelp (one cure) — a helper who never
 * attacked included, which is the point. Ties go to more contribution, then
 * whoever joined first, then the smaller id: the first of the most helpful
 * in fightersOf's order, which sorts exactly that way. Nobody helped that
 * much: the top contributor, `held` ("held the line"). Pure; null with no
 * fighters. Whether there are honours at all (a win, with company) is
 * planSiegeRewards' call.
 * @returns {?{userId, name, help: number, held: boolean}}
 */
export function wangChiOf(siege) {
  const fighters = fightersOf(siege);
  if (!fighters.length) return null;
  // Strictly more help to replace: on a tie the earlier in fightersOf's order stays
  const best = fighters.reduce((a, f) => (helpOf(f) > helpOf(a) ? f : a));
  if (helpOf(best) >= SIEGE.rewards.wangChiMinHelp) return { userId: best.userId, name: best.name, help: helpOf(best), held: false };
  const top = fighters[0];
  return { userId: top.userId, name: top.name, help: helpOf(top), held: true };
}

/**
 * When backing a fighter closes (2.75.0): SIEGE.backing.window of the way
 * through the siege's OWN time, start to end. Not the design's "3½ days": a
 * week campaign ends at its night boundary (150–174 hours), so its halfway
 * mark is too — about 75–87 hours in. Rounded to the millisecond.
 */
export const backingClosesAt = (s) => Math.round((Number(s?.startedAt) || 0) + ((Number(s?.endsAt) || 0) - (Number(s?.startedAt) || 0)) * SIEGE.backing.window);

/** Can a fighter still be backed in siege `s`? Live, not beaten, and before backingClosesAt */
export const backingOpen = (s, now = Date.now()) => isLive(s, now) && s.hp > 0 && now < backingClosesAt(s);

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
 * (fightersOf): for each fighter in turn, the Wang Chi's sure loot (silver
 * or not, then which item) at the Wang Chi's own place in that order, or,
 * for anyone else with at least SIEGE.rewards.lootShare of the
 * contribution, whether they get loot and, if so, which. When the Wang Chi
 * is the top contributor (nobody helped enough: `held`) that's exactly the
 * draws the old MVP's loot made, so a seeded siege nobody freed or cured in
 * draws what it always did.
 *
 *   won:     the pool (potOf: at quick 8 a fighter, 24–200; from evening
 *            on, per fighter-night, the siege's `t.pool`) split by
 *            contribution share, each 2–`t.pool.eachMax`. Then the
 *            honours, × H (`t.honour`): the Wang Chi (wangChiOf: the most
 *            help, or the top contributor holding the line) +wangChiBonus·H
 *            and loot for sure; the Jack Burton (the killing blow, an attack
 *            or a poison tick) +jackBonus·H — one fighter may be both. The
 *            others' loot is 25% × traits.loot. Every fighter's win counts;
 *            the Wang Chi's `mvp` (lifetime.siege.mvps); the Jack Burton's
 *            `jack`; a beaten SIEGE.kaiju counts for everyone. ONE fighter
 *            alone gets the pool share only (`solo`): no honours, no loot,
 *            no win.
 *   escaped: −3 for everyone who attacked, when 2 or more fought. No honours.
 *   ended:   nothing (an admin called it off).
 * And every status settles the backing (settleBacking): the Wang Chi's
 * share of their backers' faith is folded into their grant as `backBonus`.
 *
 * A siege live when 2.75.0 deployed (no `honours` stamp) pays by
 * SIEGE_R2_DEPLOY.liveAtDeploy: the Wang Chi rules by default, or the old
 * MVP's (`liveAtDeploy: 'mvp'`; a test passes the option).
 *
 * @returns {{grants: object[], mvp: ?{userId, name}, wangChi: ?{userId, name, help, held}, jack: ?{userId, name, by}, backing: object[]}}
 */
export function planSiegeRewards(siege, status, luck = gameLuck, { liveAtDeploy = SIEGE_R2_DEPLOY.liveAtDeploy } = {}) {
  const monster = monsterOf(siege?.monster);
  const fighters = fightersOf(siege);
  const base = (f) => ({ userId: f.userId, name: f.name, damage: f.damage || 0, contribution: f.contribution, attacks: f.attacks || 0 });
  // No honours on any grant but a won one's (the counters read these)
  const none = { win: false, mvp: false, wangChi: false, jack: false, honour: 0, backBonus: 0, kaiju: false };

  if (status === 'won' && fighters.length) {
    const r = SIEGE.rewards;
    const t = timingsOf(siege);
    // One fighter alone: the pool share and nothing more (siege titles need company)
    const solo = fighters.length === 1;
    // A random siege's pool is scaled (SIEGE.random.poolScaleAt): a server
    // set to `often` gets more sieges, not more points. From evening on
    // it's per fighter-night: a member who fought five nights of a week
    // gets a bigger slice than one who fought once.
    const pool = potOf(siege, fighters);
    const total = fighters.reduce((n, f) => n + f.contribution, 0);
    const lootChance = Math.min(1, r.lootChance * factor(monster?.traits?.loot));
    const anyOf = (list) => list[Math.min(list.length - 1, Math.floor(luck() * list.length))];
    const lootItem = () => (luck() < r.silverChance ? 'silver' : anyOf(RANDOM_PRIZE_ITEMS));
    // A siege from before 2.75.0, paid the old way if Doug says so: the top contributor is the MVP, no Jack Burton
    const legacy = !siege.honours && liveAtDeploy === 'mvp';
    const top = solo ? null : legacy ? { userId: fighters[0].userId, name: fighters[0].name } : wangChiOf(siege);
    const wangChi = solo || legacy ? null : top;
    // The killing blow is always a fighter's; a win without one (it shouldn't happen) has no Jack Burton
    const blow = solo || legacy ? null : siege.killingBlow;
    const jackF = blow ? fighters.find(f => f.userId === blow.userId) : null;
    const jack = jackF ? { userId: jackF.userId, name: jackF.name, by: blow.by || null } : null;
    const H = t.honour;
    const grants = fighters.map((f) => {
      // A win needs damage, so total is above 0; split evenly if it somehow isn't
      const share = total > 0 ? f.contribution / total : 1 / fighters.length;
      let points = clamp(Math.round(pool * share), r.eachMin, t.pool.eachMax);
      // At a pot pace, what their attacks would have scored on their own
      // (notePotPoints): paid instead of the share if today's reward limit
      // holds this win back (gameScores.applySiegeResult)
      const own = t.pot ? { own: Math.round(Number(f.own) || 0) } : {};
      if (solo) return { ...base(f), ...own, share, points, loss: 0, loot: null, ...none, solo: true };
      const isTop = f.userId === top.userId;
      const isJack = f.userId === jack?.userId;
      // Honours scale with the pace (H: a week campaign is one of ~3 a month)
      const honour = (isTop ? (legacy ? SIEGE_R2_DEPLOY.mvpBonus : r.wangChiBonus) * H : 0) + (isJack ? r.jackBonus * H : 0);
      points += honour;
      let loot = null;
      if (isTop) loot = lootItem();
      else if (share >= r.lootShare && luck() < lootChance) loot = lootItem();
      // `mvp` (the counter Siege MVP and Legend read) is the Wang Chi: the MVP became the Wang Chi
      return {
        ...base(f), ...own, share, points, loss: 0, loot, win: true, mvp: isTop, wangChi: isTop && !legacy, jack: isJack, honour, backBonus: 0,
        kaiju: siege.monster === SIEGE.kaiju,
      };
    });
    const backing = settleBacking(siege, status, fighters, top, jack);
    // The fighter their backers called right: their share of it, once a siege
    for (const b of backing) {
      const g = b.bonus > 0 ? grants.find(x => x.userId === b.fighterId) : null;
      if (g) g.backBonus += b.bonus;
    }
    return { grants, mvp: top ? { userId: top.userId, name: top.name } : null, wangChi, jack, backing };
  }

  const backing = settleBacking(siege, status, fighters, null, null);
  if (status === 'escaped') {
    const penalised = fighters.length >= SIEGE.escape.minFighters;
    const grants = fighters.map(f => ({
      ...base(f), share: 0, points: 0, loss: penalised && (f.attacks || 0) > 0 ? SIEGE.escape.loss : 0, loot: null, ...none,
    }));
    return { grants, mvp: null, wangChi: null, jack: null, backing };
  }

  return { grants: [], mvp: null, wangChi: null, jack: null, backing };
}

/**
 * The backers, settled (design §4.3), oldest backing first — but the one
 * carrying the Wang Chi's `bonus` first of all. Pure.
 *   won, ≥ SIEGE.backing.minFighters fought:
 *     their fighter is the Wang Chi (`top`)  → `wangChi`: payout × stake back
 *       (net +stake); and the fighter +⌈stake × fighterShare⌉ of the LARGEST
 *       stake on them (ties: the earliest), on that one backer's entry as
 *       `bonus` — once a siege, however many backed them
 *     top 3 by contribution, or the Jack Burton → `push`: the stake back
 *     anyone else                            → `lost`
 *   escaped, ≥ minFighters                   → `escaped`: lost
 *   called off, or fewer than minFighters    → `refunded`: the stake back
 * @returns {Array<{backerId, backerName, fighterId, fighterName, stake, at, outcome, back, bonus}>}
 */
export function settleBacking(siege, status, fighters, top, jack) {
  const B = SIEGE.backing;
  const list = Object.entries(isObject(siege?.backers) ? siege.backers : {})
    .filter(([, b]) => isObject(b) && Number.isFinite(b.stake) && b.stake > 0)
    .map(([backerId, b]) => ({ backerId, backerName: b.name || backerId, fighterId: b.fighterId, fighterName: b.fighterName || b.fighterId, stake: b.stake, at: Number(b.at) || 0 }))
    .sort((a, b) => a.at - b.at || (a.backerId < b.backerId ? -1 : a.backerId > b.backerId ? 1 : 0));
  const enough = fighters.length >= B.minFighters;
  const top3 = new Set(fighters.slice(0, 3).map(f => f.userId));
  // `at` stays: the stake goes back to the month it was taken in (gameScores.payBacking)
  const out = list.map((b) => {
    let outcome = 'refunded';
    if (status === 'won' && enough && top) {
      outcome = b.fighterId === top.userId ? 'wangChi' : (top3.has(b.fighterId) || b.fighterId === jack?.userId) ? 'push' : 'lost';
    } else if (status === 'escaped' && enough) {
      outcome = 'escaped';
    }
    const back = outcome === 'wangChi' ? B.payout * b.stake : outcome === 'push' || outcome === 'refunded' ? b.stake : 0;
    return { ...b, outcome, back, bonus: 0 };
  });
  // The fighter's share: the largest stake on them, the earliest of equals (the list is oldest first)
  const theirs = out.filter(b => b.outcome === 'wangChi');
  if (!theirs.length) return out;
  const largest = theirs.reduce((a, b) => (b.stake > a.stake ? b : a));
  largest.bonus = Math.ceil(largest.stake * B.fighterShare);
  // ...and that backing first: the others on the same Wang Chi read "backed
  // them too" (HONOURS.backing.wangChiToo), which must come after the line
  // it follows — oldest first put a small early stake's "too" above the
  // big one's (review R2, 2026-11-06)
  return [largest, ...out.filter(b => b !== largest)];
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
 * Null when no siege is on. With an attack allowance (2.74.0, from
 * `evening` on), `attacks` is the member's own tonight: "attacks tonight 2/8".
 * @returns {?{monster: string, emoji: string, hp, maxHp, endsAt, you: ?{damage, rank}, attacks: ?{used, of}}}
 */
export function siegeCardData(guildId, userId = null, now = Date.now()) {
  const s = currentSiege(guildId);
  if (!isLive(s, now)) return null;
  const m = monsterOf(s.monster);
  const me = userId ? standingOf(s, userId) : null;
  const { allowance } = timingsOf(s);
  return {
    monster: m.name, emoji: m.emoji, hp: Math.max(0, s.hp), maxHp: s.maxHp, endsAt: s.endsAt,
    you: me ? { damage: me.damage, rank: me.rank } : null,
    attacks: userId && allowance ? { used: attacksTonight(s.participants?.[userId], now, s), of: allowance } : null,
  };
}

/**
 * What the cards draw from a siege: the monster's words, HP, time, the
 * fighters and the top 3, the log, how it ended.
 */
export function siegeView(siege, now = Date.now()) {
  const monster = monsterOf(siege.monster);
  const fighters = fightersOf(siege);
  const t = timingsOf(siege);
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
    // 2.74.0: digested for a day (3 days, a week), and back when
    out: all.filter(p => isOut(p, now) && Number.isFinite(p.outUntil)).map(p => ({ name: p.name, until: p.outUntil })).sort((a, b) => a.until - b.until),
    killingBlow: siege.killingBlow || null,
    // The result as stored: 2.75.0's adds wangChi, jack and backing (a pre-2.75 one has only mvp)
    result: siege.result || null,
    // 2.74.0: the pace it runs at, its allowance and (at a `pot` pace) the pot so far
    pace: { key: t.key, name: t.name, allowance: t.allowance, pot: t.pot, report: t.report, nightEnd: t.nightEnd, honour: t.honour },
    pot: potOf(siege, fighters),
    // 2.75.0: who'd be the Wang Chi if it ended now — only once someone has
    // really helped (a held Wang Chi is just the top fighter, shown already)
    wangChiSoFar: wangChiSoFar(siege),
    backing: { open: backingOpen(siege, now), closesAt: backingClosesAt(siege), count: Object.keys(isObject(siege.backers) ? siege.backers : {}).length },
  };
}

/** The Wang Chi so far, with what they did, or null while nobody has helped SIEGE.rewards.wangChiMinHelp */
function wangChiSoFar(siege) {
  const w = wangChiOf(siege);
  if (!w || w.held) return null;
  const p = siege.participants[w.userId] || {};
  return { ...w, frees: Number(p.frees) || 0, cures: Number(p.cures) || 0, boostHits: Number(p.boostHits) || 0 };
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
 * paid, nothing to post — but (2.75.0) its backers' stakes come back, as
 * any called-off siege's do. (In place, inside the caller's mutate.)
 */
function closeOrphan(guildId, s, now) {
  if (s.status !== 'live') return false;
  const backing = settleBacking(s, 'ended', [], null, null);
  const refunded = backing.length || hasBackStakes(guildId, s.id)
    ? applySiegeResult(guildId, { siegeId: s.id, grants: [], status: 'ended', backing, now }).backing
    : [];
  s.status = 'ended';
  s.finishedAt = now;
  for (const p of Object.values(isObject(s.participants) ? s.participants : {})) if (isObject(p)) p.poison = null;
  s.result = {
    status: 'ended', grants: [], mvp: null, wangChi: null, jack: null, backing: refunded,
    announcedAt: now, messageId: null, claimedAt: null, tries: 0, unannounced: 'unknown-monster',
  };
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
    closeOrphan(guildId, s, now);
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
 * Count something toward tonight's tally, for the daily report (in place,
 * inside the caller's mutate): the night's damage, and each member's
 * damage, frees and cures. Only a siege with a report keeps one, and only
 * the last PACE_RULES.nightsKept nights.
 */
function tally(s, userId, name, field, n, now) {
  if (!n || !timingsOf(s).report) return;
  const night = siegeNight(s, now);
  const nightly = isObject(s.nightly) ? s.nightly : (s.nightly = {});
  const tonight = (nightly[night] ||= { damage: 0, users: {} });
  const u = (tonight.users[userId] ||= { name, damage: 0, frees: 0, cures: 0 });
  u.name = name;
  u[field] = (u[field] || 0) + n;
  if (field === 'damage') tonight.damage += n;
  const keep = Object.keys(nightly).sort().slice(-PACE_RULES.nightsKept);
  for (const k of Object.keys(nightly)) if (!keep.includes(k)) delete nightly[k];
}

/**
 * Start a siege now. One at a time, and not while the last one's results
 * are still waiting to be posted (they'd be lost with it).
 * @param {object} p
 * @param {string} p.monster - a MONSTERS key
 * @param {number} p.minutes - how long it lasts (the caller resolves the option, the monster and the
 *   setting: gamePace.defaultSiegeMinutes). Its timings are the nearest preset's (siegeTimings),
 *   copied onto the siege; a 3-day or week campaign ends at the night boundary after.
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
    if (old && !monsterOf(old.monster)) closeOrphan(guildId, old, now);
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
    const t = siegeTimings(minutes);
    const dial = dialOf(data, t.key);
    // From `day` on the base counts the fighters this server can expect, not all of A7
    const expected = t.hpBase === 'fighters' ? expectedFighters(a7, participationOf(data, t.key)) : null;
    const hp = siegeHp({ a7, expected: expected ?? 0, fighters: 0, dial, monsterHp: Number(m.hp) || 1, t });
    const siege = {
      id: newId(),
      monster,
      status: 'live',
      source,
      startedBy,
      channelId,
      startedAt: now,
      endsAt: siegeEndsAt(now, minutes, t),
      finishedAt: null,
      hp,
      maxHp: hp,
      a7,
      ...(expected !== null ? { expected } : {}), // E, from `day` on: what its base counted
      dial, // what its HP was worked out with, and new fighters' growth is
      healed: 0, // HP the monster got back (Gremlins' misses, the Wolfman's actions)
      poolScale: Number.isFinite(poolScale) && poolScale > 0 ? Math.min(1, poolScale) : 1,
      // 2.74.0: its timings, for its whole life (gamePace.timingsOf reads them)
      t,
      participants: {},
      // The monster's clock: wall-clock minutes at quick, busy minutes after
      nextActionAt: now + t.actEvery * MINUTE,
      nextActionBusy: t.actEvery,
      busy: 0,
      lastAttackAt: null,
      fn: 0, // fighter-nights that grew it (from evening on)
      nightly: {},
      report: null,
      unreported: [],
      pending: null,
      lastAction: null,
      killingBlow: null,
      // 2.75.0: the rules it pays by (a siege live at the deploy has no stamp:
      // SIEGE_R2_DEPLOY), and who has backed whom
      honours: 'wang-chi',
      backers: {},
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
      tally(s, userId, p.name, 'damage', dealt, at);
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
 * In order: the allowance (from `evening` on: refused, saving nothing,
 * once today's attacks are used); the busy clock; a new fighter joins — or
 * a member's first attack tonight, from `evening` on — and HP grows; their
 * poison's due minutes are settled; the damage (attackDamage) comes off
 * the HP, never below 0, and is credited; Gremlins heal on a food miss;
 * Spooked is spent or set; a poison starts (or restarts); the killing
 * blow; the log.
 *
 * @param {object} a
 * @param {string} a.userId
 * @param {string} a.name - display name
 * @param {'food'|'doom'|'potion'} a.weapon
 * @param {string} a.outcome - a siege outcome (POINTS.siege)
 * @param {boolean} [a.silver] - a Silver Bullet is being used
 * @returns {{siege, hit: {damage, raw, joined, healed, wasSpooked, spooked, poison: ?{perMin, minutes, restarted}, killingBlow: boolean, silverMult: ?number, hp, maxHp, attacks: ?{used, of}, pot: ?number}}
 *   | {error: 'not-current'|'not-live'|'time-up'|'beaten'|'unknown-weapon'|'caught'|'out'|'spent', siege?}}
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
    if (isOut(s.participants[userId], now)) return { error: 'out', siege: s };
    const t = timingsOf(s);
    // 2.74.0: today's attacks used up (the caller refused it first, for nothing)
    if (t.allowance && attacksTonight(s.participants[userId], now, s) >= t.allowance) return { error: 'spent', siege: s };

    // The monster's busy clock runs up to this attack (busyNow: the gap
    // since the last one counts, up to PACE_RULES.busyMinutes) — accrued
    // here, in the attack's own save, so nothing writes between attacks
    if (t.busy) {
      s.busy = busyNow(s, now);
      s.lastAttackAt = now;
    }

    // A new fighter (their first attack — a member who only freed or cured
    // someone is in the fight with none yet): max HP becomes the formula's
    // with one more fighter, and current HP rises by the same (each fighter
    // once) — except in the last few minutes, when a newcomer mustn't hand
    // it the HP to escape. From `evening` on it's each member's first
    // attack of each NIGHT (a fighter-night) that grows it.
    let joined = 0;
    let p = s.participants[userId];
    if (!isObject(p)) p = s.participants[userId] = newFighter(name, now);
    const first = !((p.attacks || 0) > 0);
    // From `evening` on, the nights each member fought (their first attack
    // of each): what grows the HP, and what the pool is paid per. A quick
    // siege's fighters keep exactly the fields they always had.
    let firstTonight = false;
    if (t.growthPer === 'night') {
      const night = siegeNight(s, now);
      const nights = isObject(p.nights) ? p.nights : (p.nights = {});
      firstTonight = !Object.hasOwn(nights, night);
      if (firstTonight) nights[night] = now;
    }
    if (first) p.firstAttackAt = now;
    const grows = t.growthPer === 'night' ? firstTonight : first;
    if (grows && growsAt(s, now)) {
      // The dial this siege started with: it only moves when a siege ends
      const dial = Number.isFinite(s.dial) && s.dial > 0 ? s.dial : dialOf(data, t.key);
      const fighters = t.growthPer === 'night'
        ? (Number(s.fn) || 0) + 1
        : Object.values(s.participants).filter(x => (x.attacks || 0) > 0).length + 1;
      joined = joinGrowth(s.maxHp, { a7: Number(s.a7) || 0, expected: Number(s.expected) || 0, fighters, dial, monsterHp: Number(monster.hp) || 1, t });
      if (t.growthPer === 'night') s.fn = fighters;
      s.maxHp += joined;
      s.hp += joined;
    }
    if (joined) log(s, first ? `📈 ${cardName(name)} joined the fight · +${joined} HP` : `📈 ${cardName(name)} is back for another night · +${joined} HP`, now);
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
      // Per miss, scaled by the pace (t.heal: a week has ~10× a quick siege's attacks)
      healed = Math.min(Math.round(missHeal * t.heal.miss * s.maxHp), s.maxHp - s.hp);
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
    // 2.74.0: toward today's allowance, and tonight's tally for the report
    const used = attacksTonight(p, now, s) + 1;
    if (t.allowance) {
      p.night = siegeNight(s, now);
      p.nightAttacks = used;
    }
    tally(s, userId, name, 'damage', damage, now);

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
        again: joined > 0 && !first, // a fighter-night after their first: "back for another night"
        attacks: t.allowance ? { used, of: t.allowance } : null,
        pot: t.pot ? potOf(s) : null,
      },
    };
  });
}

/**
 * An attack at a `pot` pace paid its points into the pot: keep what it
 * would have scored on its own (recordPlay's `potPoints`, a backfire's −1
 * included) on the fighter, as `own`. Called right after recordPlay, in the
 * attack's own synchronous block. It's only ever paid when today's reward
 * limit holds a win back (gameScores.applySiegeResult), so a member past
 * the limit gets what the limit leaves them at quick. Nothing for 0.
 * @returns {{siege} | {error}}
 */
export function notePotPoints(guildId, siegeId, userId, points) {
  if (!Number.isFinite(points) || points === 0) return { error: 'none' };
  return withSiege(guildId, siegeId, (s) => {
    const p = isObject(s.participants) ? s.participants[userId] : null;
    if (s.status !== 'live' || !isObject(p) || !timingsOf(s).pot) return { error: 'none' };
    p.own = (Number(p.own) || 0) + points;
    return { siege: s };
  });
}

/**
 * The scheduler's minute: every poison's due ticks, credited to whoever
 * gave it; a fighter's poisoning that has worn off; (2.74.0) a digested
 * fighter whose day out is over, back in the fight; and (2.75.0) backing
 * closing, once (`backingClosed`), for the card. Saves only when something
 * was due.
 * @returns {{siege, dealt: number, back: string[]} | {error}}
 */
export function siegeTick(guildId, siegeId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.status !== 'live') return { error: 'not-live' };
    let dealt = 0;
    let changed = false;
    let shown = false;
    const back = [];
    // 2.75.0: backing has just closed — the card stops offering it at its
    // next edit, rather than saying "until 3 hours ago" until someone attacks
    if (!s.backingClosed && now >= backingClosesAt(s)) {
      s.backingClosed = true;
      changed = shown = true;
    }
    for (const [userId, p] of Object.entries(isObject(s.participants) ? s.participants : {})) {
      // R6: a fighter's own poisoning that has run its course
      if (isObject(p?.poisoned) && !poisonedNow(p, now)) {
        p.poisoned = null;
        log(s, `🌿 ${cardName(p.name)} shook off the poison`, now);
        changed = shown = true;
      }
      if (p?.out && Number.isFinite(p.outUntil) && now >= p.outUntil) {
        p.out = false;
        p.outUntil = null;
        back.push(userId);
        log(s, `🔙 ${cardName(p.name)} is back in the fight`, now);
        changed = shown = true;
      }
      if (!isObject(p?.poison)) continue;
      const before = JSON.stringify(p.poison);
      dealt += settlePoison(s, userId, p, now);
      if (JSON.stringify(p.poison) !== before) changed = true;
    }
    if (!changed) return { error: 'nothing-due' };
    if (dealt > 0 || shown) touch(s);
    return { siege: s, dealt, back };
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
 * scheduler to post, every poison stopped, and then the dial moves — the
 * siege's preset's dial, by its preset's step (2.74.0).
 *
 * 2.75.0: the backing is settled in the same plan and paid in the same
 * save — an admin's end too, which otherwise touches no score: its backers
 * get their stakes back. So is a stake debited by a backing whose
 * happenings save a kill cut short (hasBackStakes: the scores file has it,
 * the siege's `backers` doesn't): applySiegeResult refunds it.
 *
 * `hold` (the scheduler's escape at its end): from `day` on an escape's
 * results wait for the next game anyone plays on the server, or
 * PACE_RULES.holdResultsHours at the latest (`result.holdUntil`), so a
 * campaign that ends at the night boundary doesn't ping 20 people at
 * 4 a.m. A win is posted at once: people are around by definition.
 * @returns {{siege, dial: number} | {error: 'not-live'|'not-current'|'bad-status'}}
 */
export function finishSiege(guildId, siegeId, status, now = Date.now(), luck = gameLuck, { note = null, hold = false } = {}) {
  if (!['won', 'escaped', 'ended'].includes(status)) return { error: 'bad-status' };
  return withSiege(guildId, siegeId, (s, data) => {
    if (s.status !== 'live') return { error: 'not-live', siege: s };
    const t = timingsOf(s);
    let plan = planSiegeRewards(s, status, luck);
    // Won and escaped go to the scores file even with nobody to pay: the
    // leaderboard counts them (an admin's end counts for nothing — but its
    // backers' stakes come back, a stake the siege lost track of included)
    const owed = plan.backing.length > 0 || hasBackStakes(guildId, s.id);
    const paid = plan.grants.length || status !== 'ended' || owed
      ? applySiegeResult(guildId, { siegeId: s.id, grants: plan.grants, status, backing: plan.backing, now })
      : { grants: [], backing: [] };
    // Paid already, as something else: an admin's end (its backers'
    // refunds) whose happenings save a kill cut short, the siege fought on
    // and won. The scores file is what happened — it paid the end, so the
    // siege ends: a win here would post results nobody was paid for
    // (review R2, 2026-11-06). Its honours are the status's own: none for
    // an end or an escape, and a won one's are the siege's (no luck is
    // drawn for an end or an escape).
    if (paid.repeat && paid.status && paid.status !== status) {
      status = paid.status;
      plan = planSiegeRewards(s, status, luck);
    }
    const fighters = fightersOf(s);
    const fought = fighters.length;
    const dealt = Object.values(isObject(s.participants) ? s.participants : {}).reduce((n, p) => n + (Number(p?.damage) || 0), 0);
    const effort = effortOf(s, t);
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
      // The Wang Chi as `mvp` too: the shape every reader before 2.75.0 knows
      mvp: plan.mvp,
      wangChi: plan.wangChi,
      jack: plan.jack,
      // As paid (a repeat hands back the first payout's), orphaned stakes' refunds included
      backing: asBackers(s, paid.backing),
      // An admin's end announces nothing (the card says so); the others are posted
      announcedAt: status === 'ended' ? now : null,
      messageId: null,
      claimedAt: null,
      tries: 0,
      unannounced: note,
      ...(hold && status === 'escaped' && t.holdResults ? { holdUntil: now + PACE_RULES.holdResultsHours * 60 * MINUTE } : {}),
    };
    touch(s);
    // From `day` on the dial stays put when the turnout alone explains the
    // end (turnoutExplains: fewer came than expected and it escaped, or more
    // came and they won): that's the estimate's error, which the
    // participation below corrects. Moving the dial on it too overshot: a
    // fresh server's easy first campaign raised the dial while the estimate
    // rose, and the next two lost 9 in 10 (the review's participation sweep,
    // 2026-11-04).
    const attackers = fighters.filter(f => (f.attacks || 0) > 0).length;
    const before = dialOf(data, t.key);
    const learning = t.hpBase === 'fighters' && turnoutExplains(s, status, attackers);
    const dial = learning
      ? before
      : nextDial(before, status, fought, s.maxHp > 0 ? dealt / s.maxHp : 0, t, effort);
    setDial(data, t.key, dial);
    // From `day` on, learn how many come: the next campaign's base expects
    // that. Attackers, not helpers (a member who only freed a friend deals
    // no damage), of the members active as it ends (a new server's A7 grows
    // through its first week). An admin's end tells nothing.
    if (t.hpBase === 'fighters' && status !== 'ended') {
      const a7 = Math.max(activeMembers(data, now), Number(s.a7) || 0);
      if (a7 > 0) {
        const p = participationOf(data, t.key);
        const seen = Math.min(1, attackers / a7);
        const { first, weight } = PACE_RULES.participation;
        const w = learnedParticipation(data, t.key) ? weight : first;
        const learned = Math.round((p + w * (seen - p)) * 1e4) / 1e4;
        data.siegeParticipation = { ...(isObject(data.siegeParticipation) ? data.siegeParticipation : {}), [t.key]: clamp(learned, PACE_RULES.participation.min, 1) };
      }
    }
    return { siege: s, dial, effort };
  });
}

/**
 * The backing as paid, for `result.backing`: a stake a repeat refunded as an
 * orphan (applySiegeResult) whose backing IS on the siege — placed after the
 * payout it repeats, the siege still live — is that backer's refund, named
 * like the rest, not a stake the siege lost track of
 */
function asBackers(s, backing) {
  const backers = isObject(s.backers) ? s.backers : {};
  return (Array.isArray(backing) ? backing : []).map((b) => {
    const mine = b?.orphan && isObject(backers[b.backerId]) ? backers[b.backerId] : null;
    if (!mine) return b;
    const { orphan, ...rest } = b;
    return { ...rest, backerName: mine.name || rest.backerName, fighterId: mine.fighterId, fighterName: mine.fighterName || mine.fighterId };
  });
}

/**
 * Does the turnout alone explain how campaign `s` ended — so the dial
 * stays, and only the participation learns? When the miss points the same
 * way as the end and is big enough to: it escaped with fewer than it
 * expected, or was won with more — by over PACE_RULES.participation.sized
 * of the attackers and over `slack[status]` fighters (a small turnout
 * swings by one or two). The other way round it's the monster, not the
 * count: more came and it still got away, or fewer came and they still
 * beat it — then the dial moves too. Leaving it alone there set the two
 * against each other (review, 2026-11-05): after an escape the learning
 * raised the next campaign's HP for the bigger turnout, at the same dial,
 * so the next one got away too.
 *
 * The slack leans the players' way. An escape is the turnout's only past 2
 * short — on a server where 2 or 3 fight, one fewer must still ease the
 * dial, or it lags and every escape costs everyone 3 again. A win is the
 * turnout's past 1 over: with 2 of slack a 5-member server's first
 * campaign expected 2 (the floor), 4 came, its easy win raised the dial on
 * top of the bigger estimate, and the second was lost 1 time in 2 (re-tune,
 * 2026-11-05). A siege with no `expected` (quick, evening, a pre-2.74 one):
 * never.
 */
export function turnoutExplains(s, status, attackers) {
  if (!Number.isFinite(s?.expected)) return false;
  const { sized, slack } = PACE_RULES.participation;
  const off = status === 'escaped' ? s.expected - attackers : status === 'won' ? attackers - s.expected : 0;
  return off > 0 && off > Math.max(slack[status], sized * attackers);
}

/**
 * How hard the fighters tried, with an allowance: the attacks they made ÷
 * the attacks their fighter-nights allowed (each attacker's nights fought ×
 * the allowance). Null without an allowance (quick): there, damage decides.
 */
export function effortOf(s, t = timingsOf(s)) {
  if (!t.allowance) return null;
  let made = 0;
  let allowed = 0;
  for (const p of Object.values(isObject(s?.participants) ? s.participants : {})) {
    if (!((p?.attacks || 0) > 0)) continue;
    made += p.attacks;
    allowed += Math.max(1, Object.keys(isObject(p.nights) ? p.nights : {}).length) * t.allowance;
  }
  return allowed > 0 ? Math.round((made / allowed) * 1e4) / 1e4 : 0;
}

/**
 * Are siege `s`'s results being held (an escape at a day+ pace)? Until
 * someone plays a game on the server after it got away (`activity.at`,
 * noted on every play), or its holdUntil.
 */
export function resultsHeld(s, data, now = Date.now()) {
  const until = Number(s?.result?.holdUntil);
  if (!Number.isFinite(until) || s.result.announcedAt) return false;
  if (now >= until) return false;
  const played = Number(data?.activity?.at) || 0;
  return !(played > (s.finishedAt || 0));
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
    // The digests no report reached, which these results tell (siegeCard.resultsPayload)
    s.result.told = (Array.isArray(s.unreported) ? s.unreported : []).map(d => d.userId);
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

/**
 * The results were posted, in `channelId` (the siege's, or where a
 * happening would be announced: /siege end names it). They named the
 * digests no report reached (`unreported`: siegeCard.resultsPayload), so
 * those are told now. Results given up on leave them: nobody told them.
 */
export function recordResults(guildId, siegeId, messageId, now = Date.now(), channelId = null) {
  return withSiege(guildId, siegeId, (s) => {
    if (!s.result) return { error: 'not-finished' };
    s.result.announcedAt = now;
    s.result.messageId = messageId;
    if (channelId) s.result.channelId = channelId;
    s.unreported = [];
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
  const until = forever || p.poisoned?.until === null ? null : now + timingsOf(s).poisonMinutes * MINUTE;
  p.poisoned = { at: now, until, actionId, by };
  return { antidote: false, until };
}

/** The free fighters, best first (fightersOf), for an action to pick from */
export const freeFighters = (siege, now = Date.now()) => fightersOf(siege).filter(f => isFree(siege.participants[f.userId], now));

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
 * left, nothing decided and still unannounced, and its time come: at
 * quick, `nextActionAt` on the wall clock; from `evening` on, while the
 * drive-in is busy and its busy clock has reached `nextActionBusy` — so
 * nobody is grabbed or poisoned while nobody's playing.
 */
export function actionDue(s, now = Date.now()) {
  if (!(isLive(s, now) && s.hp > 0 && !s.pending)) return false;
  if (!timingsOf(s).busy) return now >= (s.nextActionAt || Infinity);
  return isBusy(s, now) && busyNow(s, now) >= (Number(s.nextActionBusy) || 0);
}

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
 *   - from `evening` on it only picks among fighters who are here
 *     (targetsOf): who attacked, freed or cured in the busy window. A week
 *     campaign's fighter from three nights ago mustn't be grabbed and pinged
 *     with 22 hours to be freed while they're asleep (review, 2026-11-04).
 *     Nobody here to pick: it roars.
 * @returns {{siege, action} | {error}}
 */
export function decideAction(guildId, siegeId, { rescueOn = true, potionOn = true } = {}, now = Date.now(), luck = gameLuck) {
  return withSiege(guildId, siegeId, (s) => {
    if (!actionDue(s, now)) return { error: 'not-due' };
    const monster = monsterOf(s.monster);
    if (!monster) return { error: 'not-current' };
    const t = timingsOf(s);
    s.nextActionAt = now + t.actEvery * MINUTE;
    if (t.busy) s.nextActionBusy = round3(busyNow(s, now) + t.actEvery);
    const free = targetsOf(s, now);
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

/**
 * Who the monster may pick, best first: the free fighters (freeFighters) —
 * from `evening` on, only those who attacked, freed or cured in the last
 * PACE_RULES.busyMinutes (`lastAt`). At quick, every free fighter, as before.
 */
export function targetsOf(s, now = Date.now()) {
  const free = freeFighters(s, now);
  if (!timingsOf(s).busy) return free;
  return free.filter(f => now - (Number(s.participants[f.userId]?.lastAt) || 0) < BUSY_MS);
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
 * clocks start — the rescue window, the poison's (the siege's timings:
 * 10 and 15 minutes at quick, 22 hours each at week). A victim who is no
 * longer free (a sacrifice swap a moment ago, say) is passed over.
 *   grab:   caught for `t.freeMinutes`; Monster Chow counts it
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
        if (!isFree(p, now)) continue;
        if (a.kind === 'grab') {
          p.caught = { at: now, until: now + timingsOf(s).freeMinutes * MINUTE, actionId, by: 'monster' };
          applied.grabbed.push(userId);
          const t = countSiegeEvent(guildId, { userId, name: p.name, counter: 'grabbed', now }).titles;
          if (t.length) applied.titles[userId] = t;
        } else if (a.kind === 'poison') {
          const r = poisonFighter(guildId, s, userId, p, { by: 'monster', actionId, monster }, now);
          (r.antidote ? applied.antidote : applied.poisoned).push(userId);
        }
      }
      // Per action, scaled by the pace (t.heal: a week has ~5× a quick siege's actions)
      const heal = factor(monster.traits?.actHeal, 0) * timingsOf(s).heal.act;
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
 * and out of this siege, or (2.74.0, `t.outMinutes`: 3 days, a week) out
 * for a day and then back. One save of each file; the scheduler then posts
 * one NEW message pinging them (`tell`) — at a pace with a daily report,
 * only while the drive-in is busy: with nobody around nobody is pinged,
 * and they're kept in `unreported` for the next report. Without a report
 * (quick, evening) they're always told: there'd be nothing else to tell
 * them (review, 2026-11-04: an evening digest with nobody attacking was
 * never told at all).
 *
 * Kept only while a report is still to come (reportToCome): tonight's, not
 * posted yet, or a counted boundary before the end. On a campaign's last
 * night, or a day siege past its one report, a kept digest waited for a
 * report that never came: −5, and never a word (review, 2026-11-06). Then
 * they're told at once, whatever the hour. A kept one the report never
 * reaches (it's won first) is in the results (siegeCard.resultsPayload).
 * @returns {{siege, digested: Array<{userId, name, points, outUntil}>, tell: boolean} | {error}}
 */
export function digestDue(guildId, siegeId, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.status !== 'live') return { error: 'not-live' };
    const t = timingsOf(s);
    const digested = [];
    for (const [userId, p] of Object.entries(isObject(s.participants) ? s.participants : {})) {
      if (!isCaught(p) || now < p.caught.until) continue;
      const paid = applySiegePenalty(guildId, { key: `${s.id}:${userId}:${p.caught.actionId || p.caught.at}`, userId, name: p.name, loss: SIEGE.grab.loss, now });
      p.caught = null;
      p.poisoned = null;
      p.out = true;
      p.outUntil = t.outMinutes ? now + t.outMinutes * MINUTE : null;
      digested.push({ userId, name: p.name, points: paid.points, ...(p.outUntil ? { outUntil: p.outUntil } : {}) });
    }
    if (!digested.length) return { error: 'none' };
    const monster = monsterOf(s.monster);
    log(s, `😋 ${monster?.name || 'It'} digested ${digested.map(d => cardName(d.name)).join(' and ')}`, now);
    const tell = !t.report || isBusy(s, now) || !reportToCome(s, now);
    if (!tell) keepForReport(s, digested, now);
    touch(s);
    return { siege: s, digested, tell };
  });
}

/** Digests nobody was told of, kept for the next daily report (in place); the newest SIEGE.pingMax */
function keepForReport(s, digested, now) {
  const kept = Array.isArray(s.unreported) ? s.unreported : [];
  const fresh = digested.filter(d => !kept.some(k => k.userId === d.userId && k.at === (d.at ?? now)));
  s.unreported = [...kept, ...fresh.map(d => ({ ...d, at: d.at ?? now }))].slice(-SIEGE.pingMax);
}

/**
 * A digest notice that didn't go out (no channel, Discord refused it): at a
 * pace with a daily report, the digested go into the next one instead
 * (review, 2026-11-04). Without a report there's nowhere else to say it.
 */
export function digestUntold(guildId, siegeId, digested, now = Date.now()) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.status !== 'live' || !timingsOf(s).report || !digested?.length) return { error: 'none' };
    keepForReport(s, digested, now);
    return { siege: s };
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
 *
 * 2.75.0, `scored`: was the play itself scored, or past its game's daily
 * scoring cap? The free or cure ALWAYS happens — the target is freed or
 * cured, and a sacrifice still swaps: saving a friend is never blocked.
 * But from an unscored play only the first SIEGE.credit.unscoredPerNight a
 * member a night (12:00 UTC, `unscored: {night, n}`) are CREDITED: `frees`
 * or `cures`, tonight's tally, and so their share and their help. Help was
 * the one thing in a siege no cap reached, and the Wang Chi pays +8×H and
 * sure loot: two friends taking turns at being grabbed and freed past the
 * cap could farm it (the R1 review). A scored play is always credited.
 * @returns {{siege, assist: {kind: 'freed'|'swapped'|'still'|'cured', targetId, targetName, credited: boolean, until?}} | {error}}
 */
export function siegeAssist(guildId, { game, actor, targetId, outcome, holyWater = false, scored = true }, now = Date.now()) {
  const s0 = currentSiege(guildId);
  if (!s0 || !targetId || targetId === actor?.id) return { error: 'none' };
  return withSiege(guildId, s0.id, (s) => {
    if (!isLive(s, now)) return { error: 'not-live' };
    const all = isObject(s.participants) ? s.participants : (s.participants = {});
    const target = all[targetId];
    const me = all[actor.id];
    if (isCaught(me) || isOut(me, now)) return { error: 'held' };
    const helper = () => {
      if (!isObject(all[actor.id])) all[actor.id] = newFighter(actor.name, now);
      return all[actor.id];
    };
    // Credited: their frees or cures, and tonight's tally. One that isn't
    // credited doesn't make the helper a participant (they'd be one with
    // nothing to their name) — unless the monster takes them for it
    const credit = (field) => {
      const credited = scored || creditUnscored(s, all, actor, now);
      if (credited) {
        const h = helper();
        h[field] = (h[field] || 0) + 1;
        tally(s, actor.id, actor.name, field, 1, now);
      }
      if (isObject(all[actor.id])) all[actor.id].lastAt = now;
      return credited;
    };
    if (game === 'rescue' && isCaught(target)) {
      if (outcome === 'caught') return { siege: s, assist: { kind: 'still', targetId, targetName: target.name, credited: false } };
      if (outcome !== 'rescued' && outcome !== 'sacrificed') return { error: 'none' };
      target.caught = null;
      const credited = credit('frees');
      if (outcome === 'sacrificed' && !holyWater) {
        const h = helper();
        h.lastAt = now;
        h.caught = { at: now, until: now + timingsOf(s).freeMinutes * MINUTE, actionId: null, by: 'sacrifice' };
        log(s, `🕯️ ${cardName(actor.name)} freed ${cardName(target.name)}, and was grabbed instead`, now);
        touch(s);
        return { siege: s, assist: { kind: 'swapped', targetId, targetName: target.name, credited, until: h.caught.until } };
      }
      log(s, `🛟 ${cardName(actor.name)} freed ${cardName(target.name)}`, now);
      touch(s);
      return { siege: s, assist: { kind: 'freed', targetId, targetName: target.name, credited } };
    }
    if (game === 'potion' && outcome === 'helped' && isObject(target?.poisoned)) {
      target.poisoned = null;
      const credited = credit('cures');
      log(s, `🧪 ${cardName(actor.name)} cured ${cardName(target.name)}`, now);
      touch(s);
      return { siege: s, assist: { kind: 'cured', targetId, targetName: target.name, credited } };
    }
    return { error: 'none' };
  });
}

/**
 * May this member's free or cure from an UNSCORED play count tonight? The
 * first SIEGE.credit.unscoredPerNight a night do; each one counted is
 * noted on them (`unscored`, in place, inside the caller's mutate — a
 * helper new to the fight joins it here). Only tonight is kept: the night
 * it was counted on, and how many.
 */
function creditUnscored(s, all, actor, now) {
  // The siege's night (siegeNight), as its tallies and allowance count it:
  // nightKey split a campaign's folded first night in two, 2 + 2 more
  const night = siegeNight(s, now);
  const p = all[actor.id];
  const n = isObject(p?.unscored) && p.unscored.night === night ? Number(p.unscored.n) || 0 : 0;
  if (n >= SIEGE.credit.unscoredPerNight) return false;
  if (!isObject(all[actor.id])) all[actor.id] = newFighter(actor.name, now);
  all[actor.id].unscored = { night, n: n + 1 };
  return true;
}

// ── 2.75.0: backing a fighter ───────────────────────────────────────────

/**
 * Back fighter `fighterId` in siege `siegeId` with `stake` of your points
 * (design §4.3) — in ONE synchronous block: the siege's rules are checked
 * on the file as loaded here (the command checked them too, for a refusal
 * that costs nothing; this is the race-proof re-check), the stake is taken
 * from the scores file (stakeBacking, which re-checks the member's side:
 * one a day, a regular, the points to stake), and the backing is stored on
 * the siege. A kill between those two saves leaves a stake with no backer:
 * finishSiege refunds it (applySiegeResult's orphans), and a retry before
 * then finds the stake already taken (stakeBacking is idempotent by
 * siege and member) and records the backing without taking it twice.
 *
 * The siege's own refusals, in the command's order: `noSiege` (not live, or
 * beaten), `self`, `late` (past backingClosesAt), `notFighter` (they
 * haven't attacked), `already` (one backing a siege); then stakeBacking's
 * `daily`, `inactive`, `poor`. A bot is the command's to refuse.
 * @returns {{siege, backing: {name, fighterId, fighterName, stake, at}, closesAt: number} | {error: string, count?: number, closesAt?: number}}
 */
export function placeBacking(guildId, siegeId, { userId, name, fighterId, fighterName, stake }, now = Date.now()) {
  const B = SIEGE.backing;
  if (!(Number.isInteger(stake) && stake >= B.min && stake <= B.max)) return { error: 'bad-stake' };
  return withSiege(guildId, siegeId, (s) => {
    if (!isLive(s, now) || !(s.hp > 0)) return { error: 'noSiege' };
    if (fighterId === userId) return { error: 'self' };
    const closesAt = backingClosesAt(s);
    if (now >= closesAt) return { error: 'late', closesAt };
    const p = isObject(s.participants) ? s.participants[fighterId] : null;
    if (!((p?.attacks || 0) > 0)) return { error: 'notFighter' };
    const backers = isObject(s.backers) ? s.backers : (s.backers = {});
    if (owns(backers, userId)) return { error: 'already' };
    const staked = stakeBacking(guildId, { key: `${s.id}:${userId}`, userId, name, stake }, now);
    if (staked.error) return staked;
    // The fighter as the siege knows them (their name on the card), the stake as the scores file took it
    const backing = { name, fighterId, fighterName: p.name || fighterName, stake: staked.stake, at: now };
    backers[userId] = backing;
    log(s, `🎲 ${cardName(name)} backed ${cardName(backing.fighterName)} (${backing.stake})`, now);
    touch(s);
    return { siege: s, backing, closesAt };
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
 *
 * 2.74.0: that's quick's and evening's. From `day` on the frequency sets
 * the gap instead (gamePace.randomGapHours: 48 h / 72 h, rare ×2, often
 * ×½), and once it's passed a campaign starts at the first busy moments:
 * PACE_RULES.randomChance a minute, about 70% within a 4-hour evening.
 */
export function randomSiegeChance(frequency, pace = 'quick') {
  if (siegesPerWeek(frequency) <= 0) return 0;
  if (pacePreset(pace).report) return PACE_RULES.randomChance;
  const perDay = Math.min(0.95, siegesPerWeek(frequency) / 7);
  if (!(perDay > 0)) return 0;
  return 1 - (1 - perDay) ** (1 / ACTIVE_MINUTES_PER_DAY);
}

/**
 * A random siege's win pool × this: min(1, poolScaleAt / spawns a week) —
 * where the frequency sets how many come (quick, evening). From `day` on
 * it only stretches the gap between campaigns, and the pool, per
 * fighter-night, already pays for what's fought: ×1.
 */
export const randomPoolScale = (frequency, pace = 'quick') => {
  if (pacePreset(pace).report) return 1;
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
 * siege on (or results waiting), the gap since the last ended (the
 * server's pace's: gamePace.randomGapHours), no happening in progress —
 * at quick and evening; from `day` on a happening runs about a day, and a
 * campaign most of the week, so neither waits for the other — and enough
 * members around: 2 in the last 30 minutes and 3 in the last 24 hours.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function randomSiegeEligibility(data, settings, now = Date.now()) {
  if (siegesPerWeek(settings?.siegeFrequency) <= 0) return { ok: false, reason: 'off' };
  const pace = paceOf(settings);
  const s = isObject(data?.siege) ? data.siege : null;
  if (s?.status === 'live') return { ok: false, reason: 'siege' };
  if (s?.result && !s.result.announcedAt) return { ok: false, reason: 'results-pending' };
  const ended = s ? (s.finishedAt || s.startedAt || 0) : 0;
  if (now - ended < randomGapHours(pace, settings?.siegeFrequency) * 60 * MINUTE) return { ok: false, reason: 'gap' };
  const h = data?.happening;
  if (!pacePreset(pace).report && h && !h.endedAt && now < h.endsAt) return { ok: false, reason: 'happening' };
  if (playedWithin(data, SIEGE.random.recentMinutes, now) < SIEGE.random.minRecent) return { ok: false, reason: 'too-few-now' };
  if (playedWithin(data, 24 * 60, now) < SIEGE.random.minDay) return { ok: false, reason: 'too-few-today' };
  return { ok: true };
}

/** An arrival card claimed this long ago with no message recorded (SIEGE.cardClaimMinutes) */
export const cardClaimStale = (s, now = Date.now()) => !!s?.card && !s.card.messageId && !s.card.gone
  && now - (s.card.claimedAt || 0) >= SIEGE.cardClaimMinutes * MINUTE;

// ── 2.74.0: the daily report ────────────────────────────────────────────

/**
 * Is siege `s`'s daily report due at `now`? From `day` on, one a night,
 * after each of its nights (campaignNight: a boundary in its first few
 * hours isn't one): posted with the first game anyone plays after the night
 * boundary (`activity.at`, noted on every play), or
 * PACE_RULES.reportLatestHours after the boundary at the latest. Never
 * twice for a night (`report.night`) — unless a try Discord refused for now
 * released the claim (releaseReport) — and never once it's beaten or over.
 * @returns {?string} the night it's due for (the night now), or null
 */
export function reportDue(s, data, now = Date.now()) {
  const night = reportOwed(s, now);
  if (!night) return null;
  const boundary = nightBoundaryBefore(now);
  const played = Number(data?.activity?.at) || 0;
  if (played >= boundary || now >= boundary + PACE_RULES.reportLatestHours * 60 * MINUTE) return night;
  return null;
}

/**
 * The night whose report siege `s` owes at `now` — its boundary has passed
 * and it counts, and the report isn't claimed (or was released for a
 * retry) — or null. reportDue adds when to post it.
 *
 * Never for a night older than the last one claimed: the scheduler's passes
 * don't overlap per guild, but a slow pass on another guild lets the next
 * pass reach this one first, and the slow pass then arrives with an older
 * `now`. It re-posted the night before's report, moved reportedThrough
 * back, and the next pass re-posted the night after (review, 2026-11-06).
 * Night keys are YYYY-MM-DD: they compare as strings.
 */
function reportOwed(s, now) {
  if (!s || !timingsOf(s).report || !isLive(s, now) || !(s.hp > 0)) return null;
  const boundary = nightBoundaryBefore(now);
  if (boundary < firstNightBoundary(s.startedAt, timingsOf(s))) return null;
  const night = nightKey(now);
  const r = s.report;
  if (r?.night && night < r.night) return null;
  if (r?.night === night && !(r.claimedAt === null && !r.messageId && !r.unannounced)) return null;
  return night;
}

/**
 * The night boundary of siege `s`'s first report, or null when it gets
 * none: no report at its pace, or (a day siege started in the hour before
 * 12:00 UTC) no counted boundary before it ends. /siege start's reply says it.
 */
export function firstReportAt(s) {
  const t = timingsOf(s);
  if (!t.report) return null;
  const first = firstNightBoundary(s.startedAt, t);
  return first < s.endsAt ? first : null;
}

/**
 * Will siege `s` post a report after `now` that a kept digest can wait for:
 * tonight's, still owed (reportOwed), or one at a counted boundary before
 * it ends (gamePace.reportBoundaryLeft)?
 */
export function reportToCome(s, now = Date.now()) {
  const t = timingsOf(s);
  if (!t.report) return false;
  return !!reportOwed(s, now) || reportBoundaryLeft(s.startedAt, s.endsAt, t, now);
}

/** The nights' tallies a report covers: every night after the last one reported, up to `last` (night 1 may span two keys) */
function talliesFor(s, last) {
  const from = s.reportedThrough || '';
  const out = { damage: 0, users: {} };
  let any = false;
  for (const [key, n] of Object.entries(isObject(s.nightly) ? s.nightly : {})) {
    if (!(key > from && key <= last) || !isObject(n)) continue;
    any = true;
    out.damage += Number(n.damage) || 0;
    for (const [id, u] of Object.entries(isObject(n.users) ? n.users : {})) {
      const o = (out.users[id] ||= { name: u.name, damage: 0, frees: 0, cures: 0 });
      o.name = u.name;
      for (const k of ['damage', 'frees', 'cures']) o[k] += Number(u[k]) || 0;
    }
  }
  return any ? out : null;
}

/**
 * Claim siege `siegeId`'s report for `night`, saved BEFORE the send (as the
 * results are): a restart can drop a night's report, never post two. The
 * claim takes what the report shows — the nights since the last report's
 * tallies, its number, and the digests nobody was pinged for
 * (`unreported`, cleared only once the report has gone: recordReport).
 * @returns {{siege, report: {night, last, number, tally: ?object, digested: object[]}} | {error}}
 */
export function claimReport(guildId, siegeId, night, now = Date.now()) {
  return withSiege(guildId, siegeId, (s, data) => {
    if (reportDue(s, data, now) !== night) return { error: 'not-due' };
    const last = shiftNight(night, -1);
    const number = campaignNight(s.startedAt, nightBoundaryBefore(now), timingsOf(s)) - 1;
    const digested = Array.isArray(s.unreported) ? s.unreported : [];
    const tries = s.report?.night === night ? Number(s.report.tries) || 0 : 0;
    // How many nights its tallies cover: one, unless a report was lost (a
    // claim whose send died, the bot down across two boundaries) — then
    // "last night" would add up several, and the report says how many
    // (review, 2026-11-06). From the night after the last one reported on,
    // or the siege's own first night, to `last`.
    const from = s.reportedThrough ? shiftNight(s.reportedThrough, 1) : siegeNight(s, s.startedAt);
    const nights = Math.max(1, nightsBetween(from, last) + 1);
    s.report = { night, last, number, claimedAt: now, messageId: null, unannounced: null, tries, told: digested.map(d => `${d.userId}:${d.at}`) };
    return { siege: s, report: { night, last, number, nights, tally: talliesFor(s, last), digested } };
  });
}

/**
 * Night `night`'s report was posted (message `messageId`), or (`reason`)
 * won't be. Either way that night's tallies are done with. The digests it
 * named leave `unreported` once it was posted — or may have been
 * (`'send-unknown'`, a timeout: drop, never repeat). One that never went out
 * (no channel, Discord refused it for good) leaves them for the next.
 */
export function recordReport(guildId, siegeId, night, { messageId = null, reason = null } = {}) {
  return withSiege(guildId, siegeId, (s) => {
    if (s.report?.night !== night) return { error: 'not-claimed' };
    s.report.messageId = messageId;
    s.report.unannounced = reason;
    s.reportedThrough = laterNight(s.reportedThrough, s.report.last);
    if (messageId || reason === 'send-unknown') {
      const told = new Set(s.report.told || []);
      s.unreported = (Array.isArray(s.unreported) ? s.unreported : []).filter(d => !told.has(`${d.userId}:${d.at}`));
    }
    return { siege: s };
  });
}

/**
 * The later of two night keys (YYYY-MM-DD, so they compare as strings), or
 * null: reportedThrough only ever moves forward, whatever order a late pass
 * records a report in (reportOwed)
 */
const laterNight = (a, b) => ([a, b].filter(k => typeof k === 'string' && k).sort().at(-1) ?? null);

/**
 * Discord refused night `night`'s report for now (rate-limited, an outage:
 * nothing was posted): release the claim for the next pass, `unreported`
 * kept, up to PACE_RULES.reportTries; then it's given up as `reason`.
 * @returns {{siege, gaveUp: boolean} | {error}}
 */
export function releaseReport(guildId, siegeId, night, reason = 'send-failed') {
  return withSiege(guildId, siegeId, (s) => {
    const r = s.report;
    if (r?.night !== night || r.messageId || r.unannounced) return { error: 'settled' };
    r.tries = (Number(r.tries) || 0) + 1;
    if (r.tries >= PACE_RULES.reportTries) {
      r.unannounced = reason;
      s.reportedThrough = laterNight(s.reportedThrough, r.last);
      return { siege: s, gaveUp: true };
    }
    r.claimedAt = null;
    return { siege: s, gaveUp: false };
  });
}
