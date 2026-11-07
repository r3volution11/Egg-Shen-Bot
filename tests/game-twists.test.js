/**
 * R4's twists: on a scored play, a small chance that something happens to
 * the player — +3 from the seat cushions, a raccoon with their wallet, a
 * Jinx on their next play. Driven through recordPlay and resolvePlay (the
 * two steps finishPlay takes) with the luck sequenced by _setLuck, so each
 * twist is chosen on purpose: one luck() says whether a twist fires, the
 * next which (rTwist below), and a third picks an item when one needs it.
 *
 * What's checked is what's stored — points, bonus, the Glovebox, shields,
 * users[uid].effects, the day's counters — and the exact lines posted, not
 * that "something happened". The real command end to end is in
 * tests/game-commands.test.js.
 *
 * Run with: npm test -- tests/game-twists.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  DEFAULT_GAME_SETTINGS, getGameSettings, recordPlay, loadScores, mutateScores, deleteScores, resetPlayLimits,
  extraLines, resultLine, activeStatuses,
} from '../src/utils/gameScores.js';
import { resolvePlay, outcomeLabel, tagged } from '../src/utils/gamePlay.js';
import { pickLine } from '../src/utils/gameRules.js';
import { luck, _setLuck, LUCK_OFF } from '../src/utils/gameLuck.js';
import { TWISTS, TWIST_RULES, TITLES, BAG_3B } from '../src/data/gameRewards.js';
import { FOODFIGHT_LINES } from '../src/data/foodfightLines.js';
import { DOOM_LINES } from '../src/data/doomLines.js';
import { DOOM_BLOCKED_LINES } from '../src/data/rescueLines.js';

const GUILD = 'twists-guild';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 2 Nov 2026, 18:00 UTC: no calendar happening, six hours into a night */
const T = Date.UTC(2026, 10, 2, 18, 0);

const SAM = { id: 'sam', name: 'Sam' };
const ALEX = { kind: 'member', pingUserIds: ['alex'], name: 'Alex', mention: '<@alex>' };
const ROLE = { kind: 'role', pingUserIds: [], name: 'Mods', mention: '<@&mods>' };
// Room for dozens of scored plays in a day; twists on, at the default 4%
const SETTINGS = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 1000 };
const PIE = FOODFIGHT_LINES.pie; // 15 hits, 6 misses, 4 backfires
const ZOMBIE = DOOM_LINES.zombie;
const BLOCKED = tagged(DOOM_BLOCKED_LINES, 'blocked');

/** luck() returns these in turn, then LUCK_OFF (which fires nothing) */
function luckSeq(...values) {
  const queue = [...values];
  _setLuck(() => (queue.length ? queue.shift() : LUCK_OFF));
  return queue;
}

/**
 * The r that makes the twist draw land on `key`, among the twists in
 * `keys` (the pool that can fire, kept in TWISTS order): the middle of its
 * share of the total weight.
 */
function rTwist(key, keys = Object.keys(TWISTS)) {
  const pool = Object.keys(TWISTS).filter(k => keys.includes(k));
  const total = pool.reduce((n, k) => n + TWISTS[k].weight, 0);
  let before = 0;
  for (const k of pool) {
    if (k === key) return (before + TWISTS[k].weight / 2) / total;
    before += TWISTS[k].weight;
  }
  throw new Error(`${key} isn't in the pool`);
}
/** Fire a twist (0 < 4%) and land on `key` */
const twistNext = (key, keys, ...more) => luckSeq(0, rTwist(key, keys), ...more);
const GOOD_KEYS = Object.keys(TWISTS).filter(k => TWISTS[k].good);
const without = (...out) => Object.keys(TWISTS).filter(k => !out.includes(k));

/** A random number whose line draw passes `ok` */
function rWhere(ok) {
  for (let i = 0; i < 1000; i++) {
    const r = (i + 0.5) / 1000;
    if (ok(r)) return r;
  }
  throw new Error('no r draws that');
}
const rOn = (lines, outcome, weights = {}) => rWhere(r => pickLine(lines, weights, () => r).outcome === outcome);

/** recordPlay with a bare outcome: a food fight at a role unless told otherwise */
const play = (outcome, { game = 'foodfight', target = ROLE, settings = SETTINGS, now = T, item, mods, happenings } = {}) =>
  recordPlay(GUILD, { game, actor: SAM, target, outcome, settings, item, mods, happenings }, now);

/** What finishPlay does, with the line draw's random numbers given */
function draw(game, action, lines, { actor = SAM, target = ROLE, blockedLines = [], settings = SETTINGS, now = T, random = () => 0.5, happenings = [] } = {}) {
  const drawn = resolvePlay(GUILD, { game, action, actor, target, lines, blockedLines, settings, happenings }, now, random);
  const result = recordPlay(GUILD, { game, action, actor, target, outcome: drawn.outcome, settings, item: drawn.item, mods: drawn.mods, happenings }, now);
  return { drawn, result };
}

const names = (r) => ({ actor: 'Sam', target: r.targetId ? 'Alex' : null });
const lines = (r) => extraLines(r, names(r));
const sam = () => loadScores(GUILD).users.sam;
const food = () => sam().games.foodfight.all;
const today = () => loadScores(GUILD).daily.sam;
const seed = (id, fn) => mutateScores(GUILD, (d) => fn((d.users[id] ||= { name: id, games: {} }), d));
/** One game's stats in a period, as earlier plays would have stored them */
const stats = (over) => ({ points: 0, plays: 0, scoredPlays: 0, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0, ...over });

beforeEach(() => {
  deleteScores(GUILD);
  resetPlayLimits();
});
afterEach(() => {
  jest.restoreAllMocks();
  _setLuck(null);
});

// ── settings ────────────────────────────────────────────────────────────

describe('the settings', () => {
  test('on by default, at 4%; happenings on, normal, no channel', () => {
    expect(getGameSettings({})).toMatchObject({ twists: true, twistPercent: 4, happenings: true, happeningFrequency: 'normal', happeningChannel: null });
  });

  test('read through the normalizer: the percent clamped to 0–15 and whole, bad values back to the default', () => {
    const percent = (v) => getGameSettings({ games: { twistPercent: v } }).twistPercent;
    expect([percent(0), percent(15), percent(20), percent(-3), percent(4.6), percent('7'), percent('lots'), percent(null)]).toEqual([0, 15, 15, 0, 5, 7, 4, 4]);
    expect(getGameSettings({ games: { twists: false, happenings: false } })).toMatchObject({ twists: false, happenings: false });
    // Only a real boolean switches: anything else is the default
    expect(getGameSettings({ games: { twists: 'no', happenings: 0 } })).toMatchObject({ twists: true, happenings: true });
    const freq = (v) => getGameSettings({ games: { happeningFrequency: v } }).happeningFrequency;
    expect(['off', 'rare', 'normal', 'often', 'sometimes', undefined].map(freq)).toEqual(['off', 'rare', 'normal', 'often', 'normal', 'normal']);
    const channel = (v) => getGameSettings({ games: { happeningChannel: v } }).happeningChannel;
    expect([channel('123456789'), channel(''), channel(42), channel(null)]).toEqual(['123456789', null, null, null]);
  });
});

// ── each twist ──────────────────────────────────────────────────────────

describe('the good ones', () => {
  test('💰 Loose Change: +3 as bonus, to the player only — the target is untouched', () => {
    twistNext('loose');
    const r = play('hit', { target: ALEX });
    expect(r.twist).toEqual({ key: 'loose', good: true, points: 3 });
    expect([r.actorDelta, r.bonus, r.actorPoints, r.targetDelta, r.targetBonus]).toEqual([3, 3, 6, -1, 0]);
    expect(food()).toMatchObject({ points: 6, bonus: 3 });
    expect(sam().games.foodfight['m2026-11']).toMatchObject({ points: 6, bonus: 3 });
    expect(loadScores(GUILD).users.alex.games.foodfight.all).toMatchObject({ points: -1 });
    expect(loadScores(GUILD).users.alex.games.foodfight.all.bonus).toBeUndefined();
    expect(today()).toMatchObject({ twists: 1 });
    expect([sam().lastTwistBad, sam().lifetime.twists]).toEqual([false, 1]);
    expect(lines(r)).toEqual([
      '-# 🎲 Twist! 💰 Loose Change: Sam digs through the seat cushions and finds a few bucks and a Junior Mint of unknown age. Sam +3.',
    ]);
  });

  test('🌟 Fan Favorite: +5', () => {
    twistNext('fan');
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'fan', good: true, points: 5 });
    expect([r.bonus, food().points]).toEqual([5, 8]);
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🌟 Fan Favorite: The back row starts chanting Sam\'s name. Nobody knows why. Sam +5.']);
  });

  test('🎁 Glovebox Find: one of the six prize items, by luck; a full stack is +2 instead', () => {
    twistNext('find', undefined, 0.4); // 0.4 × 6 → the third: a Cursed VHS
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'find', good: true, item: 'vhs', overflow: false });
    expect(sam().glovebox).toEqual({ vhs: 1 });
    expect(r.bonus).toBe(0);
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🎁 Glovebox Find: Sam pops the glovebox and finds a 📼 Cursed VHS that definitely wasn\'t there before.']);

    seed('sam', u => { u.glovebox = { vhs: 2 }; });
    twistNext('find', undefined, 0.4);
    const full = play('hit', { now: T + MIN });
    expect(full.twist).toEqual({ key: 'find', good: true, item: 'vhs', overflow: true });
    expect([sam().glovebox, full.bonus]).toEqual([{ vhs: 2 }, 2]);
    expect(lines(full)).toEqual([
      '-# 🎲 Twist! 🎁 Glovebox Find: Sam pops the glovebox and finds a 📼 Cursed VHS that definitely wasn\'t there before. The Glovebox already holds 2, so Sam +2 instead.',
    ]);
    expect(TWIST_RULES.findItems).toEqual(['gpie', 'garlic', 'vhs', 'holyw', 'antid', 'penny']);
  });

  test('🍀 Lucky Break: the next play is drawn from the good lines only, and that uses it up', () => {
    twistNext('luckybreak');
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'luckybreak', good: true });
    expect(sam().effects).toEqual({ luckybreak: { at: T, until: T + DAY } });
    expect(lines(r)).toEqual([
      '-# 🎲 Twist! 🍀 Lucky Break: A black cat crosses Sam\'s path… backwards. That cancels out, right? Sam\'s next play can only go well.',
    ]);

    const r2 = rOn(PIE, 'miss');
    const { drawn, result } = draw('foodfight', 'throw', PIE, { random: () => r2, now: T + MIN });
    expect(drawn.line).toBe(pickLine(PIE, { miss: 0, backfire: 0 }, () => r2));
    expect([drawn.outcome, drawn.mods]).toEqual(['hit', { statuses: ['luckybreak'] }]);
    expect(result.statuses).toEqual([{ key: 'luckybreak' }]);
    expect(sam().effects).toBeUndefined();
    expect(lines(result)).toEqual(['-# 🍀 Lucky Break: Sam\'s play could only go well.']);
    // …and the one after draws as usual
    expect(draw('foodfight', 'throw', PIE, { random: () => r2, now: T + 2 * MIN }).drawn.outcome).toBe('miss');
  });

  test('🍿 Free Refill: +1 on each good outcome for the next 3 plays; a miss still counts one', () => {
    twistNext('refill');
    expect(play('hit').twist).toEqual({ key: 'refill', good: true });
    expect(sam().effects).toEqual({ refill: { at: T, until: T + DAY, playsLeft: 3 } });

    const a = play('hit', { now: T + MIN });
    expect([a.actorDelta, a.bonus]).toEqual([3, 1]);
    expect(lines(a)).toEqual(['-# 🍿 Free Refill: Sam +1 (2 more).']);
    const b = play('miss', { now: T + 2 * MIN });
    expect([b.actorDelta, b.bonus, b.statuses]).toEqual([-1, 0, []]);
    expect(sam().effects.refill.playsLeft).toBe(1);
    const c = play('hit', { now: T + 3 * MIN });
    expect(lines(c)).toEqual(['-# 🍿 Free Refill: Sam +1 (the last one).']);
    expect(sam().effects).toBeUndefined();
    expect(play('hit', { now: T + 4 * MIN }).bonus).toBe(0);
    // 3 + 4 − 1 + 4 + 3, two of it bonus
    expect(food()).toMatchObject({ points: 13, bonus: 2 });
  });

  test('🎬 Director\'s Cut: the next GOOD outcome ×2 — a miss doesn\'t use it; with a Golden Pie, ×3 at most', () => {
    twistNext('dcut');
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'dcut', good: true });
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🎬 Director\'s Cut: The projectionist slips in Sam\'s extended cut. Sam\'s next good play scores double.']);
    expect(play('miss', { now: T + MIN }).statuses).toEqual([]);
    expect(sam().effects).toEqual({ dcut: { at: T, until: T + DAY } });

    const hit = play('hit', { now: T + 2 * MIN });
    expect([hit.actorDelta, hit.statuses]).toEqual([6, [{ key: 'dcut', wasted: false }]]);
    expect(lines(hit)).toEqual(['-# 🎬 Director\'s Cut: Sam\'s points ×2.']);
    expect(sam().effects).toBeUndefined();

    // Golden Pie ×2 and the Cut ×2 would be ×4: your gains stop at ×3
    seed('sam', u => { u.glovebox = { gpie: 1 }; u.effects = { dcut: { at: T, until: T + DAY } }; });
    const pie = play('hit', { item: 'gpie', now: T + 3 * MIN });
    expect([pie.actorDelta, pie.statuses]).toEqual([9, [{ key: 'dcut', wasted: false }]]);
  });

  test('🔥 Second Wind: the next bad outcome keeps the streak (the card\'s and the titles\'), once', () => {
    play('hit');
    play('hit', { now: T + MIN });
    twistNext('secondwind');
    expect(play('hit', { now: T + 2 * MIN }).twist).toEqual({ key: 'secondwind', good: true });

    const kept = play('miss', { now: T + 3 * MIN });
    expect([kept.streak, food().streak, sam().lifetime.streak.foodfight]).toEqual([3, 3, 3]);
    expect(kept.statuses).toEqual([{ key: 'secondwind' }]);
    expect(lines(kept)).toEqual(['-# 🔥 Second Wind: Sam\'s streak survives.']);
    expect(resultLine('foodfight', kept, names(kept), { label: outcomeLabel(kept) })).toBe('-# 💨 Miss! Sam −1 (8 pts · 🔥 3 in a row)');
    expect(sam().effects).toBeUndefined();
    expect(play('miss', { now: T + 4 * MIN }).streak).toBe(0);
  });

  test('Second Wind waits while there\'s no streak to keep', () => {
    seed('sam', u => { u.effects = { secondwind: { at: T, until: T + DAY } }; });
    const r = play('miss');
    expect([r.streak, r.statuses]).toEqual([0, []]);
    expect(sam().effects).toEqual({ secondwind: { at: T, until: T + DAY } });
  });

  test('👻 Friendly Ghost: 30 minutes safe from /doom; a longer shield already up stays as it is', () => {
    twistNext('ghost');
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'ghost', good: true, until: T + 30 * MIN });
    expect(loadScores(GUILD).shields.sam).toBe(T + 30 * MIN);
    expect(lines(r)).toEqual([
      `-# 🎲 Twist! 👻 Friendly Ghost: A friendly ghost starts following Sam around. It mostly just hums. Sam is safe from /doom until <t:${(T + 30 * MIN) / 1000}:t>.`,
    ]);
    // Like a rescue's shield: a doom on Sam is blocked
    const kim = { id: 'kim', name: 'Kim' };
    const samTarget = { kind: 'member', pingUserIds: ['sam'], name: 'Sam' };
    const blocked = draw('doom', 'fate', ZOMBIE, { actor: kim, target: samTarget, blockedLines: BLOCKED, now: T + MIN });
    expect(blocked.result.outcome).toBe('blocked');

    mutateScores(GUILD, (d) => { d.shields.sam = T + 2 * HOUR; });
    twistNext('ghost');
    expect(play('hit', { now: T + 2 * MIN }).twist.until).toBe(T + 2 * HOUR);
    expect(loadScores(GUILD).shields.sam).toBe(T + 2 * HOUR);
  });
});

describe('the bad ones', () => {
  test('🦝 Pickpocketed: −3, as bonus, counted against the day\'s twist losses', () => {
    twistNext('pickpocket');
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'pickpocket', good: false, points: -3 });
    expect([r.actorDelta, r.bonus, r.actorPoints]).toEqual([3, -3, 0]);
    expect(food()).toMatchObject({ points: 0, bonus: -3 });
    expect([today().twistLoss, sam().lastTwistBad]).toEqual([3, true]);
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🦝 Pickpocketed: A raccoon in a tiny trench coat lifts Sam\'s wallet. Sam −3.']);
  });

  test('📞 The Call Is Coming From Inside the House: −4', () => {
    play('hit');
    twistNext('call');
    const r = play('hit', { now: T + MIN });
    expect(r.twist).toEqual({ key: 'call', good: false, points: -4 });
    expect([r.bonus, r.actorPoints, today().twistLoss]).toEqual([-4, 2, 4]);
    expect(lines(r)).toEqual(['-# 🎲 Twist! 📞 The Call Is Coming From Inside the House: Sam answers the snack-bar phone. Big mistake. Sam −4.']);
  });

  test('🚗 Car Break-In: a random item gone — never the Night Light; with nothing else to take, the mosquitoes come instead', () => {
    seed('sam', u => { u.glovebox = { gpie: 2, garlic: 1, nlight: 1 }; });
    twistNext('breakin', undefined, 0.6); // what can go: Golden Pie, Garlic → 0.6 × 2 → Garlic
    const r = play('hit');
    expect(r.twist).toEqual({ key: 'breakin', good: false, item: 'garlic' });
    expect(sam().glovebox).toEqual({ gpie: 2, nlight: 1 });
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🚗 Car Break-In: Someone jimmied Sam\'s glovebox and swiped the 🧄 Garlic. They left half a corn dog.']);

    deleteScores(GUILD);
    seed('sam', u => { u.glovebox = { nlight: 1 }; });
    twistNext('breakin');
    const swarm = play('hit');
    expect(swarm.twist).toEqual({ key: 'mosquito', good: false });
    expect(sam().glovebox).toEqual({ nlight: 1 });
    expect(sam().effects).toEqual({ mosquito: { at: T, until: T + DAY, playsLeft: 3 } });
  });

  test('🧛 Bitten: gains halved, rounded down, for the next 3 plays; a miss still counts one', () => {
    twistNext('bitten');
    const r = play('hit');
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🧛 Bitten: Something in the back seat bites Sam. It\'s probably fine. Sam\'s gains are halved for the next 3 plays.']);

    const a = play('hit', { now: T + MIN });
    expect([a.actorDelta, a.statuses]).toEqual([1, [{ key: 'bitten', before: 3, after: 1, left: 2 }]]);
    expect(lines(a)).toEqual(['-# 🧛 Bitten: Sam\'s +3 is halved to +1 (2 more).']);
    const b = play('miss', { now: T + 2 * MIN });
    expect([b.actorDelta, b.statuses, sam().effects.bitten.playsLeft]).toEqual([-1, [], 1]);
    const c = play('hit', { now: T + 3 * MIN });
    expect(lines(c)).toEqual(['-# 🧛 Bitten: Sam\'s +3 is halved to +1 (the last one).']);
    expect(sam().effects).toBeUndefined();
    expect(play('hit', { now: T + 4 * MIN }).actorDelta).toBe(3);
    // The halved points are the play's own: the points prize counts them as they are
    expect(sam().progress.points).toBe(3 + 1 + 1 + 3);
  });

  test('🐈‍⬛ Jinxed: the next play draws twice and keeps the worse for the player — on a tie, the first', () => {
    twistNext('jinxed');
    const r = play('hit');
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🐈‍⬛ Jinxed: A black cat crosses Sam\'s path. Forwards. That\'s the bad one. Sam\'s next play rolls twice and keeps the worse.']);

    const rHit = rOn(PIE, 'hit');
    const rMiss = rOn(PIE, 'miss');
    const rBack = rOn(PIE, 'backfire');
    // resolvePlay only reads, so the same Jinx can be asked again
    const twice = (a, b) => {
      const randoms = [a, b];
      return resolvePlay(GUILD, { game: 'foodfight', action: 'throw', actor: SAM, target: ROLE, lines: PIE, settings: SETTINGS }, T + MIN, () => randoms.shift());
    };
    expect(twice(rHit, rMiss).line).toBe(pickLine(PIE, {}, () => rMiss));
    expect(twice(rMiss, rHit).line).toBe(pickLine(PIE, {}, () => rMiss));
    expect(twice(rMiss, rBack).line).toBe(pickLine(PIE, {}, () => rBack));
    // Two misses: the first stands
    const rMiss2 = rWhere(x => x > rMiss && pickLine(PIE, {}, () => x).outcome === 'miss' && pickLine(PIE, {}, () => x) !== pickLine(PIE, {}, () => rMiss));
    expect(twice(rMiss, rMiss2).line).toBe(pickLine(PIE, {}, () => rMiss));

    const randoms = [rHit, rMiss];
    const { drawn, result } = draw('foodfight', 'throw', PIE, { random: () => randoms.shift(), now: T + MIN });
    expect([drawn.outcome, drawn.mods]).toEqual(['miss', { statuses: ['jinxed'] }]);
    expect([result.actorDelta, result.statuses]).toEqual([-1, [{ key: 'jinxed' }]]);
    expect(lines(result)).toEqual(['-# 🐈‍⬛ Jinxed: two draws, and Sam got the worse one.']);
    expect(sam().effects).toBeUndefined();
  });

  test('🦟 Mosquito Swarm: −1 on each of the next 3 plays', () => {
    play('hit');
    twistNext('mosquito');
    const r = play('hit', { now: T + MIN });
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🦟 Mosquito Swarm: Every mosquito in the county finds Sam. Sam −1 on each of the next 3 plays.']);
    const bites = [2, 3, 4].map(i => play(i === 3 ? 'miss' : 'hit', { now: T + i * MIN }));
    expect(bites.map(b => b.bonus)).toEqual([-1, -1, -1]);
    expect(bites.map(b => lines(b))).toEqual([
      ['-# 🦟 Mosquito Swarm: Sam −1 (2 more).'],
      ['-# 🦟 Mosquito Swarm: Sam −1 (1 more).'],
      // (2.76.0: the day's 4th good play fills the day's Chi, and says so)
      ['-# 🦟 Mosquito Swarm: Sam −1 (the last one).', '-# ☯️ Sam +1 Chi · that\'s all the Chi for today'],
    ]);
    expect([today().twistLoss, sam().effects]).toEqual([3, undefined]);
    expect(food()).toMatchObject({ points: 3 + 3 + 3 - 1 - 1 - 1 + 3 - 1, bonus: -3 });
  });

  test('🎞️ Reel Change: this play\'s gain is cancelled; the points prize counter gives it back', () => {
    play('hit');
    twistNext('reel');
    const r = play('hit', { now: T + MIN });
    expect(r.twist).toEqual({ key: 'reel', good: false, cancelled: 3 });
    expect([r.actorDelta, r.actorPoints, r.bonus]).toEqual([0, 3, 0]);
    expect(food()).toMatchObject({ points: 3 });
    expect(sam().games.foodfight['m2026-11'].points).toBe(3);
    expect(sam().progress.points).toBe(3);
    // The play still happened: a hit, and the streak it extends
    expect([food().counts.hit, r.streak]).toEqual([2, 2]);
    expect(resultLine('foodfight', r, names(r), { label: outcomeLabel(r) })).toBe('-# 🎯 Hit! Sam ±0 (3 pts · 🔥 2 in a row)');
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🎞️ Reel Change: The film snaps mid-scene. Whatever Sam just earned goes up in projector smoke. Sam\'s +3 is gone.']);
  });

  test('🧊 Brain Freeze: this game\'s streak resets (the card\'s and the titles\'); the best stays', () => {
    for (let i = 0; i < 3; i++) play('hit', { now: T + i * MIN });
    twistNext('brainfreeze');
    const r = play('hit', { now: T + 3 * MIN });
    expect(r.twist).toEqual({ key: 'brainfreeze', good: false, streak: 4, gameName: 'Food Fight' });
    expect([r.streak, food().streak, food().bestStreak]).toEqual([0, 0, 4]);
    expect([sam().lifetime.streak.foodfight, sam().lifetime.bestStreak]).toEqual([0, 4]);
    expect(lines(r)).toEqual([
      '-# 🎲 Twist! 🧊 Brain Freeze: Sam chugs the slushie too fast. EVERYTHING HURTS. Sam\'s Food Fight streak of 4 is over.',
      // 2.76.0: the 4th good play of the day fills the day's Chi
      '-# ☯️ Sam +1 Chi · that\'s all the Chi for today',
    ]);
  });
});

// ── the rules ───────────────────────────────────────────────────────────

describe('the rules', () => {
  test('at most 3 a member per UTC day; the next day they can come again', () => {
    _setLuck(() => 0); // every play fires one, and draws the first: Loose Change
    const day = [0, 1, 2, 3, 4].map(i => play('hit', { now: T + i * MIN }));
    expect(day.map(r => r.twist?.key ?? null)).toEqual(['loose', 'loose', 'loose', null, null]);
    expect(today().twists).toBe(TWIST_RULES.perDay);
    expect(play('hit', { now: T + DAY }).twist?.key).toBe('loose');
  });

  test('the twist after a bad one is always good', () => {
    twistNext('pickpocket');
    play('hit');
    expect(sam().lastTwistBad).toBe(true);
    // Over every twist 0.999 is the last, Brain Freeze (bad); over the good
    // ones, Friendly Ghost — and since 2.76.0 (BAG_3B) Ching Dai's Curse and
    // the Red Envelope, which follow them
    luckSeq(0, 0.999);
    expect(play('hit', { now: T + MIN }).twist).toMatchObject({ key: BAG_3B ? 'redEnvelope' : 'ghost', good: true });
    expect(sam().lastTwistBad).toBe(false);
    luckSeq(0, 0.999);
    expect(play('hit', { now: T + 2 * MIN }).twist.key).toBe(BAG_3B ? 'chingDai' : 'brainfreeze');
    expect(GOOD_KEYS).toEqual(['loose', 'fan', 'find', 'luckybreak', 'refill', 'dcut', 'secondwind', 'ghost', ...(BAG_3B ? ['redEnvelope'] : [])]);
  });

  test('a twist that would do nothing isn\'t drawn: no gain to cancel, no streak to freeze, nothing left to take', () => {
    // A miss for a newcomer: −1, no streak, and the month below 0. (With
    // the Six-Demon Bag off, so 2.76.0's two are idle too: Ching Dai's Curse
    // would otherwise be the last of the pool)
    luckSeq(0, 0.999);
    expect(play('miss', { settings: { ...SETTINGS, magic: false } }).twist.key).toBe('mosquito');
    // The same r over a pool without those four (and those two) lands where it should
    expect(pickLine(without('pickpocket', 'call', 'reel', 'brainfreeze', 'redEnvelope', 'chingDai').map(k => ({ outcome: k })),
      Object.fromEntries(Object.entries(TWISTS).map(([k, t]) => [k, t.weight])), () => 0.999).outcome).toBe('mosquito');
  });

  test('twist losses: at most 8 a day, all twists together, then the losing ones stop', () => {
    play('hit');
    play('hit', { now: T + MIN });
    mutateScores(GUILD, (d) => { d.daily.sam.twistLoss = 7; });
    twistNext('pickpocket');
    const r = play('hit', { now: T + 2 * MIN });
    expect(r.twist).toEqual({ key: 'pickpocket', good: false, points: -1 });
    expect([r.bonus, today().twistLoss]).toEqual([-1, TWIST_RULES.dailyLoss]);
    expect(lines(r)).toEqual(['-# 🎲 Twist! 🦝 Pickpocketed: A raccoon in a tiny trench coat lifts Sam\'s wallet. Sam −1 (all a twist can take).']);

    // Nothing left today: no Pickpocketed or Call in the draw, and a mosquito can't bite
    seed('sam', u => { u.lastTwistBad = false; u.effects = { mosquito: { at: T, until: T + DAY, playsLeft: 3 } }; });
    twistNext('pickpocket');
    const next = play('hit', { now: T + 3 * MIN });
    expect(next.twist.key).toBe(pickLine(without('pickpocket', 'call').map(k => ({ outcome: k })),
      Object.fromEntries(Object.entries(TWISTS).map(([k, t]) => [k, t.weight])), () => rTwist('pickpocket')).outcome);
    expect(['pickpocket', 'call']).not.toContain(next.twist.key);
    expect(next.statuses.filter(s => s.key === 'mosquito')).toEqual([]);
    expect(today().twistLoss).toBe(TWIST_RULES.dailyLoss);
    // A new UTC day, a new allowance
    seed('sam', u => { u.lastTwistBad = false; });
    twistNext('pickpocket');
    expect(play('hit', { now: T + DAY }).twist.points).toBe(-3);
  });

  test('…and never below 0 for the month, counting every game', () => {
    // Food fight −2 and doom +1 this month; a hit makes it +2 in all
    seed('sam', u => {
      u.games = {
        foodfight: { all: stats({ points: 40 }), y2026: stats({ points: 40 }), 'm2026-11': stats({ points: -2 }) },
        doom: { all: stats({ points: 1 }), y2026: stats({ points: 1 }), 'm2026-11': stats({ points: 1 }) },
      };
    });
    twistNext('pickpocket');
    const r = play('hit');
    expect(r.twist.points).toBe(-2);
    expect(sam().games.foodfight['m2026-11'].points + sam().games.doom['m2026-11'].points).toBe(0);
    expect(today().twistLoss).toBe(2);
    // At 0 there's nothing for a twist to take
    seed('sam', u => { u.lastTwistBad = false; u.effects = { mosquito: { at: T, until: T + DAY, playsLeft: 3 } }; });
    const miss = play('miss', { now: T + MIN });
    expect([miss.bonus, miss.statuses, sam().effects.mosquito.playsLeft]).toEqual([0, [], 2]);
  });

  test('statuses refresh rather than stack, and one unused runs out after 24 hours', () => {
    twistNext('bitten');
    play('hit');
    play('hit', { now: T + MIN });
    expect(sam().effects.bitten.playsLeft).toBe(2);
    seed('sam', u => { u.lastTwistBad = false; });
    twistNext('bitten');
    play('hit', { now: T + HOUR }); // halved (1 left), then Bitten again: back to 3, from now
    expect(sam().effects).toEqual({ bitten: { at: T + HOUR, until: T + HOUR + DAY, playsLeft: 3 } });

    deleteScores(GUILD);
    twistNext('luckybreak');
    play('hit');
    expect(Object.keys(activeStatuses(sam(), T + DAY - 1))).toEqual(['luckybreak']);
    expect(activeStatuses(sam(), T + DAY)).toEqual({});
    const r2 = rOn(PIE, 'miss');
    const { drawn, result } = draw('foodfight', 'throw', PIE, { random: () => r2, now: T + DAY + MIN });
    expect([drawn.outcome, drawn.mods, result.statuses]).toEqual(['miss', {}, []]);
    expect(sam().effects).toBeUndefined();
  });

  test('a Jinx clears a Lucky Break (and the other way): never both on one draw', () => {
    seed('sam', u => { u.effects = { luckybreak: { at: T, until: T + DAY } }; });
    twistNext('jinxed');
    play('hit', { mods: {} });
    expect(Object.keys(sam().effects)).toEqual(['jinxed']);
  });

  test('statuses wait for a scored play where something happens: not a capped play, not a blocked doom', () => {
    seed('sam', u => { u.effects = { bitten: { at: T, until: T + DAY, playsLeft: 3 } }; });
    const capped = play('hit', { settings: { ...SETTINGS, dailyScoredPlays: 0 } });
    expect([capped.capped, capped.statuses, sam().effects.bitten.playsLeft]).toEqual([true, [], 3]);
    mutateScores(GUILD, (d) => { d.shields.alex = T + HOUR; });
    const { result } = draw('doom', 'fate', ZOMBIE, { target: ALEX, blockedLines: BLOCKED, now: T + MIN });
    expect([result.outcome, result.statuses, sam().effects.bitten.playsLeft]).toEqual(['blocked', [], 3]);
  });

  test('never on a capped play or a blocked doom', () => {
    _setLuck(() => 0);
    expect(play('hit', { settings: { ...SETTINGS, dailyScoredPlays: 0 } }).twist).toBeNull();
    mutateScores(GUILD, (d) => { d.shields.alex = T + HOUR; });
    const { result } = draw('doom', 'fate', ZOMBIE, { target: ALEX, blockedLines: BLOCKED, now: T + MIN });
    expect([result.outcome, result.twist]).toEqual(['blocked', null]);
    expect(today().twists).toBeUndefined();
  });

  test('the chance: under 4% fires, 4% doesn\'t; 0% or switched off, never', () => {
    luckSeq(0.0399, 0);
    expect(play('hit').twist?.key).toBe('loose');
    luckSeq(0.04, 0);
    expect(play('hit', { now: T + MIN }).twist).toBeNull();

    _setLuck(() => 0);
    for (const settings of [{ ...SETTINGS, twistPercent: 0 }, { ...SETTINGS, twists: false },
      { ...getGameSettings({ games: { twistPercent: 0 } }), dailyScoredPlays: 1000 }]) {
      expect(play('hit', { settings, now: T + 2 * MIN }).twist).toBeNull();
    }
    expect(today().twists).toBe(1);
  });

  test('with GAME_LUCK=off nothing ever fires — even with Math.random stubbed to 0', () => {
    expect(process.env.GAME_LUCK).toBe('off');
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(luck()).toBe(LUCK_OFF);
    const outcomes = ['hit', 'miss', 'backfire', 'tasty', 'gross', 'spill'];
    const results = Array.from({ length: 30 }, (_, i) => play(outcomes[i % 6], { now: T + i * MIN }));
    expect(results.filter(r => r.twist)).toEqual([]);
    expect([today().twists, sam().effects, sam().lifetime.twists]).toEqual([undefined, undefined, undefined]);
  });

  test('Plot Twist 🎲: the 30th twist earns it, with +10, its line after the twist\'s', () => {
    expect(TITLES.find(t => t.key === 'plot-twist')).toEqual({ key: 'plot-twist', title: 'Plot Twist', badge: '🎲', need: 30, twists: true });
    seed('sam', u => {
      u.titles = { earned: {}, shown: null };
      u.lifetime = { do: {}, got: {}, streak: {}, bestStreak: 0, twists: 28 };
    });
    twistNext('loose');
    expect(play('hit').titles).toEqual([]);
    expect(sam().lifetime.twists).toBe(29);
    seed('sam', u => { u.lastTwistBad = false; });
    twistNext('loose');
    const r = play('hit', { now: T + MIN });
    expect(sam().lifetime.twists).toBe(30);
    expect(r.titles).toEqual([{ who: 'actor', userId: 'sam', key: 'plot-twist' }]);
    expect(r.bonus).toBe(3 + 10);
    expect(lines(r)).toEqual([
      '-# 🎲 Twist! 💰 Loose Change: Sam digs through the seat cushions and finds a few bucks and a Junior Mint of unknown age. Sam +3.',
      '-# 📜 Sam earned a title: 🎲 Plot Twist (+10). Show it with /scoreboard title:',
    ]);
  });

  test('a capped play doesn\'t count toward Plot Twist (no twist fires on one)', () => {
    seed('sam', u => {
      u.titles = { earned: {}, shown: null };
      u.lifetime = { do: {}, got: {}, streak: {}, bestStreak: 0, twists: 29 };
    });
    _setLuck(() => 0);
    play('hit', { settings: { ...SETTINGS, dailyScoredPlays: 0 } });
    expect([sam().lifetime.twists, sam().titles.earned]).toEqual([29, {}]);
  });
});
