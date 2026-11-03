/**
 * /siege attack lines (src/data/siegeAttackLines.js) are a contract with the
 * siege engine, which picks an outcome by the game rules and then a random line
 * of that outcome. A typo'd outcome would silently never be picked, a stray
 * placeholder would show up as literal "{foo}" in the channel, and a plural
 * monster name ("Gremlins") breaks any line that conjugates a verb on it. The
 * counts are pinned because the fight balance depends on the mix.
 */

import { SIEGE_ATTACK_LINES } from '../src/data/siegeAttackLines.js';

const EXPECTED = {
  food: { hit: 30, miss: 12, backfire: 8 },
  doom: { doomed: 30, escaped: 10, backfired: 10 },
  potion: { worked: 26, backfired: 10 },
};
const MAX_LINE = 220;

// Same list as tests/siege-monsters.test.js: strong swearing, slurs and sexual
// terms. PG-13 horror-comedy; "damn" and cartoon gore are fine. Whole words only.
const BANNED = [
  'fuck', 'fucking', 'cunt', 'nigger', 'faggot', 'fag', 'retard', 'retarded',
  'rape', 'raped', 'whore', 'slut', 'porn', 'sex', 'sexy', 'nazi', 'cock', 'dick', 'pussy',
];
const bannedRe = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'i');

const count = (text, needle) => text.split(needle).length - 1;
const all = Object.entries(SIEGE_ATTACK_LINES).flatMap(([weapon, lines]) =>
  lines.map((line, i) => ({ weapon, i, label: `${weapon}[${i}]`, ...line })));

describe('siege attack lines: shape', () => {
  test('has exactly the food, doom and potion weapons, frozen', () => {
    expect(Object.keys(SIEGE_ATTACK_LINES).sort()).toEqual(['doom', 'food', 'potion']);
    expect(Object.isFrozen(SIEGE_ATTACK_LINES)).toBe(true);
  });

  test.each(Object.keys(EXPECTED))('%s has exactly the expected count of each outcome', (weapon) => {
    const tally = {};
    for (const line of SIEGE_ATTACK_LINES[weapon]) tally[line.outcome] = (tally[line.outcome] || 0) + 1;
    expect(tally).toEqual(EXPECTED[weapon]);
  });

  test('every outcome is valid for its weapon', () => {
    const bad = all.filter((l) => !Object.keys(EXPECTED[l.weapon]).includes(l.outcome)).map((l) => `${l.label}: ${l.outcome}`);
    expect(bad).toEqual([]);
  });

  test('every line is { text, outcome } and nothing else', () => {
    const bad = all.filter((l) => typeof l.text !== 'string' || l.text.trim() === '').map((l) => l.label);
    expect(bad).toEqual([]);
    for (const weapon of Object.keys(SIEGE_ATTACK_LINES)) {
      for (const line of SIEGE_ATTACK_LINES[weapon]) expect(Object.keys(line).sort()).toEqual(['outcome', 'text']);
    }
  });
});

describe('siege attack lines: text rules', () => {
  test('{user} and {monster} each appear exactly once', () => {
    const bad = all.filter((l) => count(l.text, '{user}') !== 1 || count(l.text, '{monster}') !== 1).map((l) => l.label);
    expect(bad).toEqual([]);
  });

  test('no other placeholder', () => {
    const bad = all.filter((l) => l.text.replace(/\{user\}|\{monster\}/g, '').match(/[{}]/)).map((l) => l.label);
    expect(bad).toEqual([]);
  });

  test('{monster} reads right for singular and plural names', () => {
    // "the **The Blob**", "**Gremlins**'s" and "a **Killer Klowns**" all read wrong.
    const bad = all.filter((l) => /\b(?:the|a|an)\s+\{monster\}/i.test(l.text) || /\{monster\}'s/.test(l.text)).map((l) => l.label);
    expect(bad).toEqual([]);
  });

  test(`no line is over ${MAX_LINE} characters`, () => {
    const bad = all.filter((l) => l.text.length > MAX_LINE).map((l) => `${l.label} (${l.text.length})`);
    expect(bad).toEqual([]);
  });

  test('no duplicate lines', () => {
    const seen = new Set();
    const dupes = [];
    for (const l of all) {
      const key = l.text.toLowerCase();
      if (seen.has(key)) dupes.push(l.label);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  test('no @ (a stray mention would ping, or be mangled)', () => {
    expect(all.filter((l) => l.text.includes('@')).map((l) => l.label)).toEqual([]);
  });

  test('no banned words', () => {
    expect(all.filter((l) => bannedRe.test(l.text)).map((l) => l.label)).toEqual([]);
  });
});
