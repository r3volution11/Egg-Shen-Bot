/**
 * The emoji kit's drawing rules (src/utils/emojiKit.js), in fallback and
 * with a registry of uploaded emojis. Exact strings throughout: a bar that
 * shows one segment too many, or a custom cap beside plain squares, is the
 * bug this guards against.
 *
 * Run with: npm test -- tests/emoji-kit.test.js
 */

import { describe, test, expect } from '@jest/globals';
import {
  createKit, KIT_CODES, GAME_KIT, MAX_EMOJI_MARKUP,
  pill, progressPill, formatNumber, filledSegments,
} from '../src/utils/emojiKit.js';

/** Every code uploaded, with real-length (19-digit) ids */
function registry({ without = [] } = {}) {
  return new Map(Object.keys(KIT_CODES)
    .filter(c => !without.includes(c))
    .map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
}
const markup = (code, reg) => `<:${reg.get(code).name}:${reg.get(code).id}>`;

describe('codes', () => {
  test('every code is 1–6 lowercase letters or digits, so its markup fits the budget', () => {
    for (const code of Object.keys(KIT_CODES)) expect(code).toMatch(/^[a-z0-9]{1,6}$/);
    const kit = createKit(registry());
    for (const code of Object.keys(KIT_CODES)) expect(kit.e(code).length).toBeLessThanOrEqual(MAX_EMOJI_MARKUP);
  });

  test('every code has a family and a plain fallback', () => {
    const entries = Object.entries(KIT_CODES);
    expect(entries.filter(([, e]) => !['bar', 'tick', 'icon'].includes(e.family)).map(([c]) => c)).toEqual([]);
    expect(entries.filter(([, e]) => !e.fallback).map(([c]) => c)).toEqual([]);
  });

  test('every game has an icon', () => {
    for (const code of Object.values(GAME_KIT)) expect(KIT_CODES[code]).toBeDefined();
  });

  test('an unknown code is a programming error, not a blank', () => {
    expect(() => createKit(null).e('nope')).toThrow(/Unknown kit code/);
  });
});

describe('numbers and pills', () => {
  test('thousands separators and a real minus sign', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(-3)).toBe('−3');
    expect(pill(-1234)).toBe('`−1,234`');
    expect(pill('#3')).toBe('`#3`');
  });

  test('a backtick inside a pill can\'t close it early', () => {
    expect(pill('a`b')).toBe('`aˋb`');
  });

  test('progress is zero-padded to the target\'s width', () => {
    expect(progressPill(7, 10)).toBe('`07/10`');
    expect(progressPill(7, 25)).toBe('`07/25`');
    expect(progressPill(3, 5)).toBe('`3/5`');
    expect(progressPill(-1, 10)).toBe('`00/10`');
  });
});

describe('filled segments', () => {
  test('rounded, but any progress shows one and nothing short of done shows all', () => {
    expect(filledSegments(7, 10, 10)).toBe(7);
    expect(filledSegments(0.4, 10, 10)).toBe(1);
    expect(filledSegments(9.6, 10, 10)).toBe(9);
    expect(filledSegments(10, 10, 10)).toBe(10);
    expect(filledSegments(12, 10, 10)).toBe(10);
  });

  test('nothing, negative or no maximum is empty', () => {
    expect(filledSegments(0, 10, 10)).toBe(0);
    expect(filledSegments(-5, 10, 10)).toBe(0);
    expect(filledSegments(5, 0, 10)).toBe(0);
    expect(filledSegments(5, -1, 10)).toBe(0);
  });
});

describe('fallback (no uploaded emojis)', () => {
  const kit = createKit(null);

  test('nothing is ready', () => {
    expect(kit.ready).toEqual({ bar: false, tick: false, icon: false });
  });

  test('icons are their plain emoji', () => {
    expect(kit.e('coin')).toBe('🪙');
    expect(kit.game('foodfight')).toBe('🥧');
    expect(kit.game('doom')).toBe('🪓');
  });

  test('bars are coloured squares, or ▰▱ blocks', () => {
    expect(kit.bar(7, 10)).toBe('🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜');
    expect(kit.bar(3, 5, { width: 5, colour: 'gold' })).toBe('🟨🟨🟨⬜⬜');
    expect(kit.bar(1, 4, { width: 4, style: 'blocks' })).toBe('▰▱▱▱');
    expect(kit.bar(0, 10, { width: 3 })).toBe('⬜⬜⬜');
  });

  test('a split bar: leader green, trailer orange, a tie gold on both sides', () => {
    expect(kit.splitBar(3, 1, { width: 8 })).toBe('🟩🟩🟩🟩🟩🟩🟧🟧');
    expect(kit.splitBar(1, 3, { width: 4 })).toBe('🟧🟩🟩🟩');
    expect(kit.splitBar(2, 2, { width: 4 })).toBe('🟨🟨🟨🟨');
    expect(kit.splitBar(0, 0, { width: 4 })).toBe('⬜⬜⬜⬜');
  });

  test('ticks wrap every perRow', () => {
    expect(kit.ticks(['played', 'missed', 'saved', 'tonight'], { perRow: 2 })).toBe('🌕🌑\n🔦🌗');
    expect(kit.ticks(['done', 'todo'])).toBe('✅⬜');
  });

  test('the ladder keeps its code span: the blocks only line up in monospace', () => {
    expect(kit.ladder(7)).toBe('`▰▰▰▰▰ ▰▰▱▱▱ ▱▱▱▱▱`');
    expect(kit.ladder(0)).toBe('`▱▱▱▱▱ ▱▱▱▱▱ ▱▱▱▱▱`');
  });
});

describe('with every emoji uploaded', () => {
  const reg = registry();
  const kit = createKit(reg);

  test('everything is ready, and icons are custom markup', () => {
    expect(kit.ready).toEqual({ bar: true, tick: true, icon: true });
    expect(kit.e('coin')).toBe(markup('coin', reg));
  });

  test('a bar is a left cap, middles and a right cap, filled from the left', () => {
    expect(kit.bar(2, 4, { width: 4 })).toBe(['bgl', 'bgm', 'bem', 'ber'].map(c => markup(c, reg)).join(''));
    expect(kit.bar(4, 4, { width: 3, colour: 'blue' })).toBe(['bbl', 'bbm', 'bbr'].map(c => markup(c, reg)).join(''));
    expect(kit.bar(0, 4, { width: 3 })).toBe(['bel', 'bem', 'ber'].map(c => markup(c, reg)).join(''));
  });

  test('a muted bar is grey whatever its colour', () => {
    expect(kit.bar(1, 2, { width: 2, colour: 'gold', muted: true })).toBe(['bsl', 'ber'].map(c => markup(c, reg)).join(''));
  });

  test('a split bar keeps each side\'s colour through the caps', () => {
    expect(kit.splitBar(1, 1, { width: 2 })).toBe(['byl', 'byr'].map(c => markup(c, reg)).join(''));
    expect(kit.splitBar(3, 1, { width: 4 })).toBe(['bgl', 'bgm', 'bgm', 'bor'].map(c => markup(c, reg)).join(''));
  });

  test('custom ladders are never inside a code span: custom emoji don\'t render there', () => {
    const out = kit.ladder(6, { groups: [3, 3] });
    expect(out).not.toContain('`');
    expect(out).toBe([
      ['bbl', 'bbm', 'bbr'], ['bbl', 'bbm', 'bbr'],
    ].map(g => g.map(c => markup(c, reg)).join('')).join(' '));
  });
});

describe('readiness goes by family', () => {
  test('one missing bar piece puts every bar on fallback, but not the icons', () => {
    const reg = registry({ without: ['bgm'] });
    const kit = createKit(reg);
    expect(kit.ready).toEqual({ bar: false, tick: true, icon: true });
    // No custom cap beside plain squares
    expect(kit.bar(5, 10)).toBe('🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜');
    expect(kit.e('coin')).toBe(markup('coin', reg));
  });

  test('one missing icon puts the icons on fallback, but not the bars', () => {
    const reg = registry({ without: ['garlic'] });
    const kit = createKit(reg);
    expect(kit.ready).toEqual({ bar: true, tick: true, icon: false });
    expect(kit.e('coin')).toBe('🪙');
    expect(kit.bar(1, 1, { width: 2 })).toBe(['bgl', 'bgr'].map(c => markup(c, reg)).join(''));
  });
});
