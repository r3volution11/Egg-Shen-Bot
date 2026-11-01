/**
 * R4's happenings, as the plays feel them: each happening's `mods`
 * (src/data/gameHappenings.js) applied by resolvePlay (the draw's weights)
 * and recordPlay (points, shields, streaks, the twist chance), with the
 * active list given explicitly — the same list finishPlay reads once from
 * the store and hands to both. The store, scheduler and admin command are
 * tested in their own suites; the real commands end to end in
 * tests/game-commands.test.js.
 *
 * Draw frequencies are counted over an even grid of random numbers chosen
 * so every weight boundary falls between grid points: the counts are
 * exact, not "about right".
 *
 * Run with: npm test -- tests/game-happening-mods.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  DEFAULT_GAME_SETTINGS, recordPlay, loadScores, mutateScores, deleteScores, resetPlayLimits, extraLines, resultLine,
} from '../src/utils/gameScores.js';
import { resolvePlay, outcomeLabel } from '../src/utils/gamePlay.js';
import { ruleMatches, liveHappenings } from '../src/utils/gameRules.js';
import { _setLuck, LUCK_OFF } from '../src/utils/gameLuck.js';
import { HAPPENINGS, CALENDAR_HAPPENINGS } from '../src/data/gameHappenings.js';
import { FOODFIGHT_LINES } from '../src/data/foodfightLines.js';
import { FOODFIGHT_FEED_LINES } from '../src/data/foodfightFeedLines.js';
import { RESCUE_LINES } from '../src/data/rescueLines.js';
import { POTION_LINES } from '../src/data/potionLines.js';

const GUILD = 'happening-mods-guild';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 2 Nov 2026, 18:00 UTC: no calendar happening of its own */
const T = Date.UTC(2026, 10, 2, 18, 0);

const SAM = { id: 'sam', name: 'Sam' };
const ALEX = { kind: 'member', pingUserIds: ['alex'], name: 'Alex', mention: '<@alex>' };
const ROLE = { kind: 'role', pingUserIds: [], name: 'Mods', mention: '<@&mods>' };
const SETTINGS = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 1000 };

const PIE = FOODFIGHT_LINES.pie; // 15 hits, 6 misses, 4 backfires
const TACO = FOODFIGHT_FEED_LINES.taco; // 9 tasty, 3 gross, 3 spill
const FINAL_GIRL = RESCUE_LINES['final-girl']; // 15 rescued, 5 caught, 5 sacrificed
const POISON = POTION_LINES.poison; // 19 worked, 7 backfired

/** A random happening in progress, as activeHappenings lists it */
const on = (kind, { endsAt = T + HOUR } = {}) => {
  const h = HAPPENINGS[kind];
  return { kind, name: h.name, emoji: h.emoji, tag: h.tag, about: h.about, mods: h.mods, endsAt, calendar: false };
};
/** A calendar happening: all day, no end time */
const today = (kind) => {
  const h = CALENDAR_HAPPENINGS[kind];
  return { kind, name: h.name, emoji: h.emoji, tag: h.tag, about: h.about, mods: h.mods, endsAt: null, calendar: true };
};

const play = (game, outcome, { target = ALEX, settings = SETTINGS, now = T, item, happenings = [], effect } = {}) =>
  recordPlay(GUILD, { game, actor: SAM, target, outcome, settings, item, effect, happenings }, now);
const names = (r) => ({ actor: 'Sam', target: r.targetId ? 'Alex' : null });
const pointsLine = (game, r) => resultLine(game, r, names(r), { label: outcomeLabel(r) });
const stored = (id, game) => loadScores(GUILD).users[id]?.games?.[game]?.all;
const seed = (id, fn) => mutateScores(GUILD, (d) => fn((d.users[id] ||= { name: id, games: {} }), d));

/**
 * How often each outcome is drawn over `n` evenly spaced random numbers,
 * through the real resolvePlay (so the happenings, the item and the
 * statuses all combine as they do in a play).
 */
function frequencies(game, action, lines, n, { happenings = [], effect, target = ROLE } = {}) {
  const counts = {};
  for (let i = 0; i < n; i++) {
    const r = (i + 0.5) / n;
    const { outcome } = resolvePlay(GUILD, { game, action, actor: SAM, target, lines, effect, settings: SETTINGS, happenings }, T, () => r);
    counts[outcome] = (counts[outcome] || 0) + 1;
  }
  return counts;
}

beforeEach(() => {
  deleteScores(GUILD);
  resetPlayLimits();
});
afterEach(() => {
  jest.restoreAllMocks();
  _setLuck(null);
});

describe('points: both sides, inside the caps', () => {
  test('🌕 Full Moon: a doom scores double both ways (+6/−2), and the label says why', () => {
    const r = play('doom', 'doomed', { happenings: [on('fullmoon')] });
    expect([r.actorDelta, r.targetDelta]).toEqual([6, -2]);
    expect([stored('sam', 'doom').points, stored('alex', 'doom').points]).toEqual([6, -2]);
    expect(r.happenings).toEqual([{ kind: 'fullmoon', tag: '🌕×2' }]);
    expect(outcomeLabel(r)).toBe('💀 Doomed! 🌕×2');
    expect(pointsLine('doom', r)).toBe('-# 💀 Doomed! 🌕×2 Sam +6 (6 pts) · Alex −2');

    const escaped = play('doom', 'escaped', { happenings: [on('fullmoon')], now: T + MIN });
    expect([escaped.actorDelta, escaped.targetDelta]).toEqual([-2, 4]);
    // Not a doom: nothing doubled, no tag
    const hit = play('foodfight', 'hit', { happenings: [on('fullmoon')], now: T + 2 * MIN });
    expect([hit.actorDelta, hit.targetDelta, hit.happenings, outcomeLabel(hit)]).toEqual([3, -1, [], '🎯 Hit!']);
    // A capped doom scores nothing to double
    const capped = play('doom', 'doomed', { happenings: [on('fullmoon')], settings: { ...SETTINGS, dailyScoredPlays: 0 }, now: T + 3 * MIN });
    expect([capped.actorDelta, capped.targetDelta, capped.happenings]).toEqual([0, 0, []]);
  });

  test('🎞️ Double Feature × a Golden Pie would be ×4: your gains stop at ×3, the target at ×2', () => {
    seed('sam', u => { u.glovebox = { gpie: 2 }; });
    const r = play('foodfight', 'hit', { item: 'gpie', happenings: [on('doublefeature')] });
    expect([r.actorDelta, r.targetDelta]).toEqual([9, -2]);
    expect(outcomeLabel(r)).toBe('🎯 Hit! 🎞️×2');
    // On a feed: ×2 both sides first, then the pie's +2 each
    const feed = play('foodfight', 'tasty', { item: 'gpie', happenings: [on('doublefeature')], now: T + MIN });
    expect([feed.actorDelta, feed.targetDelta]).toEqual([2 + 2, 4 + 2]);
  });

  test('Double Feature × Full Moon both apply, capped: gains ×3, losses ×2, the target ×2', () => {
    const both = [on('fullmoon'), on('doublefeature')];
    const doomed = play('doom', 'doomed', { happenings: both });
    expect([doomed.actorDelta, doomed.targetDelta]).toEqual([9, -2]);
    expect(outcomeLabel(doomed)).toBe('💀 Doomed! 🌕×2 🎞️×2');
    const escaped = play('doom', 'escaped', { happenings: both, now: T + MIN });
    expect([escaped.actorDelta, escaped.targetDelta]).toEqual([-2, 4]);
    const backfired = play('doom', 'backfired', { happenings: both, now: T + 2 * MIN });
    expect([backfired.actorDelta, backfired.targetDelta]).toEqual([-4, 2]);
  });

  test('an item never raises the target\'s loss: a Cursed VHS under the Full Moon is ×3 for you, still ×2 for them', () => {
    seed('sam', u => { u.glovebox = { vhs: 2 }; });
    const r = play('doom', 'doomed', { item: 'vhs', happenings: [on('fullmoon')] });
    expect([r.item.used, r.actorDelta, r.targetDelta]).toEqual([true, 9, -2]);
    // With no moon the VHS doubles only your side: their −1 stays −1 (the
    // ×2 target cap would hide an item wrongly multiplying it, above)
    const plain = play('doom', 'doomed', { item: 'vhs', now: T + MIN });
    expect([plain.item.used, plain.actorDelta, plain.targetDelta]).toEqual([true, 6, -1]);
  });

  test('Director\'s Cut on a play already at ×3 is used, and says it added nothing', () => {
    seed('sam', u => { u.glovebox = { gpie: 1 }; u.effects = { dcut: { at: T, until: T + DAY } }; });
    const r = play('foodfight', 'hit', { item: 'gpie', happenings: [on('doublefeature')] });
    expect([r.actorDelta, r.statuses]).toEqual([9, [{ key: 'dcut', wasted: true }]]);
    expect(extraLines(r, names(r))).toEqual([
      '-# 🥧 Golden Pie: a sure hit, and Sam\'s points ×2.',
      '-# 🎬 Director\'s Cut: used, but Sam\'s points were already at the ×3 most.',
    ]);
    expect(loadScores(GUILD).users.sam.effects).toBeUndefined();
  });

  test('🍻 Happy Hour: tasty scores double both ways', () => {
    const r = play('foodfight', 'tasty', { happenings: [on('happyhour')] });
    expect([r.actorDelta, r.targetDelta, outcomeLabel(r)]).toEqual([2, 4, '😋 Tasty! 🍻']);
    // A gross feed's points aren't touched (only its odds are)
    expect(play('foodfight', 'gross', { happenings: [on('happyhour')], now: T + MIN }).actorDelta).toBe(-1);
  });
});

describe('weights: the odds of each line', () => {
  test('🌫️ The Fog: hits ×0.6, misses ×2, exactly, over a grid of draws', () => {
    // Weights 15×0.6 + 6×2 + 4 = 25: hits 9/25, misses 12/25, backfires 4/25
    expect(frequencies('foodfight', 'throw', PIE, 1000, { happenings: [on('fog')] })).toEqual({ hit: 360, miss: 480, backfire: 160 });
    expect(frequencies('foodfight', 'throw', PIE, 1000)).toEqual({ hit: 600, miss: 240, backfire: 160 });
    const drawn = resolvePlay(GUILD, { game: 'foodfight', action: 'throw', actor: SAM, target: ROLE, lines: PIE, settings: SETTINGS, happenings: [on('fog')] }, T, () => 0.5);
    expect(drawn.mods).toEqual({ happenings: ['fog'] });
    // Feeding is a different action: the fog doesn't touch it
    const fed = resolvePlay(GUILD, { game: 'foodfight', action: 'feed', actor: SAM, target: ROLE, lines: TACO, settings: SETTINGS, happenings: [on('fog')] }, T, () => 0.5);
    expect(fed.mods).toEqual({});
  });

  test('a Golden Pie still can\'t miss in the Fog: its 0 is 0 whatever multiplies it', () => {
    seed('sam', u => { u.glovebox = { gpie: 1 }; });
    const counts = {};
    for (let i = 0; i < 1000; i++) {
      const r = (i + 0.5) / 1000;
      const { outcome } = resolvePlay(GUILD, { game: 'foodfight', action: 'throw', actor: SAM, target: ROLE, lines: PIE, item: 'gpie', settings: SETTINGS, happenings: [on('fog')] }, T, () => r);
      counts[outcome] = (counts[outcome] || 0) + 1;
    }
    expect(counts).toEqual({ hit: 1000 });
  });

  test('🍻 Happy Hour feeds, 🌅 Sunrise rescues, 🧪 Mad Scientist potions: exact', () => {
    // 9 + 3×0.5 + 3×0.5 = 12
    expect(frequencies('foodfight', 'feed', TACO, 1200, { happenings: [on('happyhour')] })).toEqual({ tasty: 900, gross: 150, spill: 150 });
    // 15 + 5×0.5 + 5 = 22.5
    expect(frequencies('rescue', 'attempt', FINAL_GIRL, 900, { happenings: [on('sunrise')], target: ALEX })).toEqual({ rescued: 600, caught: 100, sacrificed: 200 });
    // Potion lines are drawn as worked/backfired: 19 + 7×0.5 = 22.5
    expect(frequencies('potion', 'give', POISON, 900, { happenings: [on('madscience')], effect: 'harmful' })).toEqual({ worked: 760, backfired: 140 });
  });

  test('🔪 Friday the 13th: every bad outcome ×1.25 — on a potion too, where "worked" is the good one', () => {
    // 15 + 6×1.25 + 4×1.25 = 27.5
    expect(frequencies('foodfight', 'throw', PIE, 1100, { happenings: [today('friday13')] })).toEqual({ hit: 600, miss: 300, backfire: 200 });
    // 19 + 7×1.25 = 27.75
    expect(frequencies('potion', 'give', POISON, 1110, { happenings: [today('friday13')], effect: 'harmful' })).toEqual({ worked: 760, backfired: 350 });
    const bad = { bad: true, mult: 1.25 };
    expect(['worked', 'backfired', 'blocked'].map(o => ruleMatches(bad, { game: 'potion', action: 'give', outcome: o }))).toEqual([false, true, false]);
    expect(['doomed', 'escaped', 'backfired', 'blocked'].map(o => ruleMatches(bad, { game: 'doom', action: 'fate', outcome: o }))).toEqual([false, true, true, false]);
  });
});

describe('shields, streaks, bonuses', () => {
  test('🌅 Sunrise: a rescue\'s shield lasts 2×; with Holy Water 3×, that\'s 6× — and 6× is the most', () => {
    const r = play('rescue', 'rescued', { happenings: [on('sunrise')] });
    expect(r.shieldedUntil).toBe(T + 2 * HOUR);
    expect(loadScores(GUILD).shields.alex).toBe(T + 2 * HOUR);
    expect(outcomeLabel(r)).toBe('🛟 Rescued! 🌅');

    seed('sam', u => { u.glovebox = { holyw: 2 }; });
    expect(play('rescue', 'rescued', { item: 'holyw', happenings: [on('sunrise')], now: T + MIN }).shieldedUntil).toBe(T + MIN + 6 * HOUR);
    // A third stretcher would make it 12×: still 6×
    const stretcher = { kind: 'stretch', name: 'Stretch', emoji: '📏', tag: '📏', mods: { shieldMult: 2 }, endsAt: T + HOUR };
    const capped = play('rescue', 'rescued', { item: 'holyw', happenings: [on('sunrise'), stretcher], now: T + 2 * MIN });
    expect(capped.shieldedUntil).toBe(T + 2 * MIN + 6 * HOUR);
    expect(outcomeLabel(capped)).toBe('🛟 Rescued! 🌅 📏');
  });

  test('📼 Be Kind, Rewind: a bad outcome keeps the streak — the card\'s and the titles\' — and a Second Wind stays unspent', () => {
    play('foodfight', 'hit');
    play('foodfight', 'hit', { now: T + MIN });
    seed('sam', u => { u.effects = { secondwind: { at: T, until: T + DAY } }; });
    const r = play('foodfight', 'miss', { happenings: [on('rewind')], now: T + 2 * MIN });
    expect([r.streak, stored('sam', 'foodfight').streak, loadScores(GUILD).users.sam.lifetime.streak.foodfight]).toEqual([2, 2, 2]);
    expect(outcomeLabel(r)).toBe('💨 Miss! 📼');
    expect(extraLines(r, names(r))).toEqual(['-# 📼 Be Kind, Rewind: Sam\'s streak survives.']);
    expect(loadScores(GUILD).users.sam.effects).toEqual({ secondwind: { at: T, until: T + DAY } });

    // Ended (now ≥ endsAt), the same miss would break it — so the Second Wind keeps it instead
    const after = play('foodfight', 'miss', { happenings: [on('rewind', { endsAt: T + 3 * MIN })], now: T + 3 * MIN });
    expect([after.streak, after.happenings, after.statuses]).toEqual([2, [], [{ key: 'secondwind' }]]);
    expect(play('foodfight', 'miss', { now: T + 4 * MIN }).streak).toBe(0);
  });

  test('🔪 Friday the 13th: +1 on a good outcome, as bonus; nothing on a bad one', () => {
    const r = play('foodfight', 'hit', { happenings: [today('friday13')] });
    expect([r.actorDelta, r.bonus, stored('sam', 'foodfight').points, stored('sam', 'foodfight').bonus]).toEqual([3, 1, 4, 1]);
    expect(outcomeLabel(r)).toBe('🎯 Hit! 🔪');
    expect(extraLines(r, names(r))).toEqual([
      '-# 🔪 Friday the 13th: Sam +1.',
      '-# 🔪 Friday the 13th: bad luck is likelier today, but every good play scores +1.',
    ]);
    const miss = play('foodfight', 'miss', { happenings: [today('friday13')], now: T + MIN });
    expect([miss.bonus, miss.happenings]).toEqual([0, []]);
  });
});

describe('twists and calendar days', () => {
  test('🎃 Halloween: twists twice as likely (8%); with 🎪 Intermission too, six times (24%)', () => {
    luckSeq(0.07, 0);
    expect(play('foodfight', 'hit', { target: ROLE }).twist).toBeNull();
    luckSeq(0.07, 0);
    const r = play('foodfight', 'hit', { target: ROLE, happenings: [today('halloween')], now: T + MIN });
    expect(r.twist?.key).toBe('loose');
    // The tag shows when the happening changed the play: here, a twist that fired
    expect(outcomeLabel(r)).toBe('🎯 Hit! 🎃');

    const both = [on('intermission'), today('halloween')];
    luckSeq(0.2399, 0);
    expect(play('foodfight', 'hit', { target: ROLE, happenings: both, now: T + 2 * MIN }).twist?.key).toBe('loose');
    luckSeq(0.24, 0);
    const missed = play('foodfight', 'hit', { target: ROLE, happenings: both, now: T + 3 * MIN });
    expect([missed.twist, missed.happenings]).toEqual([null, []]);
    // With GAME_LUCK=off, Halloween still fires nothing
    _setLuck(null);
    expect(play('foodfight', 'hit', { target: ROLE, happenings: both, now: T + 4 * MIN }).twist).toBeNull();
  });

  test('a calendar happening is mentioned once per member per UTC day, on their first play', () => {
    const halloween = [today('halloween')];
    const first = play('foodfight', 'miss', { target: ROLE, happenings: halloween });
    expect(extraLines(first, names(first))).toEqual(['-# 🎃 Halloween Night: twists are twice as likely today.']);
    const second = play('foodfight', 'miss', { target: ROLE, happenings: halloween, now: T + MIN });
    expect(extraLines(second, names(second))).toEqual([]);
    expect(loadScores(GUILD).daily.sam.calendar).toEqual(['halloween']);
    // Someone else's first play gets it too
    const kim = recordPlay(GUILD, { game: 'foodfight', actor: { id: 'kim', name: 'Kim' }, target: ROLE, outcome: 'miss', settings: SETTINGS, happenings: halloween }, T + 2 * MIN);
    expect(kim.calendar.map(h => h.kind)).toEqual(['halloween']);
    // A new UTC day starts the flag over
    expect(play('foodfight', 'miss', { target: ROLE, happenings: halloween, now: T + DAY }).calendar.map(h => h.kind)).toEqual(['halloween']);
  });

  test('an ended happening does nothing, even if it\'s still stored: the clock decides, not the scheduler', () => {
    const ended = on('fullmoon', { endsAt: T });
    const r = play('doom', 'doomed', { happenings: [ended] });
    expect([r.actorDelta, r.targetDelta, outcomeLabel(r)]).toEqual([3, -1, '💀 Doomed!']);
    expect(frequencies('foodfight', 'throw', PIE, 1000, { happenings: [on('fog', { endsAt: T })] })).toEqual({ hit: 600, miss: 240, backfire: 160 });
    expect(liveHappenings([ended, on('fog'), today('halloween'), null, 'junk'], T).map(h => h.kind)).toEqual(['fog', 'halloween']);
    // A moment before its end it still counts
    expect(play('doom', 'doomed', { happenings: [on('fullmoon', { endsAt: T + MIN + 1 })], now: T + MIN }).actorDelta).toBe(6);
  });
});

/** luck() returns these in turn, then LUCK_OFF (fires nothing) */
function luckSeq(...values) {
  const queue = [...values];
  _setLuck(() => (queue.length ? queue.shift() : LUCK_OFF));
}
