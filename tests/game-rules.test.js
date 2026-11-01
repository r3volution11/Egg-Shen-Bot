/**
 * The games' pure rules (src/utils/gameRules.js) and their luck
 * (src/utils/gameLuck.js): how a line is drawn, how multipliers are
 * capped, how nights are counted, and how far someone is toward a title.
 *
 * pickLine is held to the grid hardest, because everything leans on it:
 * with no item in play it must draw EXACTLY the line the old pick() drew
 * for the same Math.random value, or every test that stubs Math.random to
 * land on a line silently lands somewhere else.
 *
 * Run with: npm test -- tests/game-rules.test.js
 */

import { describe, test, expect, afterEach } from '@jest/globals';
import {
  pickLine, scalePoints, actionFor, itemEffect, nightKey, nightsBetween, shiftNight,
  nightTier, nextNightTier, earnsNightLight, nextNightLightAt, titleProgress,
} from '../src/utils/gameRules.js';
import { luck, _setLuck, LUCK_OFF } from '../src/utils/gameLuck.js';
import { TITLES } from '../src/data/gameRewards.js';

/** 1000 evenly spread r values, plus the edges Math.random can return */
const GRID = [...Array.from({ length: 1000 }, (_, i) => i / 1000), 1e-12, 0.5 - 1e-12, 1 - 2 ** -53];
const lines = (outcomes) => outcomes.map((outcome, i) => ({ text: `line ${i}`, outcome }));
const THROW = ['hit', 'miss', 'backfire', 'hit', 'hit', 'miss', 'backfire', 'hit', 'miss', 'hit', 'hit', 'backfire', 'hit', 'miss', 'hit'];

describe('pickLine', () => {
  test('with every weight 1 it is exactly the old pick(): lines[Math.floor(r * n)], for every r and n', () => {
    for (let n = 1; n <= 24; n++) {
      const list = lines(Array.from({ length: n }, (_, i) => THROW[i % THROW.length]));
      for (const r of GRID) {
        const old = list[Math.floor(r * n)];
        expect(pickLine(list, {}, () => r)).toBe(old);
        // Weights that name every outcome as 1 are the same draw
        expect(pickLine(list, { hit: 1, miss: 1, backfire: 1 }, () => r)).toBe(old);
      }
    }
  });

  test('it draws once: a second draw would move every stubbed test', () => {
    let calls = 0;
    pickLine(lines(THROW), { miss: 0, backfire: 0 }, () => { calls++; return 0.37; });
    expect(calls).toBe(1);
  });

  test('a line weighted 0 is never drawn, anywhere on the grid', () => {
    const list = lines(THROW);
    const drawn = new Set(GRID.map(r => pickLine(list, { miss: 0, backfire: 0 }, () => r).outcome));
    expect([...drawn]).toEqual(['hit']);
    // …and what's left keeps the line file's own odds: each hit line equally
    const counts = {};
    for (const r of GRID.slice(0, 1000)) {
      const l = pickLine(list, { miss: 0, backfire: 0 }, () => r);
      counts[l.text] = (counts[l.text] || 0) + 1;
    }
    const hits = list.filter(l => l.outcome === 'hit').length;
    expect(Object.keys(counts)).toHaveLength(hits);
    for (const c of Object.values(counts)) expect(Math.abs(c - 1000 / hits)).toBeLessThanOrEqual(1);
  });

  test('a ×2 weight is exactly twice as likely over the grid', () => {
    const list = lines(['hit', 'miss', 'backfire']);
    const counts = { hit: 0, miss: 0, backfire: 0 };
    for (let i = 0; i < 1000; i++) counts[pickLine(list, { hit: 2 }, () => (i + 0.5) / 1000).outcome]++;
    expect(counts).toEqual({ hit: 500, miss: 250, backfire: 250 });
  });

  test('every weight 0 falls back to an even draw, not an empty one', () => {
    const list = lines(['miss', 'backfire', 'miss']);
    for (const r of GRID) expect(pickLine(list, { miss: 0, backfire: 0 }, () => r)).toBe(list[Math.floor(r * 3)]);
  });

  test('nonsense weights count as 0; an empty list draws nothing', () => {
    const list = lines(['hit', 'miss']);
    for (const r of GRID) expect(pickLine(list, { miss: -3, hit: 'x' }, () => r)).toBe(list[Math.floor(r * 2)]);
    expect(pickLine(lines(['hit', 'miss']), { miss: -1 }, () => 0.99).outcome).toBe('hit');
    expect(pickLine([], {}, () => 0.5)).toBeUndefined();
  });
});

describe('multipliers', () => {
  test('your gains up to ×3, your losses up to ×2, the target up to ×2', () => {
    expect(scalePoints([3, -1], { gain: 2 })).toEqual([6, -1]);
    expect(scalePoints([3, -1], { gain: 5 })).toEqual([9, -1]);
    expect(scalePoints([-2, 1], { gain: 5 })).toEqual([-2, 1]); // a gain multiplier never touches a loss
    expect(scalePoints([-2, 1], { loss: 4 })).toEqual([-4, 1]);
    expect(scalePoints([3, -1], { target: 3 })).toEqual([3, -2]);
    expect(scalePoints([0, 0], { gain: 2, loss: 2 })).toEqual([0, 0]);
    expect(Object.is(scalePoints([-1, 0], { loss: 0.4 })[0], -0)).toBe(false);
  });
});

describe('items fit their plays', () => {
  test('each active item works in its own game and action only; passive and siege items never', () => {
    expect(itemEffect('gpie', 'foodfight', 'throw')).toMatchObject({ gain: 2 });
    expect(itemEffect('gpie', 'foodfight', 'feed')).toMatchObject({ actorPlus: 2, targetPlus: 2 });
    expect(itemEffect('gpie', 'doom', 'fate')).toBeNull();
    expect(itemEffect('vhs', 'doom', 'fate')).toMatchObject({ ignoresDefences: true });
    expect(itemEffect('holyw', 'rescue', 'attempt')).toMatchObject({ shieldTimes: 3 });
    expect(itemEffect('penny', 'potion', 'give')).toMatchObject({ gain: 2 });
    for (const passive of ['garlic', 'antid', 'nlight']) expect(itemEffect(passive, 'doom', 'fate')).toBeNull();
    expect(itemEffect('silver', 'doom', 'fate')).toBeNull();
    expect(itemEffect('nope', 'doom', 'fate')).toBeNull();
  });

  test('a bare outcome says which action it was', () => {
    expect(['hit', 'miss', 'backfire', 'tasty', 'gross', 'spill'].map(o => actionFor('foodfight', o)))
      .toEqual(['throw', 'throw', 'throw', 'feed', 'feed', 'feed']);
    expect([actionFor('doom', 'blocked'), actionFor('rescue', 'caught'), actionFor('potion', 'hurt')]).toEqual(['fate', 'attempt', 'give']);
  });
});

describe('nights', () => {
  const at = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m);

  test('a night runs 12:00 to 12:00 UTC: 23:00 and 02:00 are one night, 13:00 the next', () => {
    expect(nightKey(at(3, 23))).toBe('2026-11-03');
    expect(nightKey(at(4, 2))).toBe('2026-11-03');
    expect(nightKey(at(4, 11, 59))).toBe('2026-11-03');
    expect(nightKey(at(4, 12))).toBe('2026-11-04');
    expect(nightKey(at(4, 13))).toBe('2026-11-04');
    expect(nightsBetween('2026-11-03', '2026-11-04')).toBe(1);
    expect(nightsBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(shiftNight('2026-11-01', -1)).toBe('2026-10-31');
  });

  test('tiers at 3, 7 and 14; Night Lights at 3, then every 7 more', () => {
    expect([2, 3, 6, 7, 13, 14, 40].map(n => nightTier(n)?.key ?? null)).toEqual([null, 'regular', 'regular', 'owl', 'owl', 'creature', 'creature']);
    expect([0, 3, 7, 14].map(n => nextNightTier(n)?.at ?? null)).toEqual([3, 7, 14, null]);
    expect(Array.from({ length: 30 }, (_, i) => i + 1).filter(earnsNightLight)).toEqual([3, 10, 17, 24]);
    expect([0, 2, 3, 9, 10, 11].map(nextNightLightAt)).toEqual([3, 3, 10, 10, 17, 17]);
  });
});

describe('title progress', () => {
  const title = (key) => TITLES.find(t => t.key === key);
  const user = {
    games: {
      foodfight: { all: { counts: { hit: 12, backfire: 2, spill: 1 }, received: { hit: 4, tasty: 3, gross: 2 }, bestStreak: 6 } },
      doom: { all: { counts: { backfired: 5 }, received: { escaped: 7 }, bestStreak: 11 } },
      potion: { all: { counts: { backfired: 1 } } },
    },
    nights: { best: 9 },
  };

  test('reads what is stored all-time: your outcomes, what you received, streaks, nights', () => {
    expect(titleProgress(user, title('pie-sniper'))).toBe(12);
    expect(titleProgress(user, title('boomerang'))).toBe(2 + 1 + 5 + 1);
    expect(titleProgress(user, title('taster'))).toBe(5);
    expect(titleProgress(user, title('cockroach'))).toBe(7);
    expect(titleProgress(user, title('on-fire'))).toBe(11);
    expect(titleProgress(user, title('night-owl'))).toBe(9);
    expect(titleProgress({}, title('pie-sniper'))).toBe(0);
    expect(titleProgress(undefined, title('on-fire'))).toBe(0);
  });
});

describe('luck', () => {
  afterEach(() => _setLuck(null));

  test('GAME_LUCK=off (the test default) is a constant that fires nothing', () => {
    expect(process.env.GAME_LUCK).toBe('off');
    expect([luck(), luck()]).toEqual([LUCK_OFF, LUCK_OFF]);
    expect(luck() < 0.15).toBe(false);
  });

  test('_setLuck wins over GAME_LUCK, and null goes back', () => {
    _setLuck(() => 0.25);
    expect(luck()).toBe(0.25);
    _setLuck(null);
    expect(luck()).toBe(LUCK_OFF);
  });
});
