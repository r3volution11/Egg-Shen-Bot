/**
 * Escape Velocity's cards with the emoji kit (src/utils/escapeUI.js): the
 * climb as the kit's ladder, kit medals and streak flames in the standings.
 *
 * The ladder is the one place the formatting depends on the kit. Its
 * fallback, ▰▱ blocks, lines up only in a code span, so it comes in
 * backticks; custom emoji don't render inside a code span (they show as raw
 * `<:es_…:…>` text), so once the kit's bars are uploaded it must come
 * without them. kit.ladder owns that choice — nothing here may wrap it.
 *
 * Whole events, end to end, are in tests/escape-sim.test.js.
 *
 * Run with: npm test -- tests/escape-ui.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { dashboard, runOver, missionCard, standingsEmbed } from '../src/utils/escapeUI.js';
import { createKit, KIT_CODES } from '../src/utils/emojiKit.js';

const registry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
const uploaded = createKit(registry);
const E = (code) => `<:${registry.get(code).name}:${registry.get(code).id}>`;
const fallback = createKit(null);

const NOW = Date.UTC(2026, 9, 21, 15, 0, 0);
const DAY = 86400000;

const question = { text: 'Who directed Halloween (1978)?', options: ['John Carpenter', 'Wes Craven', 'Tobe Hooper', 'Sam Raimi'], genre: 'horror', subgenre: 'slasher', media: 'movie' };
/** A run on stage 7: six cleared, one separation behind it */
const run = (over = {}) => ({ id: 'r1', userId: 'pilot1', day: '2026-10-21', stage: 7, banked: 2000, status: 'active', final: 1000, ...over });

/** Every code span in a text */
const spans = (text) => (text || '').match(/`[^`]*`/g) || [];

/** Blue ladder pieces: a capped bar per group of five */
const group = (n) => {
  const colours = Array.from({ length: 5 }, (_, i) => (i < n ? 'b' : 'e'));
  return colours.map((c, i) => E(`b${c}${i === 0 ? 'l' : i === 4 ? 'r' : 'm'}`)).join('');
};

describe('the climb', () => {
  test('fallback: the ▰▱ ladder in a code span, gaps at the separations, as always', () => {
    const climb = dashboard(run(), question, { kit: fallback }).embeds[0].toJSON().fields.find(f => f.name === 'Climb');
    expect(climb.value).toBe('`▰▰▰▰▰ ▰▱▱▱▱ ▱▱▱▱▱`');
  });

  test('kit uploaded: three capped blue bars, and never inside backticks', () => {
    const climb = dashboard(run(), question, { kit: uploaded }).embeds[0].toJSON().fields.find(f => f.name === 'Climb');
    expect(climb.value).toBe(`${group(5)} ${group(1)} ${group(0)}`);
    expect(climb.value).not.toContain('`');
  });

  test('the run-over card: the same ladder, in backticks only in fallback', () => {
    const failed = run({ status: 'failed' });
    const plain = runOver(failed, { kit: fallback }).embeds[0].toJSON().description;
    expect(plain).toContain('\n\n`▰▰▰▰▰ ▰▱▱▱▱ ▱▱▱▱▱`\n\n');

    const custom = runOver(failed, { kit: uploaded }).embeds[0].toJSON().description;
    expect(custom).toContain(`\n\n${group(5)} ${group(1)} ${group(0)}\n\nYour next launch window`);
    // No custom emoji inside a code span anywhere on it
    for (const span of spans(custom)) expect(span).not.toContain('<:');

    const orbit = runOver(run({ status: 'orbit', final: 1000000 }), { kit: uploaded }).embeds[0].toJSON().description;
    expect(orbit).toContain(`\n\n${group(5)} ${group(5)} ${group(5)}\n\n`);
  });

  test('no custom emoji in a title or footer, on the dashboard or the run-over card', () => {
    for (const payload of [dashboard(run(), question, { kit: uploaded }), runOver(run({ status: 'aborted' }), { kit: uploaded })]) {
      const d = payload.embeds[0].toJSON();
      expect(`${d.title}${d.footer?.text}`).not.toContain('<:');
      for (const text of [d.description, ...(d.fields || []).map(f => f.value)]) {
        for (const span of spans(text)) expect(span).not.toContain('<:');
      }
    }
  });
});

describe('the standings', () => {
  /** Four players: three on the podium, two with streaks */
  const data = () => ({
    event: { name: 'Sim Launch', status: 'live', startsAt: NOW - DAY, endsAt: NOW + DAY, genres: ['horror'], media: ['movie'] },
    players: {
      a: { bestRun: { winnings: 4000, stage: 8, at: 1 }, streak: { current: 3, best: 3 } },
      b: { bestRun: { winnings: 2000, stage: 7, at: 2 }, streak: { current: 1, best: 2 } },
      c: { bestRun: { winnings: 1000, stage: 5, at: 3 }, streak: { current: 2, best: 2 } },
      d: { bestRun: { winnings: 100, stage: 1, at: 4 }, streak: { current: 0, best: 1 } },
    },
    runs: {},
  });

  test('kit medals for the podium, a kit flame and a pill for two days in a row or more', () => {
    expect(standingsEmbed(data(), NOW, { kit: uploaded }).toJSON().description.split('\n')).toEqual([
      `${E('med1')} <@a> — **4,000** · stage 8 🛰️ · ${E('flame')} \`3\``,
      `${E('med2')} <@b> — **2,000** · stage 7 🛰️`,
      `${E('med3')} <@c> — **1,000** · stage 5 🛰️ · ${E('flame')} \`2\``,
      '**4.** <@d> — **100** · stage 1 🛰️',
    ]);
    expect(standingsEmbed(data(), NOW, { kit: fallback }).toJSON().description.split('\n')[0]).toBe('🥇 <@a> — **4,000** · stage 8 🛰️ · 🔥 `3`');
  });

  test('the mission card shows the same standings', () => {
    const d = missionCard(data(), NOW, { kit: uploaded }).embeds[0].toJSON();
    expect(d.description).toContain(`**Standings** · 4 players\n${E('med1')} <@a> — **4,000**`);
    expect(`${d.title}${d.footer?.text}`).not.toContain('<:');
  });
});
