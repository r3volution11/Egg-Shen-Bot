/**
 * Every title's badge is its own (2.75.0). A badge is how the game card,
 * the leaderboard and a title's announcement tell titles apart at a glance,
 * so two titles sharing one read as the same title. The Big Trouble titles
 * (btilcLines.TITLES_BTILC: their words) join gameRewards.TITLES (the ones
 * a member can earn) one release at a time, so both lists are checked
 * together: a badge picked for a title that hasn't shipped yet mustn't
 * collide with one that has. That's how the design's 🗡️ Wang Chi (Monster
 * Hunter's) and 🔪 It's All in the Reflexes (Final Girl's) were caught:
 * they're 🥋 and 🪃 now (R2 brief §3, open question 4).
 *
 * Run with: npm test -- tests/title-badges.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { TITLES } from '../src/data/gameRewards.js';
import { TITLES_BTILC } from '../src/data/btilcLines.js';

/** Every title once, by key: an earnable one (TITLES) with its Big Trouble words merged in */
const byKey = new Map();
for (const t of [...TITLES_BTILC, ...TITLES]) byKey.set(t.key, { ...byKey.get(t.key), ...t });
const ALL = [...byKey.values()];

describe('title badges', () => {
  test('every badge is unique across every title, earnable or still to come', () => {
    const seen = new Map();
    const clashes = [];
    for (const t of ALL) {
      if (seen.has(t.badge)) clashes.push(`${t.badge}: ${seen.get(t.badge)} and ${t.key}`);
      else seen.set(t.badge, t.key);
    }
    expect(clashes).toEqual([]);
  });

  test('title keys are unique within each list', () => {
    for (const list of [TITLES, TITLES_BTILC]) {
      const keys = list.map(t => t.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test('a Big Trouble title that\'s earnable carries its words unchanged', () => {
    // The engine takes the words from TITLES_BTILC and adds the numbers: they never drift apart
    const earnable = TITLES_BTILC.filter(t => TITLES.some(x => x.key === t.key));
    expect(earnable.map(t => t.key)).toEqual(['wang-chi', 'everybody-relax']);
    for (const t of earnable) {
      expect(TITLES.find(x => x.key === t.key)).toMatchObject({ key: t.key, title: t.title, badge: t.badge });
    }
  });

  test('the R2 defaults: the Wang Chi is 🥋, It\'s All in the Reflexes 🪃 (open question 4)', () => {
    expect(byKey.get('wang-chi').badge).toBe('🥋');
    expect(byKey.get('reflexes').badge).toBe('🪃');
    // The badges they were moved off: Monster Hunter's and Final Girl's
    expect(byKey.get('monster-hunter').badge).toBe('🗡️');
    expect(byKey.get('final-girl').badge).toBe('🔪');
  });
});
