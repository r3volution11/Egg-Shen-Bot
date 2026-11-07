/**
 * The Six-Demon Bag's rules (2.76.0, R3 brief §3–§5): every blessing and
 * hex, what uses each one up, what it changes, how it pays its caster, how
 * charms combine with the twists' statuses, the multipliers and the
 * defences, how elements cancel at a cast, and every reason a cast is
 * refused — driven through gameMagic's pure rules and the two steps a play
 * takes (resolvePlay, then recordPlay) on a scratch scores file, with the
 * line draw's random numbers given.
 *
 * What's checked is what's stored: points and bonus per game, the charm
 * left on the member (and its uses), the statuses, Chi, the caster's pay,
 * the ward — and the exact lines, not that "something happened". The
 * command end to end is tests/six-demon-bag.test.js; whole evenings through
 * the real commands and a siege, tests/magic-sim.test.js.
 *
 * Run with: npm test -- tests/game-magic.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  DEFAULT_GAME_SETTINGS, recordPlay, loadScores, mutateScores, deleteScores, resetPlayLimits, extraLines,
  castCharm, castCheck, homeGame, POINTS,
} from '../src/utils/gameScores.js';
import { resolvePlay, tagged } from '../src/utils/gamePlay.js';
import { pickLine } from '../src/utils/gameRules.js';
import { _setLuck, LUCK_OFF } from '../src/utils/gameLuck.js';
import { CHI, MAGIC, CHARMS, DAILY, TWIST_RULES, ELEMENT_OPPOSITE, TWISTS, TITLE_POINTS, PRIZES, DEFENCES, BAG_3B } from '../src/data/gameRewards.js';
import { ELEMENTS, ELEMENT_KEYS } from '../src/data/btilcLines.js';
import {
  activeCharms, wardOf, pruneCharms, castProblem, cancels, elementChoices, elementOf, charmLabel,
} from '../src/utils/gameMagic.js';
import { FOODFIGHT_LINES } from '../src/data/foodfightLines.js';
import { FOODFIGHT_FEED_LINES } from '../src/data/foodfightFeedLines.js';
import { DOOM_LINES } from '../src/data/doomLines.js';
import { DOOM_BLOCKED_LINES } from '../src/data/rescueLines.js';
import { POTION_LINES } from '../src/data/potionLines.js';

const GUILD = 'magic-guild';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 2 Nov 2026, 18:00 UTC: no calendar happening, six hours into a night */
const T = Date.UTC(2026, 10, 2, 18, 0);

const SAM = { id: 'sam', name: 'Sam' };
const ALEX = { kind: 'member', pingUserIds: ['alex'], name: 'Alex', mention: '<@alex>' };
const ROLE = { kind: 'role', pingUserIds: [], name: 'Mods', mention: '<@&mods>' };
// Room for dozens of scored plays a day; GAME_LUCK is off in tests, so no twist fires
const SETTINGS = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 1000 };
const PIE = FOODFIGHT_LINES.pie; // 15 hits, 6 misses, 4 backfires
const FEED = FOODFIGHT_FEED_LINES.pie; // 10 tasty, 3 gross, 3 spill
const ZOMBIE = DOOM_LINES.zombie; // 15 doomed, 5 escaped, 5 backfired
const POISON = POTION_LINES.poison.map(l => ({ ...l, outcome: l.outcome || 'worked' }));
const BLOCKED = tagged(DOOM_BLOCKED_LINES, 'blocked');

/** A random number whose line draw lands on `outcome` */
function rOn(lines, outcome, weights = {}) {
  for (let i = 0; i < 1000; i++) {
    const r = (i + 0.5) / 1000;
    if (pickLine(lines, weights, () => r).outcome === outcome) return r;
  }
  throw new Error(`no r draws ${outcome}`);
}
/** The outcomes counted as good for weighting a draw (bad ones out) */
const goodOnly = (lines) => Object.fromEntries([...new Set(lines.map(l => l.outcome))].map(o => [o, ['hit', 'tasty', 'doomed', 'rescued', 'worked'].includes(o) ? 1 : 0]));

const user = (id) => loadScores(GUILD).users[id];
/** A member's record, as earlier plays would have stored it: 'kim' plays as Kim */
const seed = (id, fn) => mutateScores(GUILD, (d) => fn((d.users[id] ||= { name: id[0].toUpperCase() + id.slice(1), games: {} }), d));
const today = (id) => loadScores(GUILD).daily[id];
const pts = (id, game) => user(id)?.games?.[game]?.all?.points ?? 0;
const bonus = (id, game) => user(id)?.games?.[game]?.all?.bonus ?? 0;

/** Put a charm on a member, as a cast would have */
function charm(id, kind, el, { by = kind === 'bless' ? 'kim' : 'jo', at = T, left = CHARMS[el][kind].plays } = {}) {
  seed(id, (u) => {
    (u.charms ||= {})[kind] = {
      el, by, byName: by ? by[0].toUpperCase() + by.slice(1) : null, at,
      until: at + (kind === 'bless' ? MAGIC.blessHours : MAGIC.hexHours) * HOUR, left,
      ...(kind === 'bless' ? { paid: false } : {}),
    };
  });
}
/** A twist's status, as recordPlay's setStatus leaves it */
const status = (id, key, plays) => seed(id, (u) => { (u.effects ||= {})[key] = { at: T, until: T + DAY, ...(plays ? { playsLeft: plays } : {}) }; });
/** A member who played a scored night recently (anyone hexable is) */
const regular = (id, at = T) => seed(id, (u) => { u.nights = { last: '2026-11-02', current: 1, best: 1, recent: ['2026-11-02'], saved: [], lightUsedAt: null }; });

/**
 * What the caster's pay looks like with the knob as it is (MAGIC.casterPayIn,
 * the brief's first balance knob): bonus points in a game, or Chi
 */
const PAY = MAGIC.casterPayIn === 'chi' ? { points: 0, chi: MAGIC.casterPay } : { points: MAGIC.casterPay, chi: 0 };
const PAY_TEXT = MAGIC.casterPayIn === 'chi' ? `+${MAGIC.casterPay} Chi` : `+${MAGIC.casterPay}`;
/** What a caster got: their bonus in a game, their Chi, and how many of their blessings paid off */
const paidTo = (id, game) => ({ points: bonus(id, game), chi: user(id)?.chi?.n ?? 0, paid: user(id)?.lifetime?.magic?.paid ?? 0 });

/** recordPlay with a bare outcome: a food fight at a role unless told otherwise */
const play = (outcome, { game = 'foodfight', actor = SAM, target = ROLE, settings = SETTINGS, now = T, mods, happenings, effect } = {}) =>
  recordPlay(GUILD, { game, actor, target, outcome, settings, mods, happenings, effect }, now);

/** What finishPlay does, with the line draw's random numbers given */
function draw(game, action, lines, { actor = SAM, target = ALEX, blockedLines = [], settings = SETTINGS, now = T, random = () => 0.5, happenings = [], effect, item = null } = {}) {
  const drawn = resolvePlay(GUILD, { game, action, actor, target, lines, blockedLines, settings, happenings, effect, item }, now, random);
  const result = recordPlay(GUILD, { game, action, actor, target, outcome: drawn.outcome, settings, item: drawn.item, mods: drawn.mods, happenings, effect }, now);
  return { drawn, result, lines: extraLines(result, { actor: actor.name, target: result.targetId ? target.name : null }) };
}

beforeEach(() => {
  deleteScores(GUILD);
  resetPlayLimits();
});
afterEach(() => {
  jest.restoreAllMocks();
  _setLuck(null);
});

// ── the pure rules ──────────────────────────────────────────────────────

describe('the pure rules', () => {
  test('three opposed pairs: a blessing and a hex cancel when their elements are the same or opposed, never otherwise', () => {
    expect(Object.keys(ELEMENT_OPPOSITE).sort()).toEqual([...ELEMENT_KEYS].sort());
    for (const a of ELEMENT_KEYS) {
      for (const b of ELEMENT_KEYS) expect([a, b, cancels(a, b)]).toEqual([a, b, a === b || ELEMENT_OPPOSITE[a] === b]);
      expect(ELEMENT_OPPOSITE[ELEMENT_OPPOSITE[a]]).toBe(a);
    }
    expect([cancels('rain', 'fire'), cancels('wind', 'smoke'), cancels('lightning', 'thunder')]).toEqual([true, true, true]);
    expect([cancels('rain', 'wind'), cancels('fire', 'thunder'), cancels('smoke', 'lightning')]).toEqual([false, false, false]);
  });

  test('a blessing lasts 24 hours, a hex 12, or until used; a hex that ends wards for 3 hours, pruned or not', () => {
    charm('sam', 'bless', 'fire');
    charm('sam', 'hex', 'wind');
    const u = () => user('sam');
    expect(Object.keys(activeCharms(u(), T + 11 * HOUR))).toEqual(['bless', 'hex']);
    expect(Object.keys(activeCharms(u(), T + 12 * HOUR))).toEqual(['bless']);
    expect(Object.keys(activeCharms(u(), T + 24 * HOUR))).toEqual([]);
    // An expired hex wards from its end, before anything prunes it…
    expect(wardOf(u(), T + 13 * HOUR)).toBe(T + 15 * HOUR);
    // …and pruning keeps that ward, and says what ran out unused
    const after = u();
    expect(pruneCharms(after, T + 25 * HOUR)).toEqual([
      { kind: 'bless', el: 'fire', by: 'kim', byName: 'Kim' },
      { kind: 'hex', el: 'wind', by: 'jo', byName: 'Jo' },
    ]);
    expect(after.charms).toBeUndefined(); // the ward (T+15h) is long past by T+25h: nothing left
    const fresh = { charms: { hex: { el: 'wind', by: 'jo', at: T, until: T + 12 * HOUR, left: 1 } } };
    pruneCharms(fresh, T + 13 * HOUR);
    expect(fresh.charms).toEqual({ wardUntil: T + 15 * HOUR });
  });

  test('none with the bag switched off; no hex while hexes are off (blessings carry on)', () => {
    charm('sam', 'bless', 'fire');
    charm('sam', 'hex', 'wind');
    expect(Object.keys(activeCharms(user('sam'), T, { ...SETTINGS, magic: false }))).toEqual([]);
    expect(Object.keys(activeCharms(user('sam'), T, { ...SETTINGS, hexes: false }))).toEqual(['bless']);
  });

  test('the element autocomplete: six choices, ≤100 characters, a key each — and what each would do to THIS member', () => {
    charm('alex', 'hex', 'fire');
    const plain = elementChoices({ kind: 'bless' }, T);
    expect(plain.map(c => c.value)).toEqual(ELEMENT_KEYS);
    expect(plain.find(c => c.value === 'fire').name).toBe(`🔥 Fire · Fired Up (${CHI.cost.bless} Chi)`);
    const forAlex = elementChoices({ kind: 'bless', target: user('alex'), targetName: 'Alex' }, T);
    expect(forAlex.find(c => c.value === 'rain').name).toBe('🌧️ Rain · lifts Alex\'s 🔥 Scorched');
    expect(forAlex.find(c => c.value === 'fire').name).toBe('🔥 Fire · lifts Alex\'s 🔥 Scorched');
    expect(forAlex.find(c => c.value === 'wind').name).toBe(`💨 Wind · Tailwind (${CHI.cost.bless} Chi)`);
    charm('alex', 'bless', 'smoke');
    const hexes = elementChoices({ kind: 'hex', target: user('alex'), targetName: 'A'.repeat(80) }, T);
    expect(hexes.find(c => c.value === 'wind').name).toBe(`💨 Wind · spoils ${'A'.repeat(32)}'s 🌫️ Smoke Screen`);
    for (const c of [...plain, ...forAlex, ...hexes]) expect(c.name.length).toBeLessThanOrEqual(100);
    // Typed: narrowed, and nothing matching shows all six
    expect(elementChoices({ kind: 'bless', typed: 'fir' }, T).map(c => c.value)).toEqual(['fire']);
    expect(elementChoices({ kind: 'bless', typed: 'zzz' }, T)).toHaveLength(6);
  });

  test('a typed element resolves: the key, the name, a pasted label, or the charm\'s own name', () => {
    expect(['fire', 'Fire', '🔥 Fire', '🔥 Fire · Fired Up (5 Chi)'].map(v => elementOf(v, 'bless'))).toEqual(['fire', 'fire', 'fire', 'fire']);
    expect(elementOf('Tailwind', 'bless')).toBe('wind');
    expect(elementOf('ill wind', 'hex')).toBe('wind');
    expect(elementOf('Lost in the Smoke', 'hex')).toBe('smoke');
    expect([elementOf('water', 'bless'), elementOf('', 'bless'), elementOf('__proto__', 'hex')]).toEqual([null, null, null]);
  });
});

// ── the blessings ───────────────────────────────────────────────────────

describe('blessings: what each does, and its caster\'s pay', () => {
  test('💨 Tailwind: the next play\'s bad lines are out; it pays only when the same number would have drawn a bad line', () => {
    charm('sam', 'bless', 'wind');
    const r = rOn(PIE, 'miss');
    let calls = 0;
    const { drawn, result, lines } = draw('foodfight', 'throw', PIE, { random: () => { calls += 1; return r; } });
    // One random number, as without it: stubbed suites still land
    expect(calls).toBe(1);
    expect(drawn.outcome).toBe('hit');
    expect(drawn.mods).toMatchObject({ charms: ['bless:wind'], tailwindPaid: true, counterfactual: { wind: 'miss' } });
    expect([result.actorDelta, result.targetDelta]).toEqual([3, -1]);
    // Booked against the miss it would have been: +4 for Sam, −2 for Alex
    expect(result.charms).toEqual([{ key: 'bless:wind', kind: 'bless', el: 'wind', who: 'actor', delta: 4, targetDelta: -2 }]);
    expect(user('sam').charms).toBeUndefined();
    expect(paidTo('kim', 'foodfight')).toEqual({ ...PAY, paid: 1 });
    expect(user('kim').lifetime.magic).toEqual({ paid: 1, paidElements: ['wind'] });
    expect(lines).toEqual([
      '-# 💨 Tailwind: Sam\'s play could only go well.',
      `-# ✨ Kim's 💨 Tailwind paid off: Kim ${PAY_TEXT}.`,
    ]);
  });

  test('💨 Tailwind on a number that drew a hit anyway: used, unpaid', () => {
    charm('sam', 'bless', 'wind');
    const { result } = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'hit') });
    expect(result.charms).toEqual([{ key: 'bless:wind', kind: 'bless', el: 'wind', who: 'actor', delta: 0, targetDelta: 0 }]);
    expect(result.casterPay).toEqual([]);
    expect(user('sam').charms).toBeUndefined();
    expect(user('kim')).toBeUndefined();
  });

  test('🔥 Fired Up: +1 on each good one of the next 3 acting plays; its caster paid once, on the first +1', () => {
    charm('sam', 'bless', 'fire');
    const plays = ['hit', 'miss', 'hit', 'hit'].map((o, i) => play(o, { now: T + i * MIN }));
    expect(plays.map(p => p.bonus)).toEqual([1, 0, 1, 0]);
    expect(plays.map(p => p.charms.map(c => [c.points, c.left, !!c.quiet]))).toEqual([[[1, 2, false]], [[0, 1, true]], [[1, 0, false]], []]);
    expect(plays.map(p => p.casterPay.length)).toEqual([1, 0, 0, 0]);
    expect(bonus('sam', 'foodfight')).toBe(2);
    expect(paidTo('kim', 'foodfight')).toEqual({ ...PAY, paid: 1 });
    expect(extraLines(plays[0], { actor: 'Sam' })).toEqual(['-# 🔥 Fired Up: Sam +1 (2 more).', `-# ✨ Kim's 🔥 Fired Up paid off: Kim ${PAY_TEXT}.`]);
    expect(extraLines(plays[2], { actor: 'Sam' })).toEqual(['-# 🔥 Fired Up: Sam +1 (the last one).']);
    expect(user('sam').charms).toBeUndefined();
  });

  test('⚡ Lightning Strike: the next GOOD acting play scores ×2 (a bad one leaves it), and pays when the points changed', () => {
    charm('sam', 'bless', 'lightning');
    const miss = play('miss');
    expect([miss.actorDelta, miss.charms]).toEqual([-1, []]);
    const hit = play('hit', { now: T + MIN });
    expect([hit.actorDelta, hit.targetDelta]).toEqual([6, null]);
    expect(hit.charms).toEqual([{ key: 'bless:lightning', kind: 'bless', el: 'lightning', who: 'actor', delta: 3 }]);
    expect(paidTo('kim', 'foodfight')).toEqual({ ...PAY, paid: 1 });
    expect(extraLines(hit, { actor: 'Sam' })[0]).toBe('-# ⚡ Lightning Strike: Sam\'s points ×2.');
    expect(user('sam').charms).toBeUndefined();
  });

  test('⚡ Lightning Strike × Director\'s Cut is capped at ×3; a Strike the cap leaves nothing to do is used, unpaid', () => {
    charm('sam', 'bless', 'lightning');
    status('sam', 'dcut');
    const both = play('hit');
    expect(both.actorDelta).toBe(9); // 3 × 2 × 2, capped at ×3
    expect(both.charms[0].delta).toBe(3); // 9 against the 6 Director's Cut alone gives
    expect(both.casterPay).toHaveLength(1);
    // A Golden Pie (×2) and Director's Cut already reach ×3 on a hit: the Strike adds nothing
    deleteScores(GUILD);
    charm('sam', 'bless', 'lightning');
    status('sam', 'dcut');
    seed('sam', (u) => { u.glovebox = { gpie: 1 }; });
    const pie = draw('foodfight', 'throw', PIE, { target: ROLE, item: 'gpie', random: () => rOn(PIE, 'hit', { miss: 0, backfire: 0 }) });
    expect(pie.result.actorDelta).toBe(9);
    expect(pie.result.charms).toEqual([{ key: 'bless:lightning', kind: 'bless', el: 'lightning', who: 'actor', delta: 0 }]);
    expect(pie.result.casterPay).toEqual([]);
    expect(user('sam').charms).toBeUndefined();
  });

  test('🌩️ Thunderous Applause: the next good help at a member doubles THEIR points (capped ×2: a Happy Hour on top adds nothing, and doesn\'t pay)', () => {
    charm('sam', 'bless', 'thunder');
    // A throw isn't help, and a feed at a role helps no member: it waits
    expect(play('hit', { target: ALEX }).charms).toEqual([]);
    expect(play('tasty', { now: T + MIN }).charms).toEqual([]);
    const fed = play('tasty', { target: ALEX, now: T + 2 * MIN });
    expect([fed.actorDelta, fed.targetDelta]).toEqual([1, 4]);
    expect(fed.charms).toEqual([{ key: 'bless:thunder', kind: 'bless', el: 'thunder', who: 'actor', targetDelta: 2 }]);
    expect(fed.casterPay).toHaveLength(1);
    expect(extraLines(fed, { actor: 'Sam', target: 'Alex' })[0]).toBe('-# 🌩️ Thunderous Applause: the help lands double. Take a bow, Sam.');

    deleteScores(GUILD);
    charm('sam', 'bless', 'thunder');
    const happyHour = [{ kind: 'happyhour', name: 'Happy Hour', emoji: '🍻', tag: '🍻', endsAt: T + HOUR, mods: { points: [{ game: 'foodfight', outcome: 'tasty', mult: 2 }] } }];
    const capped = play('tasty', { target: ALEX, happenings: happyHour });
    expect(capped.targetDelta).toBe(4); // 2 × 2 × 2, capped at ×2
    expect(capped.charms).toEqual([{ key: 'bless:thunder', kind: 'bless', el: 'thunder', who: 'actor', targetDelta: 0 }]);
    expect(capped.casterPay).toEqual([]);
    expect(user('sam').charms).toBeUndefined();
  });

  test('🌧️ Cleansing Rain: the next bad play with a streak to lose keeps it (Second Wind waits); one with no streak leaves it', () => {
    charm('sam', 'bless', 'rain');
    status('sam', 'secondwind');
    expect(play('miss').charms).toEqual([]); // no streak to keep
    play('hit', { now: T + MIN });
    play('hit', { now: T + 2 * MIN });
    const kept = play('miss', { now: T + 3 * MIN });
    expect(kept.streak).toBe(2);
    expect(kept.charms).toEqual([{ key: 'bless:rain', kind: 'bless', el: 'rain', who: 'actor' }]);
    expect(kept.statuses).toEqual([]);
    expect(user('sam').effects.secondwind).toBeDefined();
    expect(kept.casterPay).toHaveLength(1);
    expect(extraLines(kept, { actor: 'Sam' })[0]).toBe('-# 🌧️ Cleansing Rain: Sam\'s streak survives.');
    // The next bad play: Second Wind's turn
    const next = play('miss', { now: T + 4 * MIN });
    expect([next.streak, next.statuses]).toEqual([2, [{ key: 'secondwind' }]]);
  });

  test('🌫️ Smoke Screen: a hit on its holder becomes a miss (redrawn from the misses), counts as their defence, and pays', () => {
    charm('alex', 'bless', 'smoke');
    const { drawn, result, lines } = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'hit') });
    expect(drawn.outcome).toBe('miss');
    expect(PIE.filter(l => l.outcome === 'miss').map(l => l.text)).toContain(drawn.line.text);
    expect(drawn.mods).toMatchObject({ defence: 'smoke', counterfactual: { smoke: 'hit' } });
    expect([result.actorDelta, result.targetDelta, result.defence]).toEqual([-1, 1, { key: 'smoke' }]);
    expect(result.charms).toEqual([{ key: 'bless:smoke', kind: 'bless', el: 'smoke', who: 'target', delta: -4, targetDelta: 2 }]);
    expect(today('alex').defences).toBe(1);
    expect(user('alex').charms).toBeUndefined();
    expect(paidTo('kim', 'foodfight')).toEqual({ ...PAY, paid: 1 });
    expect(lines.slice(0, 2)).toEqual(['-# 🌫️ Smoke Screen: the play aimed at Alex is lost in the smoke.', `-# ✨ Kim's 🌫️ Smoke Screen paid off: Kim ${PAY_TEXT}.`]);
  });

  test('🌫️ Smoke Screen: a doom becomes an escape; a harmful potion that works does no harm ([1, 0], as the Antidote)', () => {
    charm('alex', 'bless', 'smoke');
    const doom = draw('doom', 'fate', ZOMBIE, { random: () => rOn(ZOMBIE, 'doomed') });
    expect([doom.drawn.outcome, doom.result.actorDelta, doom.result.targetDelta]).toEqual(['escaped', -1, 2]);
    charm('alex', 'bless', 'smoke');
    const potion = draw('potion', 'give', POISON, { effect: 'harmful', random: () => rOn(POISON, 'worked'), now: T + MIN });
    expect([potion.drawn.outcome, potion.result.outcome]).toEqual(['worked', 'hurt']);
    expect([potion.result.actorDelta, potion.result.targetDelta]).toEqual(MAGIC.smokePotionPoints);
    expect(potion.result.charms[0]).toMatchObject({ key: 'bless:smoke', delta: MAGIC.smokePotionPoints[0] - POINTS.potion.hurt[0], targetDelta: MAGIC.smokePotionPoints[1] - POINTS.potion.hurt[1] });
    // …and, stopped, earns no Chi, as the stopped doom above didn't (Doug, 2026-11-07)
    expect([potion.result.chi, user('sam').chi]).toEqual([null, undefined]);
    // A helpful potion, a feed, a miss: nothing harmful, nothing lost
    charm('alex', 'bless', 'smoke');
    const feed = draw('foodfight', 'feed', FEED, { random: () => rOn(FEED, 'tasty'), now: T + 2 * MIN });
    expect([feed.drawn.outcome, feed.result.defence]).toEqual(['tasty', null]);
    expect(user('alex').charms.bless.left).toBe(1);
  });

  test('🌫️ Smoke Screen fires last: after the shield, Garlic and the Antidote; never against a Cursed VHS; inside 3 defences a day', () => {
    charm('alex', 'bless', 'smoke');
    // The shield blocks first
    mutateScores(GUILD, (d) => { d.shields.alex = T + HOUR; });
    expect(draw('doom', 'fate', ZOMBIE, { blockedLines: BLOCKED, random: () => rOn(ZOMBIE, 'doomed') }).drawn.mods).toEqual({ defence: 'shield' });
    // Garlic next
    seed('alex', (u) => { u.glovebox = { garlic: 1, antid: 1 }; });
    expect(draw('doom', 'fate', ZOMBIE, { random: () => rOn(ZOMBIE, 'doomed'), now: T + MIN }).drawn.mods.defence).toBe('garlic');
    // The Antidote, for a harmful potion
    expect(draw('potion', 'give', POISON, { effect: 'harmful', random: () => rOn(POISON, 'worked'), now: T + 2 * MIN }).drawn.mods.defence).toBe('antid');
    // Three defences fired today: the Smoke Screen can't be a fourth, and waits
    expect(today('alex').defences).toBe(DAILY.defences);
    expect(user('alex').charms.bless).toMatchObject({ el: 'smoke', left: 1 });
    const fourth = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'hit'), now: T + 3 * MIN });
    expect([fourth.drawn.outcome, fourth.result.defence]).toEqual(['hit', null]);
    // A Cursed VHS cuts through it, another day (a fresh Smoke Screen: the first ran out)
    charm('alex', 'bless', 'smoke', { at: T + DAY });
    seed('sam', (u) => { u.glovebox = { vhs: 1 }; });
    const vhs = draw('doom', 'fate', ZOMBIE, { item: 'vhs', random: () => rOn(ZOMBIE, 'doomed', { backfired: 0 }), now: T + DAY });
    expect([vhs.drawn.outcome, vhs.result.defence, user('alex').charms.bless.left]).toEqual(['doomed', null, 1]);
  });

  test('a caster whose bag is full is still paid off — the line says what fitted, never "+undefined"', () => {
    seed('kim', (u) => { u.chi = { n: CHI.bag }; });
    charm('sam', 'bless', 'fire');
    const r = play('hit');
    const fits = MAGIC.casterPayIn === 'chi' ? '+0 Chi' : `+${MAGIC.casterPay}`;
    expect(extraLines(r, { actor: 'Sam' })).toContain(`-# ✨ Kim's 🔥 Fired Up paid off: Kim ${fits}.`);
    expect([user('kim').chi.n, user('kim').lifetime.magic.paid]).toEqual([CHI.bag, 1]);
  });

  test('🌫️ a Smoke Screen set off by its own caster still fires, but pays nobody', () => {
    charm('alex', 'bless', 'smoke', { by: 'sam' });
    const { result } = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'hit') });
    expect([result.outcome, result.defence]).toEqual(['miss', { key: 'smoke' }]);
    expect(result.casterPay).toEqual([]);
    expect(user('sam').lifetime.magic).toBeUndefined();
  });
});

// ── the hexes ───────────────────────────────────────────────────────────

describe('hexes: what each does', () => {
  test('💨 Ill Wind: the next play is drawn twice, the worse kept; a held Jinx waits', () => {
    charm('sam', 'hex', 'wind');
    status('sam', 'jinxed');
    const randoms = [rOn(PIE, 'hit'), rOn(PIE, 'miss')];
    const { drawn, result, lines } = draw('foodfight', 'throw', PIE, { random: () => randoms.shift() });
    expect(drawn.outcome).toBe('miss');
    // Booked against what the waiting Jinx would have done anyway (two draws, the worse): the same miss
    expect(drawn.mods).toEqual({ charms: ['hex:wind'], counterfactual: { wind: 'miss' } });
    expect(result.charms).toEqual([{ key: 'hex:wind', kind: 'hex', el: 'wind', who: 'actor', delta: 0, targetDelta: 0 }]);
    expect(user('sam').effects.jinxed).toBeDefined();
    expect(lines[0]).toBe('-# 💨 Ill Wind: two draws, and Sam got the worse one.');
    expect(user('sam').charms).toEqual({ wardUntil: T + MAGIC.wardHours * HOUR });
  });

  test('💨 Ill Wind alone, booked against the first draw it overrode', () => {
    charm('sam', 'hex', 'wind');
    const randoms = [rOn(PIE, 'hit'), rOn(PIE, 'backfire')];
    const { result } = draw('foodfight', 'throw', PIE, { random: () => randoms.shift() });
    expect(result.outcome).toBe('backfire');
    expect(result.charms[0]).toMatchObject({ delta: POINTS.foodfight.backfire[0] - POINTS.foodfight.hit[0], targetDelta: POINTS.foodfight.backfire[1] - POINTS.foodfight.hit[1] });
  });

  test('🔥 Scorched: −1 on each of the next 3 acting plays, a twist loss — inside the day\'s 8 and the month\'s floor, with Mosquito Swarm', () => {
    seed('sam', (u) => { u.games.doom = { all: { points: 3, plays: 1, scoredPlays: 1, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 }, 'm2026-11': { points: 3, plays: 1, scoredPlays: 1, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 } }; });
    charm('sam', 'hex', 'fire');
    status('sam', 'mosquito', 3);
    mutateScores(GUILD, (d) => { d.daily.sam = { day: '2026-11-02', plays: {}, twistLoss: TWIST_RULES.dailyLoss - 3 }; });
    const a = play('hit');
    // Mosquito −1, Scorched −1: 3 of the 8 were left
    expect([a.bonus, a.statuses, a.charms]).toEqual([-2, [{ key: 'mosquito', points: -1, left: 2 }], [{ key: 'hex:fire', kind: 'hex', el: 'fire', who: 'actor', points: -1, left: 2, quiet: false }]]);
    const b = play('hit', { now: T + MIN });
    // One left for the day: the mosquito takes it, the fire has nothing to take
    expect([b.bonus, b.charms[0].points, b.charms[0].quiet]).toEqual([-1, -0, true]);
    expect(today('sam').twistLoss).toBe(TWIST_RULES.dailyLoss);
    expect(extraLines(a, { actor: 'Sam' })).toEqual(['-# 🦟 Mosquito Swarm: Sam −1 (2 more).', '-# 🔥 Scorched: Sam −1 (2 more).']);
    // The month's floor: a newcomer at 0 loses nothing to it
    deleteScores(GUILD);
    charm('sam', 'hex', 'fire');
    const floor = play('miss');
    expect([floor.actorDelta, floor.bonus, floor.charms[0].points]).toEqual([-1, 0, -0]);
  });

  test('⚡ Static: gains halved on the next 2 acting plays (a loss isn\'t); a held Bitten waits, untouched', () => {
    charm('sam', 'hex', 'lightning');
    status('sam', 'bitten', 3);
    const hit = play('hit');
    expect(hit.actorDelta).toBe(1); // 3 → 1, once, not 3 → 1 → 0
    expect(hit.statuses).toEqual([]);
    expect(hit.charms).toEqual([{ key: 'hex:lightning', kind: 'hex', el: 'lightning', who: 'actor', delta: -2, left: 1, quiet: false }]);
    expect(user('sam').effects.bitten.playsLeft).toBe(3);
    const miss = play('miss', { now: T + MIN });
    expect([miss.actorDelta, miss.charms[0].quiet, miss.charms[0].left]).toEqual([-1, true, 0]);
    // Static's gone: Bitten's turn
    const after = play('hit', { now: T + 2 * MIN });
    expect([after.actorDelta, after.statuses[0]]).toEqual([1, { key: 'bitten', before: 3, after: 1, left: 2 }]);
    expect(extraLines(hit, { actor: 'Sam' })).toEqual(['-# ⚡ Static: Sam\'s gains are halved (1 more).']);
  });

  test('🌩️ Deafened: the next 5 plays that would earn Chi earn none; at the day\'s cap it isn\'t used', () => {
    charm('sam', 'hex', 'thunder');
    const plays = ['hit', 'miss', 'hit'].map((o, i) => play(o, { now: T + i * MIN }));
    expect(plays.map(p => p.chi?.deafened ?? null)).toEqual([true, null, true]);
    expect(user('sam').charms.hex.left).toBe(3);
    expect(user('sam').chi).toBeUndefined();
    expect(extraLines(plays[0], { actor: 'Sam' })).toEqual(['-# 🌩️ Deafened: no Chi for Sam this time (4 more).']);
    // At the day's cap there's no Chi to block: Deafened waits
    mutateScores(GUILD, (d) => { d.daily.sam.chi = CHI.perDay; });
    expect([play('hit', { now: T + 3 * MIN }).chi, user('sam').charms.hex.left]).toEqual([null, 3]);
  });

  test('🌧️ Rained Out: the next 2 GOOD acting plays don\'t grow the streak (the titles\' streak either); a bad one still ends it', () => {
    play('hit');
    charm('sam', 'hex', 'rain');
    const held = [play('hit', { now: T + MIN }), play('hit', { now: T + 2 * MIN })];
    expect(held.map(p => p.streak)).toEqual([1, 1]);
    expect(user('sam').lifetime.streak.foodfight).toBe(1);
    expect(held.map(p => p.charms[0].left)).toEqual([1, 0]);
    expect(play('hit', { now: T + 3 * MIN }).streak).toBe(2);
    expect(extraLines(held[0], { actor: 'Sam' })).toEqual(['-# 🌧️ Rained Out: Sam\'s streak holds, but doesn\'t grow (1 more).']);
  });

  test('🌫️ Lost in the Smoke: 2 plays aimed at a member score only the player — no target points, no defence; a role isn\'t aimed', () => {
    charm('sam', 'hex', 'smoke');
    charm('alex', 'bless', 'smoke');
    const role = draw('foodfight', 'throw', PIE, { target: ROLE, random: () => rOn(PIE, 'hit') });
    expect(role.result.charms).toEqual([]);
    const lost = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'hit'), now: T + MIN });
    expect(lost.drawn.mods.charms).toEqual(['hex:smoke']);
    expect([lost.result.lost, lost.result.targetId, lost.result.targetDelta, lost.result.defence, lost.result.actorDelta]).toEqual([true, null, null, null, 3]);
    expect(pts('alex', 'foodfight')).toBe(0);
    // Alex's own Smoke Screen never saw it
    expect(user('alex').charms.bless.left).toBe(1);
    expect(lost.lines[0]).toBe('-# 🌫️ Lost in the Smoke: Sam\'s play loses its target (1 more).');
    // Before the shield: a lost doom isn't "blocked", and the shield stays up
    mutateScores(GUILD, (d) => { d.shields.alex = T + HOUR; });
    const doom = draw('doom', 'fate', ZOMBIE, { blockedLines: BLOCKED, random: () => rOn(ZOMBIE, 'doomed'), now: T + 2 * MIN });
    expect([doom.result.outcome, doom.result.lost]).toEqual(['doomed', true]);
    expect(loadScores(GUILD).shields.alex).toBe(T + HOUR);
    expect(user('sam').charms).toEqual({ wardUntil: T + 2 * MIN + MAGIC.wardHours * HOUR });
  });
});

// ── never on ────────────────────────────────────────────────────────────

describe('a charm acts only on a scored play where something happened, never a siege attack', () => {
  test('a play past the daily cap neither uses a charm nor earns Chi', () => {
    charm('sam', 'bless', 'fire');
    const capped = play('hit', { settings: { ...SETTINGS, dailyScoredPlays: 0 } });
    expect([capped.scored, capped.charms, capped.chi, capped.bonus]).toEqual([false, [], null, 0]);
    expect(user('sam').charms.bless.left).toBe(3);
  });

  test('…nor shapes its draw: Tailwind leaves a capped throw\'s miss a miss, and waits', () => {
    charm('sam', 'bless', 'wind');
    const capped = draw('foodfight', 'throw', PIE, { settings: { ...SETTINGS, dailyScoredPlays: 0 }, random: () => rOn(PIE, 'miss') });
    expect([capped.drawn.outcome, capped.drawn.mods, capped.result.charms]).toEqual(['miss', {}, []]);
    expect(user('sam').charms.bless.left).toBe(1);
  });

  test('a siege attack: no charm acts (Fired Up waits), though it earns its Chi, pot or not', () => {
    charm('sam', 'bless', 'fire');
    charm('sam', 'hex', 'thunder');
    const attack = recordPlay(GUILD, { game: 'siege', action: 'doom', actor: SAM, target: { kind: 'monster', pingUserIds: [], name: 'The Blob' }, outcome: 'smite', settings: { ...SETTINGS, twists: false }, pot: true }, T);
    expect([attack.actorDelta, attack.bonus, attack.charms]).toEqual([0, 0, []]);
    expect(attack.chi).toMatchObject({ earned: CHI.earn, deafened: false });
    expect([user('sam').charms.bless.left, user('sam').charms.hex.left]).toEqual([3, 5]);
  });

  test('a doom a rescue\'s shield blocked: nothing happened, so nothing is used — though the play is scored', () => {
    charm('sam', 'bless', 'fire');
    charm('sam', 'hex', 'fire');
    mutateScores(GUILD, (d) => { d.shields.alex = T + HOUR; });
    const { result } = draw('doom', 'fate', ZOMBIE, { blockedLines: BLOCKED, random: () => rOn(ZOMBIE, 'doomed') });
    expect([result.outcome, result.scored, result.charms, result.bonus]).toEqual(['blocked', true, [], 0]);
    expect([user('sam').charms.bless.left, user('sam').charms.hex.left]).toEqual([3, 3]);
  });
});

// ── the interplay with the twists' statuses ─────────────────────────────

describe('with the twists\' statuses (design §3.3)', () => {
  test('Tailwind and a Lucky Break: Tailwind does the job, the Lucky Break waits for the next play', () => {
    charm('sam', 'bless', 'wind');
    status('sam', 'luckybreak');
    const first = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'miss') });
    expect([first.drawn.outcome, first.result.statuses]).toEqual(['hit', []]);
    expect(user('sam').effects.luckybreak).toBeDefined();
    // Without Tailwind the Lucky Break would have made it a hit anyway: Tailwind changed nothing, and isn't paid
    expect(first.result.casterPay).toEqual([]);
    const second = draw('foodfight', 'throw', PIE, { random: () => rOn(PIE, 'miss'), now: T + MIN });
    expect([second.drawn.outcome, second.result.statuses]).toEqual(['hit', [{ key: 'luckybreak' }]]);
  });

  test('Tailwind and a Jinx: both act — two draws from the good lines, the worse kept', () => {
    charm('sam', 'bless', 'wind');
    status('sam', 'jinxed');
    const randoms = [rOn(PIE, 'miss'), rOn(PIE, 'backfire')];
    const { drawn, result } = draw('foodfight', 'throw', PIE, { random: () => randoms.shift() });
    expect(drawn.outcome).toBe('hit');
    expect(drawn.mods).toMatchObject({ charms: ['bless:wind'], statuses: ['jinxed'], tailwindPaid: true });
    expect(result.statuses).toEqual([{ key: 'jinxed' }]);
    expect(user('sam').effects).toBeUndefined();
  });

  test('Fired Up and a Free Refill: +2 on a good play', () => {
    charm('sam', 'bless', 'fire');
    status('sam', 'refill', 3);
    const r = play('hit');
    expect(r.bonus).toBe(2);
    expect(extraLines(r, { actor: 'Sam' }).slice(0, 2)).toEqual(['-# 🍿 Free Refill: Sam +1 (2 more).', '-# 🔥 Fired Up: Sam +1 (2 more).']);
  });
});

// ── pre-wired for R6's Tour Bus ─────────────────────────────────────────

describe('a happening\'s chiMult and castDiscount (pre-wired: none uses them before R6)', () => {
  const bus = [{ kind: 'tourBus', name: 'Egg Shen\'s Tour Bus', emoji: '🚌', tag: '🚌', endsAt: T + DAY, mods: { chiMult: 2, castDiscount: 1 } }];

  test('chiMult: each good play earns ×, and the day\'s cap is × too; without one, ×1', () => {
    const plays = [0, 1, 2, 3, 4].map(i => play('hit', { now: T + i * MIN, happenings: bus }));
    expect(plays.map(p => p.chi?.earned ?? 0)).toEqual([2, 2, 2, 2, 0]);
    expect([user('sam').chi.n, today('sam').chi, plays[3].chi.capped]).toEqual([2 * CHI.perDay, 2 * CHI.perDay, true]);
    expect(play('hit', { now: T + DAY, happenings: [] }).chi.earned).toBe(CHI.earn);
  });

  test('castDiscount: every cast costs that much less (never below 0); without one, full price', () => {
    regular('alex');
    seed('kim', (u) => { u.chi = { n: 20 }; });
    const spec = { caster: { id: 'kim', name: 'Kim' }, target: { id: 'alex', name: 'Alex' }, kind: 'bless', el: 'fire', settings: SETTINGS };
    expect(castCharm(GUILD, { ...spec, happenings: bus }, T)).toMatchObject({ cost: CHI.cost.bless - 1, chiAfter: 20 - (CHI.cost.bless - 1) });
    expect(castCharm(GUILD, { ...spec, kind: 'hex', el: 'wind', happenings: [] }, T + MIN)).toMatchObject({ cost: CHI.cost.hex });
  });
});

// ── casting ─────────────────────────────────────────────────────────────

const castBy = (caster, target, kind, el, { settings = SETTINGS, fighting = false, now = T } = {}) =>
  castCharm(GUILD, { caster: { id: caster, name: caster[0].toUpperCase() + caster.slice(1) }, target: { id: target, name: target[0].toUpperCase() + target.slice(1) }, kind, el, settings, fighting }, now);

describe('casting: cancels, the wash, and where a cast-time payoff goes', () => {
  beforeEach(() => {
    seed('kim', (u) => { u.chi = { n: 20 }; });
    regular('alex');
  });

  test('a blessing lands: its Chi, one of 2 casts, logged; the charm stored with its uses', () => {
    const done = castBy('kim', 'alex', 'bless', 'fire');
    expect(done).toMatchObject({ outcome: 'landed', charm: '🔥 Fired Up', chiBefore: 20, chiAfter: 20 - CHI.cost.bless, castsLeft: 1, pay: null });
    expect(user('alex').charms.bless).toEqual({ el: 'fire', by: 'kim', byName: 'Kim', at: T, until: T + MAGIC.blessHours * HOUR, left: 3, paid: false });
    expect(today('kim')).toMatchObject({ casts: 1 });
    expect(user('kim').castLog).toEqual([{ to: 'alex', kind: 'bless', el: 'fire', at: T }]);
  });

  test('a hex lands: its Chi, the day\'s hex, one received', () => {
    const done = castBy('kim', 'alex', 'hex', 'smoke');
    expect(done).toMatchObject({ outcome: 'landed', charm: '🌫️ Lost in the Smoke', chiAfter: 20 - CHI.cost.hex });
    expect(user('alex').charms.hex).toEqual({ el: 'smoke', by: 'kim', byName: 'Kim', at: T, until: T + MAGIC.hexHours * HOUR, left: 2 });
    expect([today('kim').casts, today('kim').hexes, today('alex').hexRecv]).toEqual([1, 1, 1]);
  });

  test('a blessing of the same element LIFTS a hex: both gone, a ward, and its caster paid in their home game', () => {
    charm('alex', 'hex', 'fire');
    // Kim plays doom most: that's home
    seed('kim', (u) => { u.games = { doom: { all: { points: 0, plays: 9, scoredPlays: 9, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 } }, potion: { all: { points: 0, plays: 2, scoredPlays: 2, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0 } } }; });
    expect(homeGame(user('kim'))).toBe('doom');
    const done = castBy('kim', 'alex', 'bless', 'fire');
    expect(done).toMatchObject({ outcome: 'lifted', cancelled: '🔥 Scorched', pay: { userId: 'kim', name: 'Kim', el: 'fire', ...(PAY.points ? { points: PAY.points } : { chi: PAY.chi }) } });
    expect(user('alex').charms).toEqual({ wardUntil: T + MAGIC.wardHours * HOUR });
    expect(paidTo('kim', 'doom')).toEqual({ points: PAY.points, chi: 20 - CHI.cost.bless + PAY.chi, paid: 1 });
  });

  test('…and so does the opposite element (Rain douses Fire); an unrelated one lands beside it', () => {
    charm('alex', 'hex', 'fire');
    expect(castBy('kim', 'alex', 'bless', 'rain').outcome).toBe('lifted');
    charm('alex', 'hex', 'fire');
    seed('alex', (u) => { delete u.charms.wardUntil; });
    expect(castBy('kim', 'alex', 'bless', 'wind', { now: T + MIN }).outcome).toBe('landed');
    expect(Object.keys(user('alex').charms).sort()).toEqual(['bless', 'hex']);
  });

  test('a hex of the same or opposite element SPOILS a blessing: both gone, a ward, counted — and never paid', () => {
    charm('alex', 'bless', 'smoke');
    const done = castBy('kim', 'alex', 'hex', 'wind');
    expect(done).toMatchObject({ outcome: 'spoiled', cancelled: '🌫️ Smoke Screen', pay: null });
    expect(user('alex').charms).toEqual({ wardUntil: T + MAGIC.wardHours * HOUR });
    expect([today('alex').hexRecv, user('kim').lifetime?.magic]).toEqual([1, undefined]);
  });

  test('🌧️ Cleansing Rain washes Bitten, Jinxed and Mosquito Swarm off at the cast — and that pays; nothing to wash, nothing paid', () => {
    status('alex', 'bitten', 3);
    status('alex', 'mosquito', 3);
    status('alex', 'luckybreak');
    const done = castBy('kim', 'alex', 'bless', 'rain');
    expect(done).toMatchObject({ outcome: 'landed', washed: ['bitten', 'mosquito'], washedText: '🧛 Bitten and 🦟 Mosquito Swarm' });
    expect(Object.keys(user('alex').effects)).toEqual(['luckybreak']);
    expect(user('alex').charms.bless).toMatchObject({ el: 'rain', paid: true, left: 1 });
    expect(done.pay).toMatchObject({ userId: 'kim', el: 'rain' });
    // Its later keep pays nothing more: it already paid
    play('hit', { actor: { id: 'alex', name: 'Alex' } });
    const kept = play('miss', { actor: { id: 'alex', name: 'Alex' }, now: T + MIN });
    expect([kept.streak, kept.casterPay]).toEqual([1, []]);
    deleteScores(GUILD);
    seed('kim', (u) => { u.chi = { n: 20 }; });
    expect(castBy('kim', 'alex', 'bless', 'rain')).toMatchObject({ washed: [], pay: null });
  });
});

describe('castProblem: every refusal, in the brief\'s order, each costing nothing', () => {
  const base = (over = {}) => ({
    kind: 'hex', el: 'fire', casterId: 'kim', targetId: 'alex', targetBot: false,
    caster: { chi: { n: 20 } }, target: { nights: { recent: [] } }, casterDay: {}, targetDay: {},
    targetNights: 1, fighting: false, settings: SETTINGS, cost: CHI.cost.hex, ...over,
  });
  const why = (over) => castProblem(base(over), T)?.reason ?? null;

  test('a hex: self, bot, hexes off, peace either side, inactive, fighting, already hexed, warded, 2 received, the pair, the casts, the hex, the Chi', () => {
    expect(why()).toBeNull();
    const peace = { peace: { on: true, since: T } };
    const hexed = { charms: { hex: { el: 'wind', by: 'jo', at: T, until: T + HOUR, left: 1 } } };
    const warded = { charms: { wardUntil: T + HOUR } };
    const log = { castLog: [{ to: 'alex', kind: 'hex', el: 'fire', at: T - 71 * HOUR }], chi: { n: 20 } };
    // Each rung makes one reason true. With its own rung and every one
    // after it true at once, the earliest must win: the order holds.
    const ladder = [
      ['self', (c) => { c.targetId = 'kim'; }],
      ['bot', (c) => { c.targetBot = true; }],
      ['hexesOff', (c) => { c.settings = { ...SETTINGS, hexes: false }; }],
      ['peaceSelf', (c) => { c.caster.charms.peace = { on: true, since: T }; }],
      ['peaceTarget', (c) => { c.target.charms.peace = { on: true, since: T }; }],
      ['inactive', (c) => { c.targetNights = 0; }],
      ['fighting', (c) => { c.fighting = true; }],
      ['alreadyHexed', (c) => { c.target.charms.hex = { el: 'wind', by: 'jo', at: T, until: T + HOUR, left: 1 }; }],
      ['warded', (c) => { c.target.charms.wardUntil = T + HOUR; }],
      ['receivedLimit', (c) => { c.targetDay.hexRecv = MAGIC.hexesReceivedPerDay; }],
      ['pairLimit', (c) => { c.caster.castLog = [{ to: 'alex', kind: 'hex', el: 'fire', at: T - 71 * HOUR }]; }],
      ['castLimit', (c) => { c.casterDay.casts = MAGIC.castsPerDay; }],
      ['hexLimit', (c) => { c.casterDay.hexes = MAGIC.hexesPerDay; }],
      ['noChi', (c) => { c.caster.chi = { n: CHI.cost.hex - 1 }; }],
    ];
    for (let i = 0; i < ladder.length; i++) {
      const c = base({ caster: { chi: { n: 20 }, charms: {} }, target: { charms: {} }, casterDay: {}, targetDay: {} });
      for (const [, make] of ladder.slice(i)) make(c);
      expect([ladder[i][0], castProblem(c, T)?.reason]).toEqual([ladder[i][0], ladder[i][0]]);
    }
    // castLimit before hexLimit only matters with both: alone, each refuses
    expect(why({ casterDay: { hexes: MAGIC.hexesPerDay } })).toBe('hexLimit');
    expect(peace.peace.on && hexed.charms.hex.left).toBe(1);
    expect(castProblem(base({ target: warded }), T)).toEqual({ reason: 'warded', when: T + HOUR });
    expect(castProblem(base({ caster: log }), T)).toEqual({ reason: 'pairLimit', when: T + HOUR });
    expect(castProblem(base({ caster: { ...log, castLog: [{ to: 'alex', kind: 'hex', el: 'fire', at: T - 72 * HOUR }] } }), T)).toBeNull();
    expect(castProblem(base({ caster: { chi: { n: 6 } } }), T)).toEqual({ reason: 'noChi', chi: 6, need: CHI.cost.hex });
  });

  test('a blessing: self, bot, already blessed (unless it lifts a hex), the pair limit (3 in 7 days), the casts, the Chi', () => {
    const bless = (over) => why({ kind: 'bless', cost: CHI.cost.bless, ...over });
    expect(bless()).toBeNull();
    const blessed = { charms: { bless: { el: 'wind', by: 'jo', at: T, until: T + HOUR, left: 1 } } };
    expect(bless({ target: blessed })).toBe('alreadyBlessed');
    // A Fire blessing on someone blessed AND Scorched lifts the hex: allowed
    expect(bless({ target: { charms: { ...blessed.charms, hex: { el: 'fire', by: 'jo', at: T, until: T + HOUR, left: 3 } } } })).toBeNull();
    const three = { chi: { n: 20 }, castLog: [1, 2, 3].map(d => ({ to: 'alex', kind: 'bless', el: 'fire', at: T - d * DAY })) };
    expect(castProblem(base({ kind: 'bless', cost: CHI.cost.bless, caster: three }), T)).toEqual({ reason: 'blessPair', count: 3, when: T - 3 * DAY + 7 * DAY });
    expect(bless({ caster: { ...three, castLog: three.castLog.slice(0, 2) } })).toBeNull();
    expect(bless({ casterDay: { casts: MAGIC.castsPerDay } })).toBe('castLimit');
    expect(bless({ caster: { chi: { n: CHI.cost.bless - 1 } } })).toBe('noChi');
    // Peace, inactivity, wards and hexes off never stop a blessing
    expect(bless({ target: { charms: { peace: { on: true }, wardUntil: T + HOUR } }, targetNights: 0, settings: { ...SETTINGS, hexes: false } })).toBeNull();
  });

  test('OPEN QUESTIONS 2 and 3 flip: no pair limit (blessPair null); a blessing on a fighter refused (fighterBlessing \'refuse\')', () => {
    const three = { chi: { n: 20 }, castLog: [1, 2, 3].map(d => ({ to: 'alex', kind: 'bless', el: 'fire', at: T - d * DAY })) };
    expect(why({ kind: 'bless', cost: CHI.cost.bless, caster: three, rules: { ...MAGIC, blessPair: null } })).toBeNull();
    expect(why({ kind: 'bless', cost: CHI.cost.bless, fighting: true })).toBeNull(); // the default: an ordinary blessing
    expect(why({ kind: 'bless', cost: CHI.cost.bless, fighting: true, rules: { ...MAGIC, fighterBlessing: 'refuse' } })).toBe('fighterBless');
    expect(MAGIC.fighterBlessing).toBe('ordinary');
  });

  test('castCheck reads the scores file as it is, and castCharm refuses the same way without saving a thing', () => {
    regular('alex');
    seed('kim', (u) => { u.chi = { n: 4 }; });
    const spec = { caster: { id: 'kim', name: 'Kim' }, target: { id: 'alex', name: 'Alex' }, kind: 'bless', el: 'fire', settings: SETTINGS };
    expect(castCheck(loadScores(GUILD), spec, T)).toEqual({ reason: 'noChi', chi: 4, need: CHI.cost.bless });
    const file = JSON.stringify(loadScores(GUILD));
    expect(castCharm(GUILD, spec, T)).toEqual({ error: 'noChi', reason: 'noChi', chi: 4, need: CHI.cost.bless });
    expect(JSON.stringify(loadScores(GUILD))).toBe(file);
    expect(charmLabel('hex', 'thunder')).toBe('🌩️ Deafened');
    expect(ELEMENTS.thunder.blessAbout.length).toBeGreaterThan(100); // why a choice never carries the about
  });
});

// ── 3B: the Jade Charm, its prize, the title, two twists ───────────────

/** luck() returns these in turn, then LUCK_OFF (which fires nothing) */
function luckSeq(...values) {
  const queue = [...values];
  _setLuck(() => (queue.length ? queue.shift() : LUCK_OFF));
}
/** The r that lands the twist draw on `key`, over the twists in `pool` (TWISTS order) */
function rTwist(key, pool = Object.keys(TWISTS)) {
  const keys = Object.keys(TWISTS).filter(k => pool.includes(k));
  const total = keys.reduce((n, k) => n + TWISTS[k].weight, 0);
  let before = 0;
  for (const k of keys) {
    if (k === key) return (before + TWISTS[k].weight / 2) / total;
    before += TWISTS[k].weight;
  }
  throw new Error(`${key} isn't in the pool`);
}

(BAG_3B ? describe : describe.skip)('3B: the Jade Charm, the Blessings prize, All That Kind of Thing, and two twists', () => {
  const BLESSINGS = PRIZES.find(p => p.key === 'blessings');

  test('the 12th blessing that pays off: a 🧿 Jade Charm and +3 for its caster, in the play\'s game — inside THEIR day\'s prize cap', () => {
    expect(BLESSINGS).toMatchObject({ need: MAGIC.jadeNeed, item: 'jade', points: 3, game: null });
    seed('kim', (u) => { u.progress = { blessings: BLESSINGS.need - 1 }; });
    charm('sam', 'bless', 'fire');
    const r = play('hit');
    expect(r.rewards).toEqual([{ kind: 'prize', who: 'caster', userId: 'kim', prize: 'blessings', item: 'jade', points: 3, overflow: false, name: 'Kim' }]);
    expect(user('kim').glovebox).toEqual({ jade: 1 });
    expect([user('kim').progress.blessings, bonus('kim', 'foodfight')]).toEqual([0, 3 + PAY.points]);
    expect(extraLines(r, { actor: 'Sam' })).toContain(`-# 🎁 ${BLESSINGS.need} blessings! Kim gets a 🧿 Jade Charm and +3.`);
    // Kim's two prizes today already: it waits for tomorrow at need − 1
    deleteScores(GUILD);
    seed('kim', (u) => { u.progress = { blessings: BLESSINGS.need - 1 }; });
    mutateScores(GUILD, (d) => { d.daily.kim = { day: '2026-11-02', plays: {}, prizes: DAILY.prizes }; });
    charm('sam', 'bless', 'fire');
    expect(play('hit').rewards).toEqual([{ kind: 'held', who: 'caster', userId: 'kim', prize: 'blessings', name: 'Kim' }]);
    expect([user('kim').progress.blessings, user('kim').glovebox]).toEqual([BLESSINGS.need - 1, undefined]);
  });

  test('the Jade Charm turns a hex aside: the caster\'s Chi, cast and hex are spent, nothing lands, no ward; it cools down 24 h', () => {
    regular('alex');
    seed('kim', (u) => { u.chi = { n: 20 }; });
    seed('alex', (u) => { u.glovebox = { jade: 1 }; });
    const done = castBy('kim', 'alex', 'hex', 'fire');
    expect(done).toMatchObject({ outcome: 'deflected', chiAfter: 20 - CHI.cost.hex, castsLeft: MAGIC.castsPerDay - 1, readyAt: T + DEFENCES.jade.cooldownHours * HOUR });
    expect(user('alex').charms).toBeUndefined();
    expect(user('alex').glovebox).toEqual({});
    expect(user('alex').cooldowns.jade).toBe(T + DEFENCES.jade.cooldownHours * HOUR);
    expect([today('kim').casts, today('kim').hexes, today('alex').hexRecv, today('alex').defences]).toEqual([1, 1, 1, 1]);
    // Held but cooling down (or the day's 3 defences gone): the next hex lands
    seed('alex', (u) => { u.glovebox = { jade: 1 }; });
    seed('jo', (u) => { u.chi = { n: 20 }; });
    expect(castBy('jo', 'alex', 'hex', 'wind', { now: T + HOUR }).outcome).toBe('landed');
    expect(user('alex').glovebox).toEqual({ jade: 1 });
  });

  test('blessings of all six elements that paid off: 🎒 All That Kind of Thing, +10, for the caster', () => {
    seed('kim', (u) => { u.lifetime = { do: {}, got: {}, streak: {}, bestStreak: 0, magic: { paid: 9, paidElements: ['wind', 'fire', 'lightning', 'thunder', 'rain'] } }; u.titles = { earned: {}, shown: null }; });
    charm('sam', 'bless', 'smoke');
    const { result, lines } = draw('foodfight', 'throw', PIE, { actor: { id: 'jo', name: 'Jo' }, target: { ...ALEX, pingUserIds: ['sam'], name: 'Sam' }, random: () => rOn(PIE, 'hit') });
    expect(result.titles).toEqual([{ who: 'caster', userId: 'kim', key: 'wind-fire', name: 'Kim' }]);
    expect(Object.keys(user('kim').titles.earned)).toEqual(['wind-fire']);
    expect(bonus('kim', 'foodfight')).toBe(PAY.points + TITLE_POINTS);
    expect(user('kim').lifetime.magic).toEqual({ paid: 10, paidElements: ['wind', 'fire', 'lightning', 'thunder', 'rain', 'smoke'] });
    expect(lines).toContain('-# 📜 Kim earned a title: 🎒 All That Kind of Thing (+10). Show it with /scoreboard title:');
  });

  test('🧧 Red Envelope: +4 Chi on top of the day\'s cap (never past the bag); never drawn into a full bag or with the bag off', () => {
    play('hit'); // points, and a streak: no other twist is idle
    luckSeq(0, rTwist('redEnvelope'), 0.5);
    const r = play('hit', { now: T + MIN });
    expect(r.twist).toEqual({ key: 'redEnvelope', good: true, chi: CHI.redEnvelope, line: 1 });
    expect([user('sam').chi.n, today('sam').chi]).toEqual([2 + CHI.redEnvelope, 2]);
    expect(extraLines(r, { actor: 'Sam' })).toEqual([`-# 🎲 Twist! 🧧 Red Envelope: A red envelope slides out of Sam's popcorn bucket. Somebody out there wishes Sam well. Sam +${CHI.redEnvelope} Chi, on top of the day's cap.`]);
    // 18 in the bag: only 2 fit
    seed('sam', (u) => { u.chi = { n: CHI.bag - 2 }; });
    luckSeq(0, rTwist('redEnvelope'), 0);
    expect(play('hit', { now: T + 2 * MIN }).twist).toMatchObject({ key: 'redEnvelope', chi: 1 }); // the play's own Chi filled one
    // A full bag (20 now): it isn't in the pool, so the same r lands where it does over the pool without it
    expect(user('sam').chi.n).toBe(CHI.bag);
    const without = Object.keys(TWISTS).filter(k => k !== 'redEnvelope');
    const instead = pickLine(without.map(k => ({ outcome: k })), Object.fromEntries(without.map(k => [k, TWISTS[k].weight])), () => rTwist('redEnvelope')).outcome;
    luckSeq(0, rTwist('redEnvelope'));
    expect(play('hit', { now: T + DAY }).twist.key).toBe(instead);
    luckSeq(0, rTwist('redEnvelope'));
    expect(play('hit', { now: T + DAY + MIN, settings: { ...SETTINGS, magic: false } }).twist.key).not.toBe('redEnvelope');
  });

  test('🀄 Ching Dai\'s Curse: a hex of a random element, no caster, counted as received; never one that would cancel your blessing', () => {
    play('hit');
    // Element draw 0.5 over the six; line 0
    luckSeq(0, rTwist('chingDai'), 0.5, 0);
    const r = play('hit', { now: T + MIN });
    const el = ELEMENT_KEYS[3];
    expect(r.twist).toEqual({ key: 'chingDai', good: false, el, line: 0 });
    expect(user('sam').charms.hex).toEqual({ el, by: null, byName: null, at: T + MIN, until: T + MIN + MAGIC.hexHours * HOUR, left: CHARMS[el].hex.plays });
    expect(today('sam').hexRecv).toBe(1);
    expect(extraLines(r, { actor: 'Sam' })).toContain(`-# 🎲 Twist! 🀄 Ching Dai's Curse: An emperor two thousand years dead is still mad about something, and today it's Sam. ${ELEMENTS[el].emoji} ${ELEMENTS[el].hexName} lands on Sam, with no caster. Sam can /six-demon-bag shrug it off.`);
    // With a Fire blessing on: never Fire or Rain — the same draw picks from the other four
    deleteScores(GUILD);
    play('hit');
    charm('sam', 'bless', 'fire', { left: 3 });
    // 0.7 over all six would be Fire; over the four left, it's Wind
    expect(ELEMENT_KEYS[Math.floor(0.7 * 6)]).toBe('fire');
    luckSeq(0, rTwist('chingDai'), 0.7, 0);
    const blessed = play('miss', { now: T + MIN });
    expect(blessed.twist.el).toBe('wind');
    expect(user('sam').charms.bless).toMatchObject({ el: 'fire' });
  });

  test('🀄 Ching Dai\'s Curse is idle — not drawn — when hexed, warded, at peace, hexes are off, two came today, or you\'re fighting the siege', () => {
    const landsOn = (setup, opts = {}) => {
      deleteScores(GUILD);
      play('hit');
      setup();
      luckSeq(0, rTwist('chingDai'), 0.5, 0);
      return play('hit', { now: T + MIN, ...opts }).twist?.key ?? null;
    };
    expect(landsOn(() => {})).toBe('chingDai');
    expect(landsOn(() => charm('sam', 'hex', 'rain'))).not.toBe('chingDai');
    expect(landsOn(() => seed('sam', (u) => { u.charms = { wardUntil: T + HOUR }; }))).not.toBe('chingDai');
    expect(landsOn(() => seed('sam', (u) => { u.charms = { peace: { on: true, since: T } }; }))).not.toBe('chingDai');
    expect(landsOn(() => {}, { settings: { ...SETTINGS, hexes: false } })).not.toBe('chingDai');
    expect(landsOn(() => mutateScores(GUILD, (d) => { d.daily.sam.hexRecv = MAGIC.hexesReceivedPerDay; }))).not.toBe('chingDai');
    deleteScores(GUILD);
    play('hit');
    luckSeq(0, rTwist('chingDai'), 0.5, 0);
    expect(recordPlay(GUILD, { game: 'foodfight', actor: SAM, target: ROLE, outcome: 'hit', settings: SETTINGS, fighting: true }, T + MIN).twist?.key).not.toBe('chingDai');
  });
});
