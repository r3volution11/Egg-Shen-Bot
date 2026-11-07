/**
 * The /siege monster roster (src/data/siegeMonsters.js) is a contract with
 * the siege engine, which reads these fields blind. A missing line or a
 * misspelled trait key would only show up in a live fight, so this pins the
 * whole shape, and the voice rules the file's header promises.
 */

import { MONSTERS, MONSTER_KEYS } from '../src/data/siegeMonsters.js';

const TRAIT_KEYS = [
  'missHeal', 'actHeal', 'silverMult', 'hitBonus', 'poisonMult', 'loot',
  'grabCount', 'grabTop', 'poisonOnly', 'poisonCount', 'poisonForever', 'actWeights',
];
const BOOLEAN_TRAITS = ['grabTop', 'poisonOnly', 'poisonForever'];
const NUMBER_TRAITS = TRAIT_KEYS.filter((k) => k !== 'actWeights' && !BOOLEAN_TRAITS.includes(k));
// 2.75.0: {jack} (the Jack Burton, the killing blow) beside {mvp} (the Wang Chi), defeat lines only
const PLACEHOLDERS = ['mvp', 'jack', 'monster', 'fighter'];
const MAX_LINE = 200;

// Strong swearing, slurs and sexual terms. The tone is PG-13 horror-comedy:
// "damn" and cartoon gore are fine, these are not. Whole words only, so
// "class" and "Scunthorpe" never trip it.
const BANNED = [
  'fuck', 'fucking', 'cunt', 'nigger', 'faggot', 'fag', 'retard', 'retarded',
  'rape', 'raped', 'whore', 'slut', 'porn', 'sex', 'sexy', 'nazi', 'cock', 'dick', 'pussy',
];
const bannedRe = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'i');

/** Every line a monster owns, flat, with a label for the failure message */
function allLines(key) {
  const { lines } = MONSTERS[key];
  const out = [];
  for (const [kind, value] of Object.entries(lines)) {
    (Array.isArray(value) ? value : [value]).forEach((text, i) => out.push({ label: `${key}.${kind}[${i}]`, kind, text }));
  }
  return out;
}

const everyLine = MONSTER_KEYS.flatMap(allLines);

describe('siege monsters: roster', () => {
  test('has the eleven monsters, and MONSTER_KEYS lists them', () => {
    expect(MONSTER_KEYS).toEqual([
      'blob', 'gremlins', 'count', 'wolfman', 'klowns', 'pods', 'shark', 'them', 'thing', 'lizard', 'horseman',
    ]);
    expect(MONSTER_KEYS).toEqual(Object.keys(MONSTERS));
  });

  test('the roster is frozen', () => {
    expect(Object.isFrozen(MONSTERS)).toBe(true);
    expect(Object.isFrozen(MONSTER_KEYS)).toBe(true);
  });
});

describe.each(MONSTER_KEYS)('siege monster %s', (key) => {
  const m = MONSTERS[key];

  test('has every required field, of the right type', () => {
    expect(typeof m.name).toBe('string');
    expect(m.name.trim()).not.toBe('');
    expect(typeof m.emoji).toBe('string');
    expect(m.emoji.trim()).not.toBe('');
    expect(typeof m.weight).toBe('number');
    expect(typeof m.hp).toBe('number');
    expect(m.months === null || Array.isArray(m.months)).toBe(true);
    expect(m.minutes === null || typeof m.minutes === 'number').toBe(true);
    expect(typeof m.damage).toBe('object');
    expect(typeof m.traits).toBe('object');
    expect(m.traits).not.toBeNull();
    expect(typeof m.about).toBe('string');
    expect(m.about.trim()).not.toBe('');
    expect(typeof m.lines).toBe('object');
  });

  test('weight is positive and hp is 0.5-2', () => {
    expect(m.weight).toBeGreaterThan(0);
    expect(m.hp).toBeGreaterThanOrEqual(0.5);
    expect(m.hp).toBeLessThanOrEqual(2);
  });

  test('damage has exactly food, doom and potion, each 0.25-3', () => {
    expect(Object.keys(m.damage).sort()).toEqual(['doom', 'food', 'potion']);
    for (const weapon of ['food', 'doom', 'potion']) {
      expect(typeof m.damage[weapon]).toBe('number');
      expect(m.damage[weapon]).toBeGreaterThanOrEqual(0.25);
      expect(m.damage[weapon]).toBeLessThanOrEqual(3);
    }
  });

  test('months is null or real UTC month numbers; minutes is null or 15-120', () => {
    if (m.months !== null) {
      expect(m.months.length).toBeGreaterThan(0);
      for (const month of m.months) {
        expect(Number.isInteger(month)).toBe(true);
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
      }
    }
    if (m.minutes !== null) {
      expect(Number.isInteger(m.minutes)).toBe(true);
      expect(m.minutes).toBeGreaterThanOrEqual(15);
      expect(m.minutes).toBeLessThanOrEqual(120);
    }
  });

  test('every trait key is a documented one, with the right type', () => {
    for (const [trait, value] of Object.entries(m.traits)) {
      expect(TRAIT_KEYS).toContain(trait);
      if (BOOLEAN_TRAITS.includes(trait)) expect(value).toBe(true);
      if (NUMBER_TRAITS.includes(trait)) {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      }
    }
    if (m.traits.actWeights) {
      expect(Object.keys(m.traits.actWeights).sort()).toEqual(['grab', 'poison', 'roar']);
      const total = Object.values(m.traits.actWeights).reduce((a, b) => a + b, 0);
      expect(total).toBe(100);
    }
  });

  test('has exactly the documented line kinds', () => {
    expect(Object.keys(m.lines).sort()).toEqual(['arrive', 'defeat', 'escape', 'grab', 'poison', 'roar']);
    for (const kind of ['arrive', 'defeat', 'escape']) expect(typeof m.lines[kind]).toBe('string');
    for (const kind of ['grab', 'poison', 'roar']) {
      expect(Array.isArray(m.lines[kind])).toBe(true);
      expect(m.lines[kind]).toHaveLength(3);
    }
  });

  test('defeat names the MVP', () => {
    expect(m.lines.defeat).toContain('{mvp}');
  });

  test('grab lines name the fighter and tell people to /rescue', () => {
    for (const line of m.lines.grab) {
      expect(line).toContain('{fighter}');
      expect(line).toContain('/rescue');
    }
  });

  test('poison lines name the fighter and point to a /potion', () => {
    for (const line of m.lines.poison) {
      expect(line).toContain('{fighter}');
      expect(line).toContain('/potion');
    }
  });

  test('roar lines name the monster', () => {
    for (const line of m.lines.roar) expect(line).toContain('{monster}');
  });
});

describe('siege monsters: the traits the engine reads', () => {
  test('the headline numbers match the design', () => {
    expect(MONSTERS.gremlins.traits.missHeal).toBe(0.02);
    expect(MONSTERS.wolfman.traits).toMatchObject({ actHeal: 0.015, silverMult: 5 });
    expect(MONSTERS.them.traits.hitBonus).toBe(2);
    expect(MONSTERS.count.traits.poisonMult).toBe(0.5);
    expect(MONSTERS.count.traits.actWeights).toEqual({ grab: 55, poison: 30, roar: 15 });
    expect(MONSTERS.klowns.traits.grabCount).toBe(2);
    expect(MONSTERS.thing.traits.grabTop).toBe(true);
    expect(MONSTERS.pods.traits).toMatchObject({ poisonOnly: true, poisonCount: 2, poisonForever: true });
    expect(MONSTERS.lizard.traits.loot).toBe(2);
    expect(MONSTERS.lizard.minutes).toBe(60);
    expect(MONSTERS.horseman.traits.loot).toBe(2);
    expect(MONSTERS.horseman.months).toEqual([10]);
  });

  test('only the Horseman is seasonal', () => {
    expect(MONSTER_KEYS.filter((k) => MONSTERS[k].months !== null)).toEqual(['horseman']);
  });
});

describe('siege monsters: every line', () => {
  test('uses only the placeholders {mvp}, {jack}, {monster} and {fighter}', () => {
    for (const { label, text } of everyLine) {
      for (const [, name] of text.matchAll(/\{([^}]*)\}/g)) {
        if (!PLACEHOLDERS.includes(name)) throw new Error(`${label} has unknown placeholder {${name}}: ${text}`);
      }
      // A stray brace that isn't a whole placeholder would print raw
      const stripped = text.replace(/\{(mvp|jack|monster|fighter)\}/g, '');
      if (/[{}]/.test(stripped)) throw new Error(`${label} has a stray brace: ${text}`);
    }
  });

  test('only defeat uses {mvp} and {jack}, and only grab/poison use {fighter}', () => {
    for (const { label, kind, text } of everyLine) {
      if (text.includes('{mvp}') && kind !== 'defeat') throw new Error(`${label} uses {mvp}`);
      if (text.includes('{jack}') && kind !== 'defeat') throw new Error(`${label} uses {jack}`);
      if (text.includes('{fighter}') && !['grab', 'poison'].includes(kind)) throw new Error(`${label} uses {fighter}`);
    }
  });

  test(`is non-empty and at most ${MAX_LINE} characters`, () => {
    for (const { label, text } of everyLine) {
      expect(text.trim()).not.toBe('');
      if (text.length > MAX_LINE) throw new Error(`${label} is ${text.length} characters: ${text}`);
    }
  });

  test('has no duplicates, across every monster', () => {
    const seen = new Map();
    for (const { label, text } of everyLine) {
      const norm = text.trim().toLowerCase();
      if (seen.has(norm)) throw new Error(`${label} duplicates ${seen.get(norm)}: ${text}`);
      seen.set(norm, label);
    }
  });

  test('mentions nobody: no @ in any line', () => {
    // The engine pings people separately; names here are display names only.
    for (const { label, text } of everyLine) {
      if (text.includes('@') || /<[@#]/.test(text)) throw new Error(`${label} contains a mention: ${text}`);
    }
  });

  test('keeps to the PG-13 tone: no banned words', () => {
    for (const { label, text } of everyLine) {
      const hit = text.match(bannedRe);
      if (hit) throw new Error(`${label} contains banned word "${hit[0]}": ${text}`);
    }
    for (const key of MONSTER_KEYS) {
      expect(MONSTERS[key].about).not.toMatch(bannedRe);
    }
  });

  test('the banned-word check itself can fail', () => {
    expect(bannedRe.test('well that is fucking great')).toBe(true);
    expect(bannedRe.test('a classic Scunthorpe assassin')).toBe(false);
  });
});
